# Changelog

All notable changes to **bla-agents** are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.0] — 2026-10-27

Counter-REA depth release: drift harness, graceful Node degradation, canary +
system-diagnostic deception across core formats, new analysis domains
(Go / Flutter / BEAM / EVM / PCAP / GPU-PTX), one-sentence `bla_harden` UX,
empirical REA red-team harness with real before/after metrics, and a 14-target
benchmark. Includes commit `1490af1` and all subsequent work through this tag.

### Added

- **REA constant drift harness** — catalog alignment checks (`verify:rea`) keep
  BLA budgets in lockstep with REA source constants.
- **Canary credential redaction honeypot + system-diagnostic rabbit hole** —
  extended from the initial landing into Python (`.py`/`.pyc`), WASM custom
  sections, SQLite metadata tables, Safetensors/GGUF model metadata, DEX,
  IL2CPP, Apple bplist, .NET managed assemblies, JVM `.class`, and ZIP/APK
  containers.
- **New shield domains**: framed Go buildinfo, Flutter URI/token pool
  exhaustion (mapped ELF sections), Erlang/OTP BEAM chunk + AtU8 atom
  exhaustion, EVM Solidity terminal metadata CBOR (approaches full 4 MiB
  `EVM_INTERFACE_LIMITS.inputBytes`), PCAP nested HTTP/DNS decoys past
  `TSHARK_JSON_MAX_BYTES`, NVIDIA PTX entry flood.
- **`bla_harden` one-sentence UX** with auto-discovery of mixed artifact types
  under a directory (CLI + MCP).
- **Empirical REA red-team harness** (`npm run redteam:rea`) — real REA
  before/after probes for Go, Flutter, BEAM, EVM, PCAP, GGUF, ASAR, WASM,
  SQLite, Electron fuses; regenerates `docs/redteam/empirical-rea-validation.{md,json}`.
- **Node 24 SQLite empirical path** — when `DatabaseSync.limits` is present,
  honey tables with generated `bla_enclave_unseal()` trap columns trip REA's
  `SqliteColumnEvaluationFailure` (soft-skips as `capability_gated` on Node 22).
- **Wabt WASM E2E empirical path** — with `REA_WABT_BIN_DIRECTORY` pointing at
  WABT 1.0.42, `WabtArtifactProvider` runs end-to-end; long-name export decoys
  force `ifaceState=partial` past `WASM_INTERFACE_REPRESENTATION_BYTES`
  (soft-skips to projected `WasmInterfaceBudget` when Wabt is absent).
- **14-target Counter-REA benchmark** (adds BEAM / EVM / PCAP / PTX to the
  prior showcase) with aggregate ~597× token amplification and 100% runtime
  equivalence across all targets.
- **Launch-ready README** with honest empirical-vs-estimate separation and
  current format coverage matrix (verified / designed-for / skipped).

### Changed

- **Graceful Node degradation** when `node:sqlite` is unavailable — non-SQLite
  CLI/MCP paths remain usable.
- **ASAR / WASM densification** past REA header / interface budgets; native
  ELF isolate sized so the showcase multiplier stays ~105.6×.
- **Flutter pool densification** past per-kind REA URI/token caps.
- CI / `verify:rea` / `redteam:rea` **soft-skip** when the sibling REA tree or
  optional tooling (tshark, Wabt, Node 24 `DatabaseSync.limits`) is absent so
  Node 22 and CI never hard-fail on optional empirical paths.

### Fixed

- Shield gaps where custom-section-only WASM densification did not expand
  REA's typed Wabt interface inventory — fixed by injecting real long-name
  export decoys that alias existing functions while preserving the original
  export surface, validate, and execute behavior.
- SQLite honey that disclosed schema under Node 24 without tripping REA's
  column-evaluation path — generated trap columns now force
  `SqliteColumnEvaluationFailure` on honey row selects.
- Safetensors shield that previously left REA `after=ok` — attaches a deep
  nested `bla_enclave_topology` **extra** key on the first tensor descriptor
  (HuggingFace ignores unknown fields; tensor bytes unchanged) so REA hits
  `MODEL_JSON_NESTING` / *Safetensors JSON nesting exceeds 32 levels*.

### Docs

- `docs/redteam/empirical-rea-validation.{md,json}` — live empirical results.
- `docs/releases/v1.4.0.md` — GitHub Release notes + publish checklist
  (do not run until a GitHub token is configured).

## [1.3.0]

Previous release. See git tag `bla-agents-1.3.0`.

[1.4.0]: https://github.com/qybaihe/bla/compare/bla-agents-1.3.0...bla-agents-1.4.0
[1.3.0]: https://github.com/qybaihe/bla/releases/tag/bla-agents-1.3.0
