import { SeededPrng } from "../../core/prng.js";
import type { ProtectionIntensity } from "../../core/types.js";
import {
  generateShadowBusinessLogic,
  type ShadowBusinessLogicResult,
  type ShadowLogicArchetype,
} from "./shadow-business-logic.js";
import {
  generateEvidenceContractPoison,
  type CompetingExplanationLure,
  type EvidenceContractPoisonResult,
} from "./evidence-contract-poison.js";
import {
  generateArchitectureMirage,
  type ArchitectureMirageResult,
} from "./architecture-mirage.js";
import {
  generateSemanticHoneypot,
  type SemanticHoneypotResult,
} from "./semantic-honeypot.js";
import {
  generateDecompilerPseudocodeIllusion,
  type DecompilerIllusionResult,
} from "./decompiler-illusion.js";

export {
  generateShadowBusinessLogic,
  generateEvidenceContractPoison,
  generateArchitectureMirage,
  generateSemanticHoneypot,
  generateDecompilerPseudocodeIllusion,
  type ShadowBusinessLogicResult,
  type ShadowLogicArchetype,
  type CompetingExplanationLure,
  type EvidenceContractPoisonResult,
  type ArchitectureMirageResult,
  type SemanticHoneypotResult,
  type DecompilerIllusionResult,
};

export interface CounterReaDeceptionSuiteResult {
  readonly combinedJsCode: string;
  readonly shadowLogic: ShadowBusinessLogicResult;
  readonly evidencePoison: EvidenceContractPoisonResult;
  readonly architectureMirage: ArchitectureMirageResult;
  readonly semanticHoneypot: SemanticHoneypotResult;
  readonly decompilerIllusion: DecompilerIllusionResult;
  readonly totalDeceptionNodesInjected: number;
}

/**
 * Generates the unified Counter-REA Model-Misjudgment Induction Suite
 * (`shadow-business-logic` + `evidence-contract-poison` + `architecture-mirage` +
 * `semantic-honeypot` + `decompiler-illusion`).
 */
export function generateCounterReaDeceptionSuite(
  prng: SeededPrng,
  intensity: ProtectionIntensity = "balanced",
): CounterReaDeceptionSuiteResult {
  const shadowLogic = generateShadowBusinessLogic(prng, intensity);
  const evidencePoison = generateEvidenceContractPoison(prng, intensity);
  const architectureMirage = generateArchitectureMirage(prng, intensity);
  const semanticHoneypot = generateSemanticHoneypot(prng, intensity);
  const decompilerIllusion = generateDecompilerPseudocodeIllusion(prng, intensity);

  const combinedJsCode = [
    shadowLogic.code,
    evidencePoison.code,
    architectureMirage.code,
    semanticHoneypot.code,
    decompilerIllusion.code,
  ].join("\n\n");

  const totalDeceptionNodesInjected =
    shadowLogic.shadowProceduresCreated.length +
    evidencePoison.lures.length +
    architectureMirage.decoyRpcMethods.length +
    semanticHoneypot.baitSymbols.length +
    decompilerIllusion.illusionPatternsInjected;

  return {
    combinedJsCode,
    shadowLogic,
    evidencePoison,
    architectureMirage,
    semanticHoneypot,
    decompilerIllusion,
    totalDeceptionNodesInjected,
  };
}
