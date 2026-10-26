import { describe, expect, it } from "vitest";
import { SeededPrng } from "../src/core/prng.js";
import {
  REA_BUDGET_BREAKER_MATRIX,
  REA_OBLIGATION_FAMILIES,
  computeReaCartesianStringByteCharge,
  computeReaWasmInterfaceCharge,
  generateBpeTokenAmplifier,
  generateCallGraphLabyrinth,
  generateCounterReaExhaustionSuite,
  generateObligationLedgerFlood,
  planWasmInterfaceBudgetExhaustion,
} from "../src/shields/exhaustion/index.js";

describe("Counter-REA Resource Exhaustion Suite", () => {
  it("models all 10 REA internal resource budgets and Cartesian byte amplification accurately", () => {
    expect(REA_BUDGET_BREAKER_MATRIX.length).toBeGreaterThanOrEqual(10);
    const left = Array(28).fill(220);
    const right = Array(28).fill(220);
    const charge = computeReaCartesianStringByteCharge(left, right);
    expect(charge.exceedsReaOneMegabyteCap).toBe(true);
    expect(charge.estimatedReaBytes).toBeGreaterThan(1_048_576);
    expect(charge.amplificationRatio).toBeGreaterThan(100);
  });

  it("floods all 25 REA ReconstructionObligationLedger families in bankrupt mode without runtime side effects", () => {
    const prng = new SeededPrng("test-obligation-flood");
    const flood = generateObligationLedgerFlood(prng, "bankrupt");
    expect(flood.totalDecoyObligations).toBe(REA_OBLIGATION_FAMILIES.length);
    expect(flood.mandatoryVerificationCasesInduced).toBeGreaterThanOrEqual(60);
    expect(flood.code).toContain("contextBridge");
    expect(flood.code).toContain("ipcRenderer");
    expect(flood.code).toContain("serviceWorker");

    // Verify safe O(1) runtime execution
    const fn = new Function(`${flood.code}; return typeof _blaObligationFlood_ !== "undefined";`);
    expect(fn).not.toThrow();
  });

  it("generates Tarjan SCC call-graph labyrinths with dense mutual recursion", () => {
    const prng = new SeededPrng("test-labyrinth");
    const lab = generateCallGraphLabyrinth(prng, "maximum");
    expect(lab.sccClusterCount).toBe(6);
    expect(lab.totalLabyrinthNodes).toBe(30);
    expect(lab.crossReferenceEdgesCreated).toBe(120);
    expect(lab.code).toContain(lab.entrySymbol);
  });

  it("amplifies BPE subword token density and WABT interface byte charges", () => {
    const prng = new SeededPrng("test-bpe-wasm");
    const bpe = generateBpeTokenAmplifier(prng, "bankrupt");
    expect(bpe.amplifiedIdentifiersCount).toBe(42);
    expect(bpe.tokensPerByteRatio).toBeGreaterThanOrEqual(0.55);

    const wasmPlan = planWasmInterfaceBudgetExhaustion(prng, "bankrupt");
    expect(wasmPlan.descriptors.length).toBe(72);
    expect(wasmPlan.byteAmplificationFactor).toBeGreaterThan(15);
    expect(
      computeReaWasmInterfaceCharge({
        moduleName: "enclave",
        exportOrImportName: "verify",
        watForm: "(func $verify)",
        paramCount: 8,
        resultCount: 2,
      }),
    ).toBeGreaterThan(1200);
  });

  it("orchestrates the full exhaustion suite deterministically", () => {
    const suiteA = generateCounterReaExhaustionSuite(
      new SeededPrng("seed-1"),
      "bankrupt",
    );
    const suiteB = generateCounterReaExhaustionSuite(
      new SeededPrng("seed-1"),
      "bankrupt",
    );
    expect(suiteA.combinedJsCode).toBe(suiteB.combinedJsCode);
    expect(suiteA.totalDecoyObligations).toBe(25);
    expect(suiteA.totalLabyrinthNodes).toBe(40);
  });
});
