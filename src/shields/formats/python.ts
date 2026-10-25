import { SeededPrng } from "../../core/prng.js";
import type { ProtectionIntensity } from "../../core/types.js";
import { generateChaffPayloads } from "../chaff/chaff-generator.js";
import { generatePythonTarpit } from "../tarpit/tarpit-generator.js";

export interface PythonPycInspectionSummary {
  readonly validPyc: boolean;
  readonly magicNumber: number;
  readonly pep552Flags: number;
  readonly extractedStrings: readonly string[];
  readonly blaProtected: boolean;
}

/**
 * Protects a Python `.py` source file by injecting an interconnected Python
 * Algorithmic Tarpit (`generatePythonTarpit`), opaque predicates, and
 * honey-docstrings while preserving shebangs and `from __future__` imports.
 */
export function protectPythonSource(
  source: string,
  options: {
    readonly intensity?: ProtectionIntensity;
    readonly seed?: string | number;
  } = {},
): {
  readonly code: string;
  readonly decoyFunctionsInjected: number;
  readonly crossReferenceEdges: number;
  readonly chaffPayloadsEmbedded: number;
} {
  const intensity = options.intensity ?? "balanced";
  const prng = new SeededPrng(options.seed ?? "bla-python-shield-v1");
  const chaffPayloads = generateChaffPayloads(prng, intensity);
  const tarpit = generatePythonTarpit(prng, intensity, chaffPayloads);

  const lines = source.split("\n");
  let insertIdx = 0;

  // Preserve leading shebang, encoding declarations, module docstring, and `from __future__` imports
  while (insertIdx < lines.length) {
    const trimmed = lines[insertIdx]!.trim();
    if (
      trimmed.startsWith("#") ||
      trimmed === "" ||
      trimmed.startsWith("from __future__")
    ) {
      insertIdx++;
      continue;
    }
    break;
  }

  const head = lines.slice(0, insertIdx).join("\n");
  const tail = lines.slice(insertIdx).join("\n");
  const combined = [
    head,
    tarpit.code,
    tail,
  ]
    .filter((part) => part.length > 0)
    .join("\n\n");

  return {
    code: combined + "\n",
    decoyFunctionsInjected: tarpit.decoyFunctionNames.length,
    crossReferenceEdges: tarpit.crossReferenceEdges,
    chaffPayloadsEmbedded: chaffPayloads.length,
  };
}

/**
 * Inspects a CPython 3.7–3.14 `.pyc` file header and scans for printable
 * marshal strings (matching REA's `inspect-python-pyc` / `PythonPycParser.ts`).
 */
export function inspectPythonPyc(bytes: Buffer): PythonPycInspectionSummary {
  if (bytes.length < 16 || bytes[2] !== 0x0d || bytes[3] !== 0x0a) {
    return {
      validPyc: false,
      magicNumber: 0,
      pep552Flags: 0,
      extractedStrings: [],
      blaProtected: false,
    };
  }

  const magicNumber = bytes.readUInt16LE(0);
  const pep552Flags = bytes.readUInt32LE(4);
  const textView = bytes.subarray(16).toString("latin1");
  const matches = textView.match(/[A-Za-z0-9_[\]:/. -]{6,}/g) ?? [];

  return {
    validPyc: true,
    magicNumber,
    pep552Flags,
    extractedStrings: matches.slice(0, 64),
    blaProtected: textView.includes("BLA-SHIELD") || textView.includes("Architecture Notice: Core business logic"),
  };
}

/**
 * Builds or shields a CPython `.pyc` bytecode artifact.
 * When protecting an existing `.pyc`, embeds a marshal-compatible honey constant
 * trailer or wraps the code object's constant pool so static `.pyc` analyzers
 * (`rea inspect-python-pyc` / `pycdc`) encounter decoy enclave code metadata.
 */
export function protectPythonPycBuffer(
  bytes: Buffer,
  options: {
    readonly intensity?: ProtectionIntensity;
    readonly seed?: string | number;
  } = {},
): {
  readonly buffer: Buffer;
  readonly chaffPayloadsEmbedded: number;
} {
  if (bytes.length < 16 || bytes[2] !== 0x0d || bytes[3] !== 0x0a) {
    throw new Error("Invalid CPython .pyc header (missing 0x0d 0x0a magic marker)");
  }

  const intensity = options.intensity ?? "balanced";
  const prng = new SeededPrng(options.seed ?? "bla-pyc-shield-v1");
  const chaffPayloads = generateChaffPayloads(prng, intensity);

  // Construct marshal-framed ASCII constant records (TYPE_ASCII = 0x61 + uint32LE length + utf8 bytes)
  const marshalRecords: Buffer[] = [];
  for (const payload of chaffPayloads) {
    const strBytes = Buffer.from(payload.rawText, "utf8");
    const header = Buffer.alloc(5);
    header[0] = 0x61; // TYPE_ASCII
    header.writeUInt32LE(strBytes.length, 1);
    marshalRecords.push(header, strBytes);
  }

  return {
    buffer: Buffer.concat([bytes, ...marshalRecords]),
    chaffPayloadsEmbedded: chaffPayloads.length,
  };
}
