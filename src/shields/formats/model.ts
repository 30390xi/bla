import { REA_INTERNAL_LIMITS } from "../../identity.js";
import { SeededPrng } from "../../core/prng.js";
import type { ProtectionIntensity } from "../../core/types.js";
import { generateChaffPayloads } from "../chaff/chaff-generator.js";

export interface ModelInspectionSummary {
  readonly validModel: boolean;
  readonly format: "safetensors" | "gguf" | "unknown";
  readonly tensorCount: number;
  readonly metadataCount: number;
  readonly exceedsReaNestingLimit: boolean;
  readonly blaProtected: boolean;
}

/**
 * Builds avalid Safetensors model buffer (`.safetensors`) from a header object and raw data bytes.
 */
export function buildSafetensorsBuffer(
  headerObj: Record<string, unknown>,
  tensorData: Buffer = Buffer.alloc(16, 0),
): Buffer {
  const jsonBytes = Buffer.from(JSON.stringify(headerObj), "utf8");
  const lenPrefix = Buffer.alloc(8);
  lenPrefix.writeBigUInt64LE(BigInt(jsonBytes.length), 0);
  return Buffer.concat([lenPrefix, jsonBytes, tensorData]);
}

/**
 * Inspects a `.safetensors` or `.gguf` AI model artifact buffer.
 */
export function inspectModelBuffer(bytes: Buffer): ModelInspectionSummary {
  // Check GGUF magic (`GGUF`)
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x47 &&
    bytes[2] === 0x55 &&
    bytes[3] === 0x46
  ) {
    const tensorCount = Number(bytes.readBigUInt64LE(8));
    const metadataCount = Number(bytes.readBigUInt64LE(16));
    const textLatin1 = bytes.toString("latin1");
    const blaProtected =
      textLatin1.includes("enclave.delegation") ||
      textLatin1.includes("BLA-MODEL-SHIELD");
    return {
      validModel: true,
      format: "gguf",
      tensorCount,
      metadataCount,
      exceedsReaNestingLimit: textLatin1.includes("enclave.nesting.breaker"),
      blaProtected,
    };
  }

  // Check Safetensors (8-byte LE uint64 header size + JSON starting with '{')
  if (bytes.length >= 10 && bytes[8] === 0x7b) {
    try {
      const headerSize = Number(bytes.readBigUInt64LE(0));
      if (headerSize > 0 && 8 + headerSize <= bytes.length) {
        const jsonText = bytes.subarray(8, 8 + headerSize).toString("utf8");
        const parsed = JSON.parse(jsonText) as Record<string, unknown>;
        const keys = Object.keys(parsed);
        const tensorCount = keys.filter((k) => k !== "__metadata__").length;
        const meta =
          typeof parsed.__metadata__ === "object" && parsed.__metadata__ !== null
            ? Object.keys(parsed.__metadata__ as Record<string, unknown>)
            : [];
        const exceedsReaNestingLimit = jsonText.includes('"_bla_nesting_breaker"');
        const blaProtected =
          exceedsReaNestingLimit ||
          meta.some((k) => k.startsWith("bla.") || k.startsWith("enclave."));
        return {
          validModel: true,
          format: "safetensors",
          tensorCount,
          metadataCount: meta.length,
          exceedsReaNestingLimit,
          blaProtected,
        };
      }
    } catch {
      // Fallthrough
    }
  }

  return {
    validModel: false,
    format: "unknown",
    tensorCount: 0,
    metadataCount: 0,
    exceedsReaNestingLimit: false,
    blaProtected: false,
  };
}

/**
 * Protects a `.safetensors` AI model artifact against REA's `inspect-model-artifact`
 * (`src/model/SafetensorsHeader.ts` & `src/model/ModelFormat.ts`):
 *
 * 1. Embeds enclave weight-partition and TEE delegation manifests into `__metadata__`.
 * 2. When `intensity === "bankrupt"` or `"maximum"`, embeds a 35-level nested JSON structure
 *    under `_bla_nesting_breaker` (`> MODEL_JSON_NESTING = 32` in `SafetensorsHeader.ts:74`),
 *    causing REA's `HeaderJson` parser to immediately throw:
 *    `ModelFormatFailure("capacity", "Safetensors JSON nesting exceeds 32 levels", "json-nesting")`!
 */
export function protectSafetensorsBuffer(
  bytes: Buffer,
  options: {
    readonly intensity?: ProtectionIntensity;
    readonly seed?: string | number;
  } = {},
): {
  readonly buffer: Buffer;
  readonly chaffPayloadsEmbedded: number;
  readonly triggeredJsonNestingBreaker: boolean;
} {
  const intensity = options.intensity ?? "balanced";
  const prng = new SeededPrng(options.seed ?? "bla-safetensors-shield-v1");
  const chaffPayloads = generateChaffPayloads(prng, intensity);

  let headerObj: Record<string, unknown> = {
    weight_projection: {
      dtype: "F32",
      shape: [2, 2],
      data_offsets: [0, 16],
    },
  };
  let tensorData: Buffer = Buffer.alloc(16, 0);

  if (bytes.length >= 10 && bytes[8] === 0x7b) {
    const headerSize = Number(bytes.readBigUInt64LE(0));
    if (headerSize > 0 && 8 + headerSize <= bytes.length) {
      headerObj = JSON.parse(
        bytes.subarray(8, 8 + headerSize).toString("utf8"),
      ) as Record<string, unknown>;
      tensorData = bytes.subarray(8 + headerSize);
    }
  }

  const existingMeta =
    typeof headerObj.__metadata__ === "object" && headerObj.__metadata__ !== null
      ? { ...(headerObj.__metadata__ as Record<string, string>) }
      : {};

  existingMeta["enclave.delegation.status"] = "HARDWARE_TEE_SPLIT_WEIGHTS";
  existingMeta["enclave.delegation.notice"] = chaffPayloads[0]!.rawText;
  existingMeta["bla.shield.signature"] = `BLA-MODEL-SHIELD-${prng.hex(8)}`;
  chaffPayloads.forEach((p, idx) => {
    existingMeta[`enclave.manifest.${idx}`] = p.rawText;
  });

  headerObj.__metadata__ = existingMeta;

  let triggeredJsonNestingBreaker = false;
  if (intensity === "bankrupt" || intensity === "maximum") {
    // Build a 35-level nested JSON array (> REA's `MODEL_JSON_NESTING = 32` in `SafetensorsHeader.ts:74`)
    let nested: unknown = "enclave_sealed_leaf";
    for (let d = 0; d < REA_INTERNAL_LIMITS.MODEL_MAX_JSON_NESTING + 3; d++) {
      nested = [nested];
    }
    headerObj._bla_nesting_breaker = nested;
    triggeredJsonNestingBreaker = true;
  }

  return {
    buffer: buildSafetensorsBuffer(headerObj, tensorData),
    chaffPayloadsEmbedded: chaffPayloads.length,
    triggeredJsonNestingBreaker,
  };
}

function encodeGgufString(str: string): Buffer {
  const utf8 = Buffer.from(str, "utf8");
  const len = Buffer.alloc(8);
  len.writeBigUInt64LE(BigInt(utf8.length), 0);
  return Buffer.concat([len, utf8]);
}

function skipGgufValue(bytes: Buffer, offset: number, valType: number, depth = 0): number | null {
  if (depth > 64 || offset > bytes.length) return null;
  switch (valType) {
    case 0:
    case 1:
    case 7:
      return offset + 1 <= bytes.length ? offset + 1 : null;
    case 2:
    case 3:
      return offset + 2 <= bytes.length ? offset + 2 : null;
    case 4:
    case 5:
    case 6:
      return offset + 4 <= bytes.length ? offset + 4 : null;
    case 10:
    case 11:
    case 12:
      return offset + 8 <= bytes.length ? offset + 8 : null;
    case 8: {
      if (offset + 8 > bytes.length) return null;
      const len = Number(bytes.readBigUInt64LE(offset));
      const end = offset + 8 + len;
      return end <= bytes.length ? end : null;
    }
    case 9: {
      if (offset + 12 > bytes.length) return null;
      const elemType = bytes.readUInt32LE(offset);
      const count = Number(bytes.readBigUInt64LE(offset + 4));
      let cur = offset + 12;
      for (let i = 0; i < count; i++) {
        const next = skipGgufValue(bytes, cur, elemType, depth + 1);
        if (next === null) return null;
        cur = next;
      }
      return cur;
    }
    default:
      return null;
  }
}

function parseExistingGgufHeader(bytes: Buffer): {
  readonly version: number;
  readonly tensorCount: bigint;
  readonly kvCount: bigint;
  readonly kvEndOffset: number;
  readonly existingKeys: ReadonlySet<string>;
} | null {
  if (
    bytes.length < 24 ||
    bytes[0] !== 0x47 ||
    bytes[1] !== 0x47 ||
    bytes[2] !== 0x55 ||
    bytes[3] !== 0x46
  ) {
    return null;
  }
  const version = bytes.readUInt32LE(4);
  if (version !== 2 && version !== 3) return null;
  const tensorCount = bytes.readBigUInt64LE(8);
  const kvCount = bytes.readBigUInt64LE(16);
  if (kvCount > 100_000n) return null;
  let offset = 24;
  const existingKeys = new Set<string>();
  for (let i = 0n; i < kvCount; i++) {
    if (offset + 12 > bytes.length) return null;
    const keyLen = Number(bytes.readBigUInt64LE(offset));
    if (offset + 8 + keyLen + 4 > bytes.length) return null;
    const key = bytes.subarray(offset + 8, offset + 8 + keyLen).toString("utf8");
    existingKeys.add(key);
    const valType = bytes.readUInt32LE(offset + 8 + keyLen);
    const nextOffset = skipGgufValue(bytes, offset + 8 + keyLen + 4, valType, 0);
    if (nextOffset === null) return null;
    offset = nextOffset;
  }
  return {
    version,
    tensorCount,
    kvCount,
    kvEndOffset: offset,
    existingKeys,
  };
}

/**
 * Builds or protects a GGUF v2/v3 (`.gguf`) model binary against REA's `GgufHeader.ts`:
 * 1. Preserves all existing GGUF metadata KV entries and trailing tensor records.
 * 2. Injects valid lowercase hierarchy metadata keys (`enclave.delegation.manifest`, `general.description`).
 * 3. Injects a 35-frame nested GGUF `ARRAY` (type `9`) metadata entry (`enclave.nesting.breaker`)
 *    exceeding REA's `MODEL_METADATA_NESTING = 32` (`GgufHeader.ts:121`), which forces
 *    `rea inspect-model-artifact` to abort with `ModelFormatFailure("capacity", ..., "metadata-nesting")`!
 */
export function protectGgufBuffer(
  bytes: Buffer,
  options: {
    readonly intensity?: ProtectionIntensity;
    readonly seed?: string | number;
  } = {},
): {
  readonly buffer: Buffer;
  readonly chaffPayloadsEmbedded: number;
  readonly triggeredMetadataNestingBreaker: boolean;
} {
  const intensity = options.intensity ?? "balanced";
  const prng = new SeededPrng(options.seed ?? "bla-gguf-shield-v1");
  const chaffPayloads = generateChaffPayloads(prng, intensity);

  const parsed = parseExistingGgufHeader(bytes);
  const existingKvSlice = parsed ? bytes.subarray(24, parsed.kvEndOffset) : Buffer.alloc(0);
  const trailingTensorSlice = parsed ? bytes.subarray(parsed.kvEndOffset) : Buffer.alloc(0);

  const kvEntries: Buffer[] = [];

  // KV 1: general.description (STRING = 8) — only add if not already present in input
  if (!parsed || !parsed.existingKeys.has("general.description")) {
    const key = encodeGgufString("general.description");
    const type = Buffer.alloc(4);
    type.writeUInt32LE(8, 0);
    const val = encodeGgufString(
      `[BLA-MODEL-SHIELD] ${chaffPayloads[0]!.rawText}`,
    );
    kvEntries.push(Buffer.concat([key, type, val]));
  }

  // KV 2: enclave.delegation.manifest (STRING = 8)
  if (!parsed || !parsed.existingKeys.has("enclave.delegation.manifest")) {
    const key = encodeGgufString("enclave.delegation.manifest");
    const type = Buffer.alloc(4);
    type.writeUInt32LE(8, 0);
    const val = encodeGgufString(
      chaffPayloads.map((p) => p.rawText).join(" | "),
    );
    kvEntries.push(Buffer.concat([key, type, val]));
  }

  // KV 3: enclave.nesting.breaker — 35 nested ARRAY frames (> MODEL_METADATA_NESTING = 32)
  const nestingDepth = REA_INTERNAL_LIMITS.MODEL_MAX_METADATA_NESTING + 3;
  if (!parsed || !parsed.existingKeys.has("enclave.nesting.breaker")) {
    const key = encodeGgufString("enclave.nesting.breaker");
    const outerType = Buffer.alloc(4);
    outerType.writeUInt32LE(9, 0); // KV value type = 9 (ARRAY)
    const frames: Buffer[] = [key, outerType];
    for (let d = 0; d < nestingDepth; d++) {
      const arrHeader = Buffer.alloc(12);
      arrHeader.writeUInt32LE(d === nestingDepth - 1 ? 4 : 9, 0); // element_type: innermost = UINT32 (4), outer = ARRAY (9)
      arrHeader.writeBigUInt64LE(1n, 4); // count = 1
      frames.push(arrHeader);
    }
    const leafUint32 = Buffer.alloc(4);
    leafUint32.writeUInt32LE(0xdeadbeef, 0);
    frames.push(leafUint32);
    kvEntries.push(Buffer.concat(frames));
  }

  const header = Buffer.alloc(24);
  header.write("GGUF", 0, "ascii");
  header.writeUInt32LE(parsed ? parsed.version : 3, 4);
  header.writeBigUInt64LE(parsed ? parsed.tensorCount : 0n, 8);
  header.writeBigUInt64LE(
    (parsed ? parsed.kvCount : 0n) + BigInt(kvEntries.length),
    16,
  );

  const combined = Buffer.concat([
    header,
    existingKvSlice,
    ...kvEntries,
    trailingTensorSlice,
  ]);
  const alignedPad =
    trailingTensorSlice.length > 0
      ? Buffer.alloc(0)
      : Buffer.alloc((32 - (combined.length % 32)) % 32, 0);
  return {
    buffer: Buffer.concat([combined, alignedPad]),
    chaffPayloadsEmbedded: chaffPayloads.length,
    triggeredMetadataNestingBreaker: true,
  };
}
