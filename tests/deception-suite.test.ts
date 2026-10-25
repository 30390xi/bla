import { describe, expect, it } from "vitest";
import { SeededPrng } from "../src/core/prng.js";
import {
  generateArchitectureMirage,
  generateCounterReaDeceptionSuite,
  generateDecompilerPseudocodeIllusion,
  generateEvidenceContractPoison,
  generateSemanticHoneypot,
  generateShadowBusinessLogic,
} from "../src/shields/deception/index.js";

describe("Counter-REA Model-Misjudgment Induction Suite", () => {
  it("generates crystal-clear Shadow Business Logic across all 4 archetypes", () => {
    const prng = new SeededPrng("shadow-test");
    const res = generateShadowBusinessLogic(prng, "bankrupt");
    expect(res.archetypesInjected).toHaveLength(4);
    expect(res.shadowProceduresCreated).toHaveLength(4);
    expect(res.code).toContain("RFC8032-Ed25519-Shamir-3-of-5");
    expect(res.code).toContain("bla.enterprise.billing.v4");
    expect(res.code).toContain("TPM2.0-Quote-PCR0-PCR7");
  });

  it("embeds Evidence Contract competing-explanation lures targeting REA COMMON_DISCIPLINE", () => {
    const prng = new SeededPrng("evidence-poison");
    const res = generateEvidenceContractPoison(prng, "bankrupt");
    expect(res.lures).toHaveLength(4);
    expect(res.lures[0]!.decoyConfidenceScore).toBeGreaterThan(0.9);
    expect(res.code).toContain("vsock://16:9443");
  });

  it("generates gRPC/Protobuf architecture mirages and high-salience semantic honeypot functions", () => {
    const prng = new SeededPrng("mirage-honeypot");
    const mirage = generateArchitectureMirage(prng, "bankrupt");
    expect(mirage.decoyRpcMethods).toHaveLength(8);
    expect(mirage.code).toContain("AttestationAuthority/VerifyEnclaveQuote");

    const honeypot = generateSemanticHoneypot(prng, "bankrupt");
    expect(honeypot.baitSymbols).toHaveLength(8);
    expect(honeypot.baitSymbols[0]).toMatch(/^verifyEnterpriseMasterLicense_/);
  });

  it("creates shared-ArrayBuffer decompiler aliasing illusions and orchestrates the full deception suite", () => {
    const prng = new SeededPrng("illusion-suite");
    const illusion = generateDecompilerPseudocodeIllusion(prng, "maximum");
    expect(illusion.illusionPatternsInjected).toBe(3);
    expect(illusion.code).toContain("Int32Array(_rawBuf)");

    const suite = generateCounterReaDeceptionSuite(
      new SeededPrng("full-deception"),
      "bankrupt",
    );
    expect(suite.totalDeceptionNodesInjected).toBe(28);
    expect(suite.combinedJsCode).toContain("_blaGrpcServiceMirage_");
  });
});
