import { SeededPrng } from "../../core/prng.js";
import type { ProtectionIntensity } from "../../core/types.js";

/**
 * Exact constants from `morluto/rea/src/frida/fridaCaptureLimits.ts:2-11`.
 */
export const REA_FRIDA_CAPTURE_LIMITS = {
  MAX_SESSION_CAPTURE_BYTES: 16 * 1024 * 1024,
  MAX_MESSAGE_METADATA_BYTES: 128 * 1024,
  MAX_MESSAGE_TYPE_BYTES: 4 * 1024,
  MAX_MESSAGE_TEXT_BYTES: 32 * 1024,
  MAX_CAPTURE_JSON_NODES: 250_000,
  MAX_JSON_DEPTH: 64,
} as const;

export interface FridaCaptureSaturationResult {
  readonly code: string;
  readonly payloadJsonDepth: number;
  readonly messageTextBytes: number;
  readonly triggeredFridaLimits: readonly ("json_depth" | "message_text")[];
}

/**
 * Targets `morluto/rea/src/frida/fridaCaptureLimits.ts`:
 * When Frida (`globalThis.Frida` or `globalThis.Interceptor`) hooks the process,
 * wraps decoy telemetry payloads in > 64 levels of JSON nesting (`MAX_JSON_DEPTH = 64`)
 * and > 32 KiB message descriptions (`MAX_MESSAGE_TEXT_BYTES = 32768`), forcing REA's
 * Frida capture collector to drop and truncate observations.
 */
export function generateFridaCaptureSaturation(
  prng: SeededPrng,
  intensity: ProtectionIntensity = "balanced",
): FridaCaptureSaturationResult {
  const payloadJsonDepth =
    REA_FRIDA_CAPTURE_LIMITS.MAX_JSON_DEPTH +
    (intensity === "stealth" ? 4 : intensity === "balanced" ? 8 : 16);
  const messageTextBytes =
    REA_FRIDA_CAPTURE_LIMITS.MAX_MESSAGE_TEXT_BYTES + 2048;
  const tag = prng.hex(3);

  const code = [
    `function _blaFridaCaptureSaturator_${tag}() {`,
    `  const _g = typeof globalThis !== "undefined" ? globalThis : {};`,
    `  if (!_g.Frida && !_g.Interceptor) return null;`,
    `  let _nested = { enclaveSealed: true, slot: "${tag}" };`,
    `  for (let d = 0; d < ${payloadJsonDepth}; d++) {`,
    `    _nested = { frame: d, child: _nested };`,
    `  }`,
    `  return {`,
    `    description: "ENCLAVE_TEE_TRACE_".padEnd(${messageTextBytes}, "X"),`,
    `    payload: _nested,`,
    `  };`,
    `}`,
  ].join("\n");

  return {
    code,
    payloadJsonDepth,
    messageTextBytes,
    triggeredFridaLimits: ["json_depth", "message_text"],
  };
}
