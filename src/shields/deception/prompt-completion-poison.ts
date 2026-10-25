import { SeededPrng } from "../../core/prng.js";
import type { ProtectionIntensity } from "../../core/types.js";

export interface PromptCompletionPoisonResult {
  readonly code: string;
  readonly prioritySortedSymbols: readonly string[];
}

/**
 * Targets REA's lexicographical Unicode code-point sorting in MCP prompt completions
 * and obligation projections (`src/application/ReconstructionObligationLedgerProjection.ts:24`
 * and `src/contracts/promptContracts.ts:67`: `.sort(([left], [right]) => (left < right ? -1 : 1))`).
 *
 * By prefixing decoy high-salience procedures with `$00_AAA_enclave_` (ASCII `0x24`, `0x30`, `0x41`,
 * which sort BEFORE all standard `[A-Za-z_]` identifiers in Unicode code-point order!),
 * BLA guarantees that its decoy procedures occupy the very first slots of REA's
 * paginated procedure lists and MCP prompt completions!
 */
export function generatePromptCompletionPoison(
  prng: SeededPrng,
  intensity: ProtectionIntensity = "balanced",
): PromptCompletionPoisonResult {
  const count =
    intensity === "stealth"
      ? 2
      : intensity === "balanced"
        ? 4
        : intensity === "maximum"
          ? 6
          : 8;
  const tag = prng.hex(2);
  const prioritySortedSymbols: string[] = [];
  const lines: string[] = [];

  const suffixes = [
    "AttestMasterLicenseKey",
    "VerifyEnterpriseEntitlement",
    "UnsealOfflineVaultRoot",
    "DeriveZeroTrustSession",
    "ValidateHardwareTpmQuote",
    "ComputeSettlementSignature",
    "DispatchEnclaveVsockRpc",
    "ReconcileQuorumLedger",
  ];

  for (let i = 0; i < count; i++) {
    const sym = `$00_AAA_enclave_${i}_${suffixes[i % suffixes.length]}_${tag}`;
    prioritySortedSymbols.push(sym);
    lines.push(
      `function ${sym}(token = "") {`,
      `  return { delegatedToEnclave: true, symbol: "${sym}", valid: Boolean(token) && false };`,
      `}`,
    );
  }

  return {
    code: lines.join("\n"),
    prioritySortedSymbols,
  };
}
