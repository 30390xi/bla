import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
import _generate from "@babel/generator";
import * as t from "@babel/types";
import { SeededPrng } from "../../core/prng.js";
import type { ProtectionIntensity } from "../../core/types.js";
import { generateChaffPayloads } from "../chaff/chaff-generator.js";
import { generateJsTarpitAndBudgetBreaker } from "../tarpit/tarpit-generator.js";

// Handle ESM/CJS default export interop in NodeNext
type TraverseFn = (typeof _traverse)["default"];
type GenerateFn = (typeof _generate)["default"];
const traverse: TraverseFn =
  typeof _traverse === "function"
    ? (_traverse as unknown as TraverseFn)
    : _traverse.default;
const generate: GenerateFn =
  typeof _generate === "function"
    ? (_generate as unknown as GenerateFn)
    : _generate.default;

export interface JsShieldTransformResult {
  readonly code: string;
  readonly decoyFunctionsInjected: number;
  readonly fakeCrossReferencesCreated: number;
  readonly primitiveCandidateBranchesCreated: number;
  readonly aliasSelectionStatesCreated: number;
  readonly ipcAmbiguitySitesInjected: number;
  readonly decoyRoutesInjected: number;
  readonly chaffPayloadsEmbedded: number;
}

const DECOY_ROUTES: readonly string[] = [
  "/internal/enclave/v2/attest-quote",
  "/internal/enclave/v2/seal-ledger-state",
  "/kms/v3/quorum/derive-session-ticket",
  "/kms/v3/tpm2/verify-monotonic-counter",
  "/api/v2/hsm/zero-knowledge-challenge",
  "/api/v2/enclave/vsock-tunnel-handshake",
  "/v1/sentinel/hardware-fingerprint-lease",
  "/v1/raft/consensus-state-snapshot",
  "/internal/sgx/quote-verification-service",
  "/internal/nitro/enclave-cid16-dispatch",
];

const IPC_METHODS = new Set(["handle", "handleOnce", "on", "once", "invoke", "send", "sendSync", "sendToHost"]);

/**
 * Splits a string literal into >= 9 conditional chunks `(cond ? realChunk : decoyChunk)`
 * joined with `+`.
 *
 * Why >= 9 chunks?
 * REA's `SEMANTIC_PRIMITIVE_CANDIDATE_LIMIT = 256` (`src/domain/javascript/javascriptSemanticResourceLimits.ts`).
 * When REA's symbolic evaluator sees 9+ binary conditional string terms added together,
 * the cartesian product of candidates is $2^9 = 512 > 256$ (or $2^{10} = 1024 > 256$),
 * which immediately forces REA to bail out with `semanticResourceLimitUnknown("primitive-candidates")`!
 *
 * At runtime, each condition uses `(Math.imul(_bla_s | k, (_bla_s | k) + 1) & 1) === 0`
 * (which is ALWAYS true because the product of two consecutive integers is always even!),
 * so the runtime expression evaluates to the EXACT original string in O(1)!
 */
function buildCombinatorialStringAst(
  value: string,
  prng: SeededPrng,
  seedIdentifierName: string,
): t.Expression {
  const minChunks = 9;
  const chunks: string[] = [];

  if (value.length >= minChunks) {
    const step = Math.max(1, Math.floor(value.length / minChunks));
    let pos = 0;
    for (let i = 0; i < minChunks - 1; i++) {
      chunks.push(value.slice(pos, pos + step));
      pos += step;
    }
    chunks.push(value.slice(pos));
  } else {
    for (const ch of value) {
      chunks.push(ch);
    }
    while (chunks.length < minChunks) {
      chunks.push("");
    }
  }

  const terms: t.Expression[] = chunks.map((realChunk, idx) => {
    const k = prng.nextInt(3, 125);
    const decoyChunk = realChunk.length > 0 ? prng.hex(realChunk.length) : prng.hex(2);
    // Opaque true: ((Math.imul(seed | k, (seed | k) + 1) & 1) === 0)
    const seededOr = t.binaryExpression("|", t.identifier(seedIdentifierName), t.numericLiteral(k));
    const seededPlusOne = t.binaryExpression("+", t.cloneNode(seededOr), t.numericLiteral(1));
    const imulCall = t.callExpression(
      t.memberExpression(t.identifier("Math"), t.identifier("imul")),
      [seededOr, seededPlusOne],
    );
    const bitAnd = t.binaryExpression("&", imulCall, t.numericLiteral(1));
    const cond = t.binaryExpression("===", bitAnd, t.numericLiteral(0));

    // Alternate polarity on odd indices so static heuristics see both true/false arms used
    if (idx % 2 === 0) {
      return t.conditionalExpression(
        cond,
        t.stringLiteral(realChunk),
        t.stringLiteral(decoyChunk),
      );
    } else {
      const invertedCond = t.binaryExpression("===", bitAnd, t.numericLiteral(1));
      return t.conditionalExpression(
        invertedCond,
        t.stringLiteral(decoyChunk),
        t.stringLiteral(realChunk),
      );
    }
  });

  let expr = terms[0]!;
  for (let i = 1; i < terms.length; i++) {
    expr = t.binaryExpression("+", expr, terms[i]!);
  }
  return expr;
}

function buildOpaqueFalseAst(prng: SeededPrng, seedIdentifierName: string): t.Expression {
  const k = prng.nextInt(5, 113);
  const seededOr = t.binaryExpression("|", t.identifier(seedIdentifierName), t.numericLiteral(k));
  const seededPlusOne = t.binaryExpression("+", t.cloneNode(seededOr), t.numericLiteral(1));
  const imulCall = t.callExpression(
    t.memberExpression(t.identifier("Math"), t.identifier("imul")),
    [seededOr, seededPlusOne],
  );
  const bitAnd = t.binaryExpression("&", imulCall, t.numericLiteral(1));
  return t.binaryExpression("===", bitAnd, t.numericLiteral(1));
}

export function transformJavaScriptWithBlaShield(
  source: string,
  options: {
    readonly intensity?: ProtectionIntensity;
    readonly seed?: string | number;
    readonly filename?: string;
  } = {},
): JsShieldTransformResult {
  const intensity = options.intensity ?? "balanced";
  const prng = new SeededPrng(options.seed ?? "bla-js-shield-v1");
  const chaffPayloads = generateChaffPayloads(prng, intensity);
  const tarpit = generateJsTarpitAndBudgetBreaker(prng, intensity, chaffPayloads);

  const ast = parse(source, {
    sourceType: "unambiguous",
    plugins: [
      "typescript",
      "jsx",
      "decorators-legacy",
      "importAttributes",
      "dynamicImport",
      "classProperties",
      "topLevelAwait",
    ],
    errorRecovery: true,
  });

  const seedVarName = `_bla_rt_${prng.hex(4)}`;
  const observedIpcChannels = new Set<string>();
  let primitiveCandidateBranchesCreated = 512; // From tarpit budgetFn
  let fakeCrossReferencesCreated = tarpit.crossReferenceEdges;
  let ipcAmbiguitySitesInjected = 0;

  // Track functions to weave tarpit calls into
  const functionBodies: t.BlockStatement[] = [];

  traverse(ast, {
    Function(path) {
      if (t.isBlockStatement(path.node.body)) {
        functionBodies.push(path.node.body);
      }
    },
    CallExpression(path) {
      const callee = path.node.callee;
      // 1. Check Electron IPC & contextBridge calls
      if (t.isMemberExpression(callee) && t.isIdentifier(callee.property)) {
        const methodName = callee.property.name;
        const objName = t.isIdentifier(callee.object) ? callee.object.name : "";

        // Electron IPC calls: ipcMain.handle("channel", ...), ipcRenderer.invoke("channel", ...)
        if (
          IPC_METHODS.has(methodName) &&
          (objName.toLowerCase().includes("ipc") ||
            methodName === "handle" ||
            methodName === "invoke" ||
            methodName === "sendToHost")
        ) {
          const firstArg = path.node.arguments[0];
          if (t.isStringLiteral(firstArg) && firstArg.value.length > 0) {
            observedIpcChannels.add(firstArg.value);
            path.node.arguments[0] = buildCombinatorialStringAst(
              firstArg.value,
              prng,
              seedVarName,
            );
            primitiveCandidateBranchesCreated += 512;
          }
        }

        // Electron contextBridge.exposeInMainWorld("apiKey", ...)
        if (methodName === "exposeInMainWorld") {
          const firstArg = path.node.arguments[0];
          if (t.isStringLiteral(firstArg) && firstArg.value.length > 0) {
            observedIpcChannels.add(`bridge:${firstArg.value}`);
            path.node.arguments[0] = buildCombinatorialStringAst(
              firstArg.value,
              prng,
              seedVarName,
            );
            primitiveCandidateBranchesCreated += 512;
          }
        }
      }

      // 2. Check fetch / route / SQL / crypto calls with string literal first arg
      const firstArg = path.node.arguments[0];
      if (
        t.isStringLiteral(firstArg) &&
        firstArg.value.length >= 4 &&
        !t.isImport(callee) &&
        !(t.isIdentifier(callee) && callee.name === "require")
      ) {
        const val = firstArg.value;
        const looksSensitiveOrRoute =
          val.startsWith("/") ||
          val.startsWith("http") ||
          val.includes("SELECT ") ||
          val.includes("INSERT ") ||
          val.includes("CREATE TABLE") ||
          val.includes("license") ||
          val.includes("secret") ||
          val.includes("token") ||
          val.includes("key") ||
          val.includes("pan") ||
          val.includes("clipboard") ||
          val.endsWith(".wasm");

        if (looksSensitiveOrRoute) {
          path.node.arguments[0] = buildCombinatorialStringAst(
            val,
            prng,
            seedVarName,
          );
          primitiveCandidateBranchesCreated += 512;
        }
      }
    },
  });

  // 3. Weave unreachable tarpit calls (Fake XRefs) into real function bodies
  for (const body of functionBodies) {
    if (tarpit.decoyFunctionNames.length >= 2) {
      const d1 = prng.pick(tarpit.decoyFunctionNames);
      const d2 = prng.pick(tarpit.decoyFunctionNames);
      const guard = t.ifStatement(
        buildOpaqueFalseAst(prng, seedVarName),
        t.blockStatement([
          t.expressionStatement(
            t.binaryExpression(
              "^",
              t.callExpression(t.identifier(d1), [t.numericLiteral(prng.nextInt(1, 255)), t.numericLiteral(2)]),
              t.callExpression(t.identifier(d2), [t.numericLiteral(prng.nextInt(1, 255)), t.numericLiteral(2)]),
            ),
          ),
        ]),
      );
      body.body.unshift(guard);
      fakeCrossReferencesCreated += 2;
    }
  }

  // 4. Build Decoy IPC Ambiguity & Route Mirage block
  const mirageLines: string[] = [];
  mirageLines.push(`const ${seedVarName} = 7;`);
  const channelsToMirror =
    observedIpcChannels.size > 0
      ? [...observedIpcChannels]
      : ["enclave:attest", "clipboard:bridge-sync", "license:verify-lease"];

  const decoyRouteCount =
    intensity === "stealth" ? 4 : intensity === "balanced" ? 8 : 10;
  const selectedDecoyRoutes = DECOY_ROUTES.slice(0, decoyRouteCount);

  mirageLines.push(
    `function _bla_registerDecoyIpcAndRoutes_${prng.hex(4)}(_ipcMain, _ipcRenderer, _router) {`,
  );
  mirageLines.push(`  if (((Math.imul(${seedVarName} | 11, (${seedVarName} | 11) + 1) & 1) === 1)) {`);
  for (const ch of channelsToMirror) {
    // Register duplicate ambiguous literal channels on both ipcMain and ipcRenderer
    // to defeat REA's unique exact literal IPC channel pairing rule!
    mirageLines.push(`    _ipcMain?.handle(${JSON.stringify(ch)}, () => ({ delegatedToEnclave: true, channel: ${JSON.stringify(ch)} }));`);
    mirageLines.push(`    _ipcMain?.on(${JSON.stringify(ch)}, () => ({ fallbackStub: true }));`);
    mirageLines.push(`    _ipcRenderer?.invoke(${JSON.stringify(ch)}, { probe: "enclave_shadow_1" });`);
    mirageLines.push(`    _ipcRenderer?.send(${JSON.stringify(ch)}, { probe: "enclave_shadow_2" });`);
    ipcAmbiguitySitesInjected += 4;
  }
  for (const route of selectedDecoyRoutes) {
    mirageLines.push(`    fetch(${JSON.stringify(route)});`);
    mirageLines.push(`    _router?.post?.(${JSON.stringify(route)}, () => null);`);
  }
  mirageLines.push(`  }`);
  mirageLines.push(`}`);

  // Parse the tarpit + mirage code and append/prepend to AST program while keeping module compatibility
  const usesCommonJs =
    source.includes("module.exports") ||
    source.includes("exports.") ||
    (!source.includes("export ") && source.includes("require("));

  const tarpitCodeNormalized = usesCommonJs
    ? tarpit.code.replace(/export function /g, "function ")
    : tarpit.code;

  const combinedInjectedAst = parse(
    `${mirageLines.join("\n")}\n${tarpitCodeNormalized}`,
    {
      sourceType: "unambiguous",
      plugins: ["typescript"],
    },
  );

  // Prepend `seedVarName` declaration at top of program (after any directives / imports)
  let insertIndex = 0;
  while (
    insertIndex < ast.program.body.length &&
    t.isImportDeclaration(ast.program.body[insertIndex]!)
  ) {
    insertIndex++;
  }

  const [seedDecl, ...restInjected] = combinedInjectedAst.program.body;
  if (seedDecl) {
    ast.program.body.splice(insertIndex, 0, seedDecl);
  }
  ast.program.body.push(...restInjected);

  // Strip any existing `//# sourceMappingURL=` comments from AST
  if (ast.comments) {
    ast.comments = ast.comments.filter(
      (c) => !/sourceMappingURL=/i.test(c.value),
    );
  }

  const generated = generate(
    ast,
    {
      retainLines: false,
      compact: false,
      comments: true,
    },
    source,
  );

  return {
    code: generated.code,
    decoyFunctionsInjected: tarpit.decoyFunctionNames.length + 1,
    fakeCrossReferencesCreated,
    primitiveCandidateBranchesCreated,
    aliasSelectionStatesCreated: 4_194_304, // 2^22 selector states in aliasFn
    ipcAmbiguitySitesInjected,
    decoyRoutesInjected: selectedDecoyRoutes.length,
    chaffPayloadsEmbedded: chaffPayloads.length,
  };
}
