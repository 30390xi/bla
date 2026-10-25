export const BLA_IDENTITY = Object.freeze({
  name: "BLA",
  fullName: "Blind LLM Agents (Block Anything)",
  packageName: "bla-shield",
  cliBinary: "bla",
  cliAlias: "bla-shield",
  version: "1.0.0",
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
 * Exact internal resource limits extracted from REA (`morluto/rea`):
 * - `src/domain/javascript/javascriptSemanticResourceLimits.ts`
 * - `src/domain/javascript/javascriptStaticAnalysis.ts`
 * - `src/rust/RustBinaryImage.ts`
 * - `src/rust/RustAuditableReader.ts`
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
  /** Maximum inferred rustc commit hashes in `RustBinaryImage.ts` (`MAX_RUSTC_HASHES`). */
  RUST_MAX_COMMIT_HASHES: 64,
  /** Compressed `.dep-v0` section limit in `RustAuditableReader.ts` (`RUST_SECTION_BYTES`). */
  RUST_DEP_V0_SECTION_BYTES: 1_048_576,
});
