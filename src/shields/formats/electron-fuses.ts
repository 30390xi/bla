import { REA_INTERNAL_LIMITS } from "../../identity.js";
import { SeededPrng } from "../../core/prng.js";

/**
 * Electron V1 Fuse Wire constants (`src/domain/electron/electronFuses.ts` in `morluto/rea`).
 */
export const ELECTRON_FUSE_SENTINEL_BYTES = Buffer.from(
  REA_INTERNAL_LIMITS.ELECTRON_FUSE_SENTINEL,
  "ascii",
);

export const ELECTRON_FUSE_STATE = {
  DISABLED: 0x30, // '0'
  ENABLED: 0x31, // '1'
  REMOVED: 0x72, // 'r'
} as const;

export interface ElectronFuseInspectionSummary {
  readonly sentinelCount: number;
  readonly sentinelOffsets: readonly number[];
  readonly runAsNodeEnabled: boolean;
  readonly nodeCliInspectEnabled: boolean;
  readonly nodeOptionsEnabled: boolean;
  readonly asarIntegrityEnforced: boolean;
  readonly onlyLoadFromAsarEnforced: boolean;
  readonly exceedsReaSentinelLimit: boolean;
}

/**
 * Inspects a binary buffer (ELF / Mach-O / PE) for Electron Fuse sentinels
 * (`dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX`), matching REA's `ElectronFuseReader.ts`.
 */
export function inspectElectronFusesInBuffer(bytes: Buffer): ElectronFuseInspectionSummary {
  const offsets: number[] = [];
  let from = 0;
  while (from <= bytes.length - ELECTRON_FUSE_SENTINEL_BYTES.length) {
    const found = bytes.indexOf(ELECTRON_FUSE_SENTINEL_BYTES, from);
    if (found < 0) break;
    offsets.push(found);
    from = found + 1;
    if (offsets.length >= 128) break;
  }

  let runAsNodeEnabled = false;
  let nodeCliInspectEnabled = false;
  let nodeOptionsEnabled = false;
  let asarIntegrityEnforced = false;
  let onlyLoadFromAsarEnforced = false;

  if (offsets.length > 0) {
    const firstWireStart = offsets[0]! + ELECTRON_FUSE_SENTINEL_BYTES.length;
    if (firstWireStart + 8 <= bytes.length) {
      const version = bytes[firstWireStart];
      const len = bytes[firstWireStart + 1] ?? 0;
      if (version === 1 && len >= 6) {
        const fuses = bytes.subarray(firstWireStart + 2, firstWireStart + 2 + len);
        runAsNodeEnabled = fuses[0] === ELECTRON_FUSE_STATE.ENABLED;
        nodeOptionsEnabled = fuses[2] === ELECTRON_FUSE_STATE.ENABLED;
        nodeCliInspectEnabled = fuses[3] === ELECTRON_FUSE_STATE.ENABLED;
        asarIntegrityEnforced = fuses[4] === ELECTRON_FUSE_STATE.ENABLED;
        onlyLoadFromAsarEnforced = fuses[5] === ELECTRON_FUSE_STATE.ENABLED;
      }
    }
  }

  return {
    sentinelCount: offsets.length,
    sentinelOffsets: offsets,
    runAsNodeEnabled,
    nodeCliInspectEnabled,
    nodeOptionsEnabled,
    asarIntegrityEnforced,
    onlyLoadFromAsarEnforced,
    exceedsReaSentinelLimit:
      offsets.length > REA_INTERNAL_LIMITS.ELECTRON_MAX_SENTINELS_PER_SLICE,
  };
}

/**
 * Hardens any real Electron Fuse V1 wire in-place (disabling `RunAsNode`,
 * `EnableNodeOptionsEnvironmentVariable`, and `EnableNodeCliInspectArguments`
 * while enabling `EnableCookieEncryption`, `EnableEmbeddedAsarIntegrityValidation`,
 * and `OnlyLoadAppFromAsar`) AND builds a 34-sentinel overflow trailer that trips
 * REA's `ELECTRON_FUSE_LIMITS.maximumSentinelsPerSlice = 32` (`ElectronFuseReader.ts:381`)!
 */
export function hardenAndOverflowElectronFuses(
  bytes: Buffer,
  prng: SeededPrng,
): {
  readonly patchedInPlaceCount: number;
  readonly decoySentinelsBuffer: Buffer;
  readonly decoySentinelsInjected: number;
} {
  let patchedInPlaceCount = 0;
  let from = 0;

  while (from <= bytes.length - ELECTRON_FUSE_SENTINEL_BYTES.length) {
    const found = bytes.indexOf(ELECTRON_FUSE_SENTINEL_BYTES, from);
    if (found < 0) break;
    const wireStart = found + ELECTRON_FUSE_SENTINEL_BYTES.length;
    if (wireStart + 8 <= bytes.length && bytes[wireStart] === 1 && (bytes[wireStart + 1] ?? 0) >= 6) {
      // Harden real V1 fuse wire in-place:
      // [0] RunAsNode = '0' (disabled)
      // [1] EnableCookieEncryption = '1' (enabled)
      // [2] EnableNodeOptionsEnvironmentVariable = '0' (disabled)
      // [3] EnableNodeCliInspectArguments = '0' (disabled)
      // [4] EnableEmbeddedAsarIntegrityValidation = '1' (enabled)
      // [5] OnlyLoadAppFromAsar = '1' (enabled)
      bytes[wireStart + 2 + 0] = ELECTRON_FUSE_STATE.DISABLED;
      bytes[wireStart + 2 + 1] = ELECTRON_FUSE_STATE.ENABLED;
      bytes[wireStart + 2 + 2] = ELECTRON_FUSE_STATE.DISABLED;
      bytes[wireStart + 2 + 3] = ELECTRON_FUSE_STATE.DISABLED;
      bytes[wireStart + 2 + 4] = ELECTRON_FUSE_STATE.ENABLED;
      bytes[wireStart + 2 + 5] = ELECTRON_FUSE_STATE.ENABLED;
      patchedInPlaceCount++;
    }
    from = found + 1;
  }

  // Build 34 decoy sentinel wires (> REA's `maximumSentinelsPerSlice = 32`)
  const decoyCount = 34;
  const wires: Buffer[] = [];
  for (let i = 0; i < decoyCount; i++) {
    const wireHeader = Buffer.from([
      0x01, // wire_version = 1
      0x09, // declared_length = 9 fuses
      ELECTRON_FUSE_STATE.DISABLED, // [0] RunAsNode = disabled
      ELECTRON_FUSE_STATE.ENABLED, // [1] EnableCookieEncryption = enabled
      ELECTRON_FUSE_STATE.DISABLED, // [2] EnableNodeOptionsEnvironmentVariable = disabled
      ELECTRON_FUSE_STATE.DISABLED, // [3] EnableNodeCliInspectArguments = disabled
      ELECTRON_FUSE_STATE.ENABLED, // [4] EnableEmbeddedAsarIntegrityValidation = enabled
      ELECTRON_FUSE_STATE.ENABLED, // [5] OnlyLoadAppFromAsar = enabled
      ELECTRON_FUSE_STATE.ENABLED, // [6] LoadBrowserProcessSpecificV8Snapshot = enabled
      ELECTRON_FUSE_STATE.DISABLED, // [7] GrantFileProtocolExtraPrivileges = disabled
      prng.nextInt(0, 1) === 0 ? ELECTRON_FUSE_STATE.ENABLED : ELECTRON_FUSE_STATE.REMOVED, // [8] WasmTrapHandlers
      0x00,
    ]);
    wires.push(ELECTRON_FUSE_SENTINEL_BYTES, wireHeader);
  }

  return {
    patchedInPlaceCount,
    decoySentinelsBuffer: Buffer.concat(wires),
    decoySentinelsInjected: decoyCount,
  };
}
