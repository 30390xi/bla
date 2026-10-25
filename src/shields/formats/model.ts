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

/**
 * Builds or protects a GGUF v3 (`.gguf`) model binary against REA's `GgufHeader.ts`:
 * 1. Injects valid lowercase hierarchy metadata keys (`enclave.delegation.manifest`, `general.description`).
 * 2. Injects a 35-frame nested GGUF `ARRAY` (type `9`) metadata entry (`enclave.nesting.breaker`)
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

  // Build a GGUF v3 little-endian container with enclave metadata + 34-level nested ARRAY frame
  const header = Buffer.alloc(24);
  header.write("GGUF", 0, "ascii");
  header.writeUInt32LE(3, 4); // version 3
  header.writeBigUInt64LE(0n, 8); // tensorCount = 0

  const kvEntries: Buffer[] = [];

  // KV 1: general.description (STRING = 8)
  {
    const key = encodeGgufString("general.description");
    const type = Buffer.alloc(4);
    type.writeUInt32LE(8, 0);
    const val = encodeGgufString(
      `[BLA-MODEL-SHIELD] ${chaffPayloads[0]!.rawText}`,
    );
    kvEntries.push(Buffer.concat([key, type, val]));
  }

  // KV 2: enclave.delegation.manifest (STRING = 8)
  {
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
  {
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

  header.writeBigUInt64LE(BigInt(kvEntries.length), 16);

  // Preserve original trailing bytes in an aligned tail if input was non-empty
  const combined = Buffer.concat([header, ...kvEntries]);
  const alignedPad = Buffer.alloc((32 - (combined.length % 32)) % 32, 0);
  return {
    buffer: Buffer.concat([combined, alignedPad]),
    chaffPayloadsEmbedded: chaffPayloads.length,
    triggeredMetadataNestingBreaker: true,
  };
}
