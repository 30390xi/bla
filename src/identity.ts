export const BLA_IDENTITY = Object.freeze({
  name: "BLA",
  fullName: "Blind LLM Agents",
  packageName: "bla-agents",
  packageAlias: "bla-shield",
  cliBinary: "bla",
  cliAlias: "bla-agents",
  version: "1.1.0",
  slogan: "Poison -> Exhaust -> Hallucinate. Make Reverse Engineering Bankrupt Again.",
  counterpart: {
    name: "REA",
    fullName: "Reverse Engineer Anything",
    packageName: "rea-agents",
    slogan: "Decompile -> Understand -> Recreate",
  },
  repositoryUrl: "https://github.com/qybaihe/bla",
  mcpServerName: "bla",
  skillName: "blind-llm-agents",
});

/**
 * Exact internal resource limits & sentinels extracted from REA (`morluto/rea`):
 * - `src/domain/javascript/javascriptSemanticResourceLimits.ts`
 * - `src/domain/javascript/javascriptStaticAnalysis.ts`
 * - `src/domain/electron/electronFuses.ts` & `src/electron/ElectronFuseReader.ts`
 * - `src/rust/RustBinaryImage.ts` & `src/rust/RustAuditableReader.ts`
 * - `src/flutter/FlutterPayloadScan.ts`
 * - `src/sqlite/SqliteDatabaseLimits.ts` & `src/sqlite/SqliteDatabaseInspection.ts`
 * - `src/model/ModelFormat.ts` (`SafetensorsHeader.ts` & `GgufHeader.ts`)
 * - `src/domain/wasm/wasmInterface.ts`
 * - `src/dotnet/ManagedDecodeBudget.ts`
 */
export const REA_INTERNAL_LIMITS = Object.freeze({
  /** Maximum distinct alternatives retained in one normalized primitive value (`SEMANTIC_PRIMITIVE_CANDIDATE_LIMIT`). */
  SEMANTIC_PRIMITIVE_CANDIDATE_LIMIT: 256,
  /** Maximum active expression nesting during inert semantic evaluation (`SEMANTIC_EXPRESSION_DEPTH_LIMIT`). */
  SEMANTIC_EXPRESSION_DEPTH_LIMIT: 256,
  /** Getter jobs and local result work retained in one precise query (`SEMANTIC_GETTER_EXPANSION_LIMIT`). */
  SEMANTIC_GETTER_EXPANSION_LIMIT: 512,
  /** Additional selector states retained by one precise alias query (`SEMANTIC_ALIAS_SELECTION_LIMIT`). */
  SEMANTIC_ALIAS_SELECTION_LIMIT: 512,
  /** Bound normalized strings and transient keys (`SEMANTIC_PRIMITIVE_JSON_BYTES_LIMIT`). */
  SEMANTIC_PRIMITIVE_JSON_BYTES_LIMIT: 1_048_576,
  /** Electron wrapper call-path expansion depth limit (`electronWrappedCallPaths.ts`). */
  ELECTRON_CALL_PATH_DEPTH_LIMIT: 128,
  /** Electron wrapper call-path visit limit (`electronWrappedCallPaths.ts`). */
  ELECTRON_CALL_PATH_VISIT_LIMIT: 1_000_000,
  /** Electron Fuse ASCII sentinel (`ELECTRON_FUSE_SENTINEL` in `electronFuses.ts`). */
  ELECTRON_FUSE_SENTINEL: "dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX",
  /** Maximum Electron fuse sentinels per slice (`maximumSentinelsPerSlice` in `ElectronFuseReader.ts`). */
  ELECTRON_MAX_SENTINELS_PER_SLICE: 32,
  /** Maximum inferred rustc commit hashes in `RustBinaryImage.ts` (`MAX_RUSTC_HASHES`). */
  RUST_MAX_COMMIT_HASHES: 64,
  /** Compressed `.dep-v0` section limit in `RustAuditableReader.ts` (`RUST_SECTION_BYTES`). */
  RUST_DEP_V0_SECTION_BYTES: 1_048_576,
  /** Maximum distinct Dart AOT snapshot hashes in `FlutterPayloadScan.ts` (`MAX_SNAPSHOT_HASH_CANDIDATES`). */
  DART_MAX_SNAPSHOT_HASH_CANDIDATES: 64,
  /** Maximum toolchain lines in `FlutterPayloadScan.ts` (`MAX_TOOLCHAIN_LINES`). */
  DART_MAX_TOOLCHAIN_LINES: 4,
  /** Maximum Safetensors JSON nesting depth (`MODEL_JSON_NESTING` in `ModelFormat.ts`). */
  MODEL_MAX_JSON_NESTING: 32,
  /** Maximum GGUF array metadata nesting frames (`MODEL_METADATA_NESTING` in `ModelFormat.ts`). */
  MODEL_MAX_METADATA_NESTING: 32,
  /** SQLite inspection JSON reply budget (`SQLITE_DATABASE_LIMITS.outputBytes` = 16 MiB). */
  SQLITE_OUTPUT_BYTES_LIMIT: 16_777_216,
  /** WASM typed interface representation budget (`WASM_INTERFACE_REPRESENTATION_BYTES` = 32 MiB). */
  WASM_INTERFACE_REPRESENTATION_BYTES: 33_554_432,
  /** .NET Managed metadata representation budget (`MAX_METADATA_REPRESENTATION_BYTES` = 64 MiB). */
  MANAGED_METADATA_REPRESENTATION_BYTES: 67_108_864,
});
