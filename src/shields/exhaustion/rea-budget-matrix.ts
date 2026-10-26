import type { ProtectionIntensity } from "../../core/types.js";

export interface ReaSubsystemBudgetSpec {
  readonly id: string;
  readonly reaSourceFile: string;
  readonly constantName: string;
  readonly hardLimit: number;
  readonly unit: "alternatives" | "states" | "bytes" | "levels" | "ms" | "ratio";
  readonly failureClassOrStatus: string;
  readonly counterStrategy: string;
}

/**
 * Exact 1:1 catalog of `morluto/rea` internal resource caps, parser limits,
 * and admission budgets extracted from REA's TypeScript source tree.
 */
export const REA_BUDGET_BREAKER_MATRIX: readonly ReaSubsystemBudgetSpec[] = [
  {
    id: "js-primitive-candidates",
    reaSourceFile: "src/domain/javascript/javascriptSemanticResourceLimits.ts",
    constantName: "SEMANTIC_PRIMITIVE_CANDIDATE_LIMIT",
    hardLimit: 256,
    unit: "alternatives",
    failureClassOrStatus: 'status: "unknown" (resourceLimit: "primitive-candidates")',
    counterStrategy:
      "Wrap string/numeric literals in 9-chunk opaque ternary chains (2^9 = 512 > 256 alternatives).",
  },
  {
    id: "js-expression-depth",
    reaSourceFile: "src/domain/javascript/javascriptSemanticResourceLimits.ts",
    constantName: "SEMANTIC_EXPRESSION_DEPTH_LIMIT",
    hardLimit: 256,
    unit: "levels",
    failureClassOrStatus: 'status: "unknown" (resourceLimit: "expression-depth")',
    counterStrategy:
      "Embed deeply nested arithmetic/logical identity expressions exceeding 256 AST levels.",
  },
  {
    id: "js-getter-expansion",
    reaSourceFile: "src/domain/javascript/javascriptSemanticResourceLimits.ts",
    constantName: "SEMANTIC_GETTER_EXPANSION_LIMIT",
    hardLimit: 512,
    unit: "states",
    failureClassOrStatus: 'status: "unknown" (resourceLimit: "getter-expansion")',
    counterStrategy:
      "Synthesize self-referential getter rings (`get next() { return this.next; }`) causing growing receiver cycles.",
  },
  {
    id: "js-alias-selections",
    reaSourceFile: "src/domain/javascript/javascriptSemanticResourceLimits.ts",
    constantName: "SEMANTIC_ALIAS_SELECTION_LIMIT",
    hardLimit: 512,
    unit: "states",
    failureClassOrStatus: 'status: "unknown" (resourceLimit: "alias-selections")',
    counterStrategy:
      "Generate >= 520 dynamic property selector states (`_blaAliasTbl[k]`) to overflow alias tracking.",
  },
  {
    id: "js-primitive-json-bytes",
    reaSourceFile: "src/domain/javascript/javascriptSemanticResourceLimits.ts",
    constantName: "SEMANTIC_PRIMITIVE_JSON_BYTES_LIMIT",
    hardLimit: 1_048_576,
    unit: "bytes",
    failureClassOrStatus: 'status: "unknown" (resourceLimit: "primitive-bytes")',
    counterStrategy:
      "Exploit `codeUnits * 6 + 2` Cartesian string concatenation budget (`32 x 32` 200-byte strings = 2.45 MB > 1 MiB).",
  },
  {
    id: "wasm-interface-representation",
    reaSourceFile: "src/domain/wasm/wasmInterface.ts",
    constantName: "WASM_INTERFACE_REPRESENTATION_BYTES",
    hardLimit: 33_554_432,
    unit: "bytes",
    failureClassOrStatus:
      'AnalysisResourceConstraintError("inspect_wasm_artifact", "capacity")',
    counterStrategy:
      "Maximize `1024 + (module.length + name.length + wat_form.length) * 6 + (params.length + results.length) * 16` per Wasm entry.",
  },
  {
    id: "sqlite-column-evaluation",
    reaSourceFile: "src/sqlite/SqliteDatabaseLimits.ts",
    constantName: "SqliteColumnEvaluationFailure",
    hardLimit: 1,
    unit: "states",
    failureClassOrStatus:
      'SqliteColumnEvaluationFailure("column-evaluation") on read-only snapshot',
    counterStrategy:
      "Inject VIRTUAL generated columns invoking application-defined scalar functions absent on REA's bare read-only connection.",
  },
  {
    id: "safetensors-json-nesting",
    reaSourceFile: "src/model/SafetensorsHeader.ts",
    constantName: "MODEL_JSON_NESTING",
    hardLimit: 32,
    unit: "levels",
    failureClassOrStatus: 'ModelFormatFailure("capacity", ..., "json-nesting")',
    counterStrategy:
      "Embed 35-level nested JSON array under `_bla_nesting_breaker` in Safetensors header.",
  },
  {
    id: "gguf-metadata-nesting",
    reaSourceFile: "src/model/GgufHeader.ts",
    constantName: "MODEL_METADATA_NESTING",
    hardLimit: 32,
    unit: "levels",
    failureClassOrStatus: 'ModelFormatFailure("capacity", ..., "metadata-nesting")',
    counterStrategy:
      "Embed 35-frame nested GGUF ARRAY (type 9) under `enclave.nesting.breaker`.",
  },
  {
    id: "cdp-script-source-budget",
    reaSourceFile: "src/domain/webRuntime.ts",
    constantName: "WEB_RUNTIME_LIMITS.sourceBytes",
    hardLimit: 33_554_432,
    unit: "bytes",
    failureClassOrStatus: "CDP_SCRIPT_SOURCE_BYTES_OMISSION_REASON",
    counterStrategy:
      "Detect CDP/Inspector runtime attachment and serve high-volume decoy script modules to exhaust passive source collection.",
  },
  {
    id: "lldb-trace-frames",
    reaSourceFile: "bridge/native/rea_lldb_tracer.py",
    constantName: "MAX_TRACE_FRAMES",
    hardLimit: 65_536,
    unit: "states",
    failureClassOrStatus: 'outcome: "resource-limit" (process.Kill())',
    counterStrategy:
      "Inject high-frequency decoy native call frames and deep backtraces so observe_native_calls hits 65,536 frames or 8 MiB and terminates the traced target.",
  },
  {
    id: "lldb-other-stops",
    reaSourceFile: "bridge/native/rea_lldb_tracer.py",
    constantName: "MAX_OTHER_STOPS",
    hardLimit: 256,
    unit: "states",
    failureClassOrStatus: 'outcome: "stop-limit" (process.Kill())',
    counterStrategy:
      "Emit >= 256 benign non-breakpoint stop observations so LLDB batch tracing aborts with stop-limit.",
  },
  {
    id: "gdb-command-output-records",
    reaSourceFile: "src/gdb/GdbSessionManager.ts",
    constantName: "MAX_COMMAND_OUTPUT_RECORDS",
    hardLimit: 16_384,
    unit: "states",
    failureClassOrStatus: "AnalysisResourceConstraintError (output truncated)",
    counterStrategy:
      "Churn hundreds of shadow heap slots on every call so GDB watchpoint/memory dump records exceed 16,384 MI lines.",
  },
  {
    id: "rizin-command-frames",
    reaSourceFile: "src/rizin/RizinDebugSessionManager.ts",
    constantName: "MAX_COMMAND_FRAMES",
    hardLimit: 4_096,
    unit: "states",
    failureClassOrStatus: "AnalysisResourceConstraintError (frame cap reached)",
    counterStrategy:
      "Flood Rizin runtime memory search/diff commands with synchronized shadow buffer mutations exceeding 4,096 frames.",
  },
  {
    id: "environment-compare-step-diff",
    reaSourceFile: "src/application/environment/environmentCompareDiff.ts",
    constantName: "STEP_DIFFERENCE_LIMIT",
    hardLimit: 20,
    unit: "states",
    failureClassOrStatus: "Step differences truncated at 20 entries per step",
    counterStrategy:
      "Mutate > 24 decoy state fields per step so real state diffs are pushed past REA's 20-difference per-step retention window.",
  },
] as const;

/**
 * Mirrors REA's exact `exceedsSemanticPrimitiveAdditionByteBudget` formula
 * (`src/domain/javascript/javascriptSemanticResourceLimits.ts:47`):
 * Each pair `(leftValue, rightValue)` is charged `(left.length + right.length) * 6 + 2` bytes!
 */
export function computeReaCartesianStringByteCharge(
  leftLengths: readonly number[],
  rightLengths: readonly number[],
): {
  readonly estimatedReaBytes: number;
  readonly exceedsReaOneMegabyteCap: boolean;
  readonly amplificationRatio: number;
} {
  let total = 0;
  let actualSourceBytes = 0;
  for (const l of leftLengths) actualSourceBytes += l;
  for (const r of rightLengths) actualSourceBytes += r;

  for (const l of leftLengths) {
    for (const r of rightLengths) {
      total += (l + r) * 6 + 2;
    }
  }

  return {
    estimatedReaBytes: total,
    exceedsReaOneMegabyteCap: total > 1_048_576,
    amplificationRatio:
      actualSourceBytes > 0
        ? Number((total / actualSourceBytes).toFixed(2))
        : 1,
  };
}

/**
 * Mirrors REA's exact `wasmInterfaceEntryRepresentationBytes` formula
 * (`src/domain/wasm/wasmInterface.ts:93`).
 */
export function computeReaWasmInterfaceCharge(entry: {
  readonly moduleName: string | null;
  readonly exportOrImportName: string;
  readonly watForm: string;
  readonly paramCount: number;
  readonly resultCount: number;
}): number {
  return (
    1024 +
    ((entry.moduleName?.length ?? 0) +
      entry.exportOrImportName.length +
      entry.watForm.length) *
      6 +
    (entry.paramCount + entry.resultCount) * 16
  );
}

/**
 * Returns recommended budget-breaker parameters for a given protection intensity.
 */
export function getExhaustionProfileForIntensity(intensity: ProtectionIntensity): {
  readonly ternaryChunkCount: number;
  readonly aliasSelectorCount: number;
  readonly cartesianBranchCount: number;
  readonly cartesianStringLength: number;
  readonly obligationDecoyFamilies: number;
  readonly sccClusterCount: number;
} {
  switch (intensity) {
    case "stealth":
      return {
        ternaryChunkCount: 9,
        aliasSelectorCount: 520,
        cartesianBranchCount: 24,
        cartesianStringLength: 180,
        obligationDecoyFamilies: 8,
        sccClusterCount: 2,
      };
    case "balanced":
      return {
        ternaryChunkCount: 9,
        aliasSelectorCount: 528,
        cartesianBranchCount: 28,
        cartesianStringLength: 220,
        obligationDecoyFamilies: 14,
        sccClusterCount: 4,
      };
    case "maximum":
      return {
        ternaryChunkCount: 10,
        aliasSelectorCount: 560,
        cartesianBranchCount: 32,
        cartesianStringLength: 240,
        obligationDecoyFamilies: 18,
        sccClusterCount: 6,
      };
    case "bankrupt":
      return {
        ternaryChunkCount: 11,
        aliasSelectorCount: 640,
        cartesianBranchCount: 36,
        cartesianStringLength: 260,
        obligationDecoyFamilies: 25,
        sccClusterCount: 8,
      };
  }
}
