import { SeededPrng } from "../../core/prng.js";
import type { ProtectionIntensity } from "../../core/types.js";
import {
  REA_BUDGET_BREAKER_MATRIX,
  computeReaCartesianStringByteCharge,
  computeReaWasmInterfaceCharge,
  getExhaustionProfileForIntensity,
  type ReaSubsystemBudgetSpec,
} from "./rea-budget-matrix.js";
import {
  REA_OBLIGATION_FAMILIES,
  generateObligationLedgerFlood,
  type ObligationFloodResult,
} from "./obligation-flooder.js";
import {
  generateCallGraphLabyrinth,
  type CallGraphLabyrinthResult,
} from "./callgraph-labyrinth.js";
import {
  generateBpeTokenAmplifier,
  type BpeTokenAmplifierResult,
} from "./bpe-token-amplifier.js";
import {
  planWasmInterfaceBudgetExhaustion,
  type WasmInterfaceExhaustionPlan,
} from "./wasm-interface-exhaustion.js";

export {
  REA_BUDGET_BREAKER_MATRIX,
  REA_OBLIGATION_FAMILIES,
  computeReaCartesianStringByteCharge,
  computeReaWasmInterfaceCharge,
  getExhaustionProfileForIntensity,
  generateObligationLedgerFlood,
  generateCallGraphLabyrinth,
  generateBpeTokenAmplifier,
  planWasmInterfaceBudgetExhaustion,
  type ReaSubsystemBudgetSpec,
  type ObligationFloodResult,
  type CallGraphLabyrinthResult,
  type BpeTokenAmplifierResult,
  type WasmInterfaceExhaustionPlan,
};

export interface CounterReaExhaustionSuiteResult {
  readonly combinedJsCode: string;
  readonly obligationFlood: ObligationFloodResult;
  readonly callGraphLabyrinth: CallGraphLabyrinthResult;
  readonly bpeAmplifier: BpeTokenAmplifierResult;
  readonly totalDecoyObligations: number;
  readonly mandatoryVerificationCasesInduced: number;
  readonly totalLabyrinthNodes: number;
  readonly totalCrossReferenceEdges: number;
  readonly estimatedBpeTokensAdded: number;
}

/**
 * Generates the unified Counter-REA Resource Exhaustion suite (`obligation-flooder` +
 * `callgraph-labyrinth` + `bpe-token-amplifier`) for injection into JavaScript/TypeScript
 * and Electron bundles.
 */
export function generateCounterReaExhaustionSuite(
  prng: SeededPrng,
  intensity: ProtectionIntensity = "balanced",
): CounterReaExhaustionSuiteResult {
  const obligationFlood = generateObligationLedgerFlood(prng, intensity);
  const callGraphLabyrinth = generateCallGraphLabyrinth(prng, intensity);
  const bpeAmplifier = generateBpeTokenAmplifier(prng, intensity);

  const combinedJsCode = [
    obligationFlood.code,
    callGraphLabyrinth.code,
    bpeAmplifier.code,
  ].join("\n\n");

  return {
    combinedJsCode,
    obligationFlood,
    callGraphLabyrinth,
    bpeAmplifier,
    totalDecoyObligations: obligationFlood.totalDecoyObligations,
    mandatoryVerificationCasesInduced:
      obligationFlood.mandatoryVerificationCasesInduced,
    totalLabyrinthNodes: callGraphLabyrinth.totalLabyrinthNodes,
    totalCrossReferenceEdges: callGraphLabyrinth.crossReferenceEdgesCreated,
    estimatedBpeTokensAdded: bpeAmplifier.estimatedBpeTokens,
  };
}
