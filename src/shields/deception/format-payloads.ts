import { SeededPrng } from "../../core/prng.js";
import type { ProtectionIntensity } from "../../core/types.js";
import {
  generateCanaryHoneypot,
  type CanaryHoneypotResult,
} from "./canary-honeypot.js";
import {
  generateSystemDiagnosticDecoy,
  type SystemDiagnosticDecoyResult,
} from "./system-diagnostic-decoy.js";

export interface FormatDeceptionPayloads {
  readonly canary: CanaryHoneypotResult;
  readonly diagnostics: SystemDiagnosticDecoyResult;
  /** Null-free UTF-8 text records suitable for embedding in binary formats. */
  readonly textRecords: readonly string[];
}

/**
 * Shared canary + system-diagnostic payload builder used by non-JS format
 * shields (Python, WASM, SQLite, Safetensors/GGUF, Native). Mirrors the wiring
 * already present in `native.ts` so every format trips the same REA transport
 * redaction and toolchain rabbit-hole surfaces.
 */
export function buildCanaryAndDiagnosticPayloads(
  prng: SeededPrng,
  intensity: ProtectionIntensity = "balanced",
): FormatDeceptionPayloads {
  const canary = generateCanaryHoneypot(prng, intensity);
  const diagnostics = generateSystemDiagnosticDecoy(prng, intensity);
  const textRecords = [
    ...canary.syntheticCanaryTokens.map(
      (tok) => `PROTECTED_CANARY_CREDENTIAL=${tok}`,
    ),
    ...canary.ambiguousCredentialUrls.map(
      (url) => `TRANSPORT_ENDPOINT=${url}`,
    ),
    ...canary.conflictingQueryUrls.map(
      (url) => `TRANSPORT_QUERY_CONFLICT=${url}`,
    ),
    ...diagnostics.diagnosticsInjected.map(
      (d) =>
        `[${d.subsystem}] ${d.errorClass} (${d.systemCode}): ${d.diagnosticMessage} Remediation: ${d.remediationRabbitHole}`,
    ),
  ];
  return { canary, diagnostics, textRecords };
}
