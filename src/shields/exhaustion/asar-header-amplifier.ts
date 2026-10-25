import { SeededPrng } from "../../core/prng.js";
import type { ProtectionIntensity } from "../../core/types.js";
import type { VirtualAsarFile } from "../formats/asar.js";

/**
 * Exact constants from `morluto/rea/src/domain/analysisResourceLimits.ts:7,15`.
 */
export const REA_ASAR_HEADER_LIMITS = {
  DEFAULT_ASAR_MAX_HEADER_BYTES: 16 * 1024 * 1024,
  MAXIMUM_ASAR_MAX_HEADER_BYTES: 256 * 1024 * 1024,
} as const;

/**
 * Generates virtual decoy enclave manifest entries inside an Electron `.asar` archive
 * to expand REA's `inspect_artifact` inventory graph (`src/artifacts/AsarFailure.ts`).
 */
export function generateAsarHeaderDecoyFiles(
  prng: SeededPrng,
  intensity: ProtectionIntensity = "balanced",
): readonly VirtualAsarFile[] {
  const count =
    intensity === "stealth"
      ? 4
      : intensity === "balanced"
        ? 8
        : intensity === "maximum"
          ? 16
          : 24;
  const tag = prng.hex(3);
  const files: VirtualAsarFile[] = [];

  for (let i = 0; i < count; i++) {
    const relPath = `enclave/shards/ring0-slot-${tag}-${i}.json`;
    const body = JSON.stringify({
      shardId: i,
      enclaveCid: 16,
      attestationHash: prng.hex(32),
      delegated: true,
    });
    files.push({
      relativePath: relPath,
      content: Buffer.from(body, "utf8"),
    });
  }

  return files;
}
