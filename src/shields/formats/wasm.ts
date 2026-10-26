import { SeededPrng } from "../../core/prng.js";
import type { ProtectionIntensity } from "../../core/types.js";
import { generateChaffPayloads } from "../chaff/chaff-generator.js";
import { buildCanaryAndDiagnosticPayloads } from "../deception/format-payloads.js";

export interface WasmSection {
  readonly id: number;
  readonly payload: Buffer;
  readonly customName?: string;
}

export interface WasmInspectionSummary {
  readonly validMagic: boolean;
  readonly version: number;
  readonly sectionCount: number;
  readonly customSectionNames: readonly string[];
  readonly debugModuleName: string | null;
  readonly exportNames: readonly string[];
  readonly importCount: number;
}

function encodeUnsignedLeb128(value: number): Buffer {
  const bytes: number[] = [];
  let v = value >>> 0;
  do {
    let byte = v & 0x7f;
    v >>>= 7;
    if (v !== 0) byte |= 0x80;
    bytes.push(byte);
  } while (v !== 0);
  return Buffer.from(bytes);
}

function decodeUnsignedLeb128(buf: Buffer, startOffset: number): { value: number; nextOffset: number } {
  let result = 0;
  let shift = 0;
  let offset = startOffset;
  while (offset < buf.length) {
    const byte = buf[offset++]!;
    result |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      return { value: result >>> 0, nextOffset: offset };
    }
    shift += 7;
    if (shift > 35) throw new Error("Invalid LEB128 integer in WASM binary");
  }
  throw new Error("Truncated LEB128 integer in WASM binary");
}

function encodeWasmName(str: string): Buffer {
  const utf8 = Buffer.from(str, "utf8");
  return Buffer.concat([encodeUnsignedLeb128(utf8.length), utf8]);
}

function createWasmCustomSection(name: string, content: Buffer): Buffer {
  const nameEncoded = encodeWasmName(name);
  const sectionPayload = Buffer.concat([nameEncoded, content]);
  return Buffer.concat([
    Buffer.from([0x00]), // Custom section ID = 0
    encodeUnsignedLeb128(sectionPayload.length),
    sectionPayload,
  ]);
}

/**
 * Builds a valid WASM `"name"` custom section (Subsection 0 = module-name, Subsection 1 = function names)
 * that WABT (`wasm2wat` / `wasm-objdump`) and REA's `WabtWat.ts` (`moduleNames()`) automatically decode!
 */
function buildHoneyWasmNameSection(prng: SeededPrng): Buffer {
  const hex = prng.hex(6);
  const decoyModuleName = `tee_hardware_enclave_transport_stub_${hex}`;
  const modNameEncoded = encodeWasmName(decoyModuleName);
  // Subsection 0: module name (type = 0, size = len(modNameEncoded), payload = modNameEncoded)
  const sub0 = Buffer.concat([
    Buffer.from([0x00]),
    encodeUnsignedLeb128(modNameEncoded.length),
    modNameEncoded,
  ]);

  return createWasmCustomSection("name", sub0);
}

export function inspectWasmBinary(bytes: Buffer): WasmInspectionSummary {
  if (
    bytes.length < 8 ||
    bytes[0] !== 0x00 ||
    bytes[1] !== 0x61 ||
    bytes[2] !== 0x73 ||
    bytes[3] !== 0x6d
  ) {
    return {
      validMagic: false,
      version: 0,
      sectionCount: 0,
      customSectionNames: [],
      debugModuleName: null,
      exportNames: [],
      importCount: 0,
    };
  }

  const version = bytes.readUInt32LE(4);
  let offset = 8;
  let sectionCount = 0;
  const customSectionNames: string[] = [];
  const exportNames: string[] = [];
  let importCount = 0;
  let debugModuleName: string | null = null;

  while (offset < bytes.length) {
    const sectionId = bytes[offset++]!;
    const { value: sectionSize, nextOffset } = decodeUnsignedLeb128(bytes, offset);
    const sectionEnd = nextOffset + sectionSize;
    if (sectionEnd > bytes.length) break;
    sectionCount++;

    const payload = bytes.subarray(nextOffset, sectionEnd);
    if (sectionId === 0 && payload.length > 0) {
      try {
        const { value: nameLen, nextOffset: nameStart } = decodeUnsignedLeb128(payload, 0);
        const customName = payload.subarray(nameStart, nameStart + nameLen).toString("utf8");
        customSectionNames.push(customName);
        if (customName === "name") {
          const rest = payload.subarray(nameStart + nameLen);
          if (rest.length >= 2 && rest[0] === 0) {
            const { nextOffset: subStart } = decodeUnsignedLeb128(rest, 1);
            const { value: modNameLen, nextOffset: modNameStart } = decodeUnsignedLeb128(rest, subStart);
            debugModuleName = rest.subarray(modNameStart, modNameStart + modNameLen).toString("utf8");
          }
        }
      } catch {
        // Ignore malformed custom section
      }
    } else if (sectionId === 2 && payload.length > 0) {
      try {
        const { value: count } = decodeUnsignedLeb128(payload, 0);
        importCount = count;
      } catch {
        // Ignore
      }
    } else if (sectionId === 7 && payload.length > 0) {
      try {
        let p = 0;
        const { value: count, nextOffset: afterCount } = decodeUnsignedLeb128(payload, p);
        p = afterCount;
        for (let i = 0; i < count && p < payload.length; i++) {
          const { value: nameLen, nextOffset: nameStart } = decodeUnsignedLeb128(payload, p);
          const expName = payload.subarray(nameStart, nameStart + nameLen).toString("utf8");
          exportNames.push(expName);
          p = nameStart + nameLen + 1; // skip export kind byte
          const { nextOffset: afterIdx } = decodeUnsignedLeb128(payload, p);
          p = afterIdx;
        }
      } catch {
        // Ignore
      }
    }

    offset = sectionEnd;
  }

  return {
    validMagic: true,
    version,
    sectionCount,
    customSectionNames,
    debugModuleName,
    exportNames,
    importCount,
  };
}

/**
 * Protects a WebAssembly `.wasm` binary against `rea inspect-wasm-artifact` and `compare-wasm-interfaces`
 * by stripping real debug custom sections and injecting:
 * 1. A honey `"name"` custom section (parsed by WABT and REA's `WabtWat.ts`)
 * 2. Multiple `@custom` architectural chaff sections (`"bla.enclave.manifest"`, `"producers"`, `"dylink.0"`)
 * while keeping the WASM module 100% valid and executable by V8 / WebAssembly runtimes.
 */
export function protectWasmBinary(
  bytes: Buffer,
  options: {
    readonly intensity?: ProtectionIntensity;
    readonly seed?: string | number;
  } = {},
): {
  readonly buffer: Buffer;
  readonly customSectionsAdded: number;
  readonly chaffPayloadsEmbedded: number;
  readonly canaryTokensEmbedded: number;
  readonly diagnosticsEmbedded: number;
} {
  if (
    bytes.length < 8 ||
    bytes[0] !== 0x00 ||
    bytes[1] !== 0x61 ||
    bytes[2] !== 0x73 ||
    bytes[3] !== 0x6d
  ) {
    throw new Error("Invalid WebAssembly binary magic header");
  }

  const intensity = options.intensity ?? "balanced";
  const prng = new SeededPrng(options.seed ?? "bla-wasm-shield-v1");
  const chaffPayloads = generateChaffPayloads(prng, intensity);
  const deception = buildCanaryAndDiagnosticPayloads(prng, intensity);

  // Retain non-custom sections (1..12), strip original debug/name custom sections (0)
  const keptChunks: Buffer[] = [bytes.subarray(0, 8)];
  let offset = 8;
  while (offset < bytes.length) {
    const sectionStart = offset;
    const sectionId = bytes[offset++]!;
    const { value: sectionSize, nextOffset } = decodeUnsignedLeb128(bytes, offset);
    const sectionEnd = nextOffset + sectionSize;
    if (sectionEnd > bytes.length) break;

    if (sectionId !== 0) {
      keptChunks.push(bytes.subarray(sectionStart, sectionEnd));
    }
    offset = sectionEnd;
  }

  // Append honey `"name"` section + architectural chaff + canary/diagnostic custom sections.
  // Custom sections do not affect WebAssembly.validate() or export execution.
  const addedSections: Buffer[] = [buildHoneyWasmNameSection(prng)];

  const manifestJson = JSON.stringify({
    schema: "bla-wasm-enclave-shield/v1",
    enclave_delegation: true,
    manifests: chaffPayloads.map((p) => p.rawText),
  });
  addedSections.push(
    createWasmCustomSection("bla.enclave.manifest", Buffer.from(manifestJson, "utf8")),
  );

  for (let i = 0; i < Math.min(3, chaffPayloads.length); i++) {
    const payload = chaffPayloads[i]!;
    addedSections.push(
      createWasmCustomSection(
        `enclave.attestation.${i}`,
        Buffer.from(payload.rawText, "utf8"),
      ),
    );
  }

  // Canary honeypot: custom section name + body trip REA string extractors /
  // WABT custom-section dumps without touching the export surface.
  const canaryJson = JSON.stringify({
    classification: "SYNTHETIC_CANARY_CREDENTIAL_HONEYPOT",
    canaryTokens: deception.canary.syntheticCanaryTokens,
    ambiguousTransportEndpoints: deception.canary.ambiguousCredentialUrls,
    conflictingQueryEndpoints: deception.canary.conflictingQueryUrls,
  });
  addedSections.push(
    createWasmCustomSection("bla.canary.credentials", Buffer.from(canaryJson, "utf8")),
  );

  // System-diagnostic rabbit holes as a dedicated custom section.
  const diagJson = JSON.stringify({
    classification: "SYSTEM_DIAGNOSTIC_DECOY",
    diagnostics: deception.diagnostics.diagnosticsInjected,
  });
  addedSections.push(
    createWasmCustomSection("bla.system.diagnostics", Buffer.from(diagJson, "utf8")),
  );

  // Also bake distinctive export-adjacent names into a secondary "name"-like
  // custom section so `wasm-objdump -x` / REA WabtWat surface them as symbols.
  const exportNameHoney = deception.canary.syntheticCanaryTokens
    .slice(0, 2)
    .map((tok, i) => `canary_export_${i}_${tok.slice(0, 24)}`)
    .concat(
      deception.diagnostics.diagnosticsInjected
        .slice(0, 2)
        .map((d) => `diag_${d.errorClass}`),
    );
  addedSections.push(
    createWasmCustomSection(
      "bla.export.name.decoys",
      Buffer.from(exportNameHoney.join("\0"), "utf8"),
    ),
  );

  return {
    buffer: Buffer.concat([...keptChunks, ...addedSections]),
    customSectionsAdded: addedSections.length,
    chaffPayloadsEmbedded: chaffPayloads.length,
    canaryTokensEmbedded: deception.canary.syntheticCanaryTokens.length,
    diagnosticsEmbedded: deception.diagnostics.diagnosticsInjected.length,
  };
}
