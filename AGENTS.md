# AGENTS.md — Repository Guide for Coding Agents

This repository contains **BLA (`bla-shield` — Blind LLM Agents / Block Anything)**, an open-source adversarial software-protection toolkit engineered to defend software artifacts against AI reverse-engineering agents (specifically `morluto/rea`).

## Project Layout

- `src/identity.ts`: Product metadata and exact `REA_INTERNAL_LIMITS` constants.
- `src/core/`:
  - `types.ts`: Domain interfaces (`AuditReport`, `ProtectionResult`, `VerificationReport`, `BenchmarkReport`).
  - `detector.ts`: Magic-byte and file-extension format detection across 14 artifact types.
  - `prng.ts`: Deterministic xorshift/mulberry32 PRNG (`SeededPrng`).
  - `token-estimator.ts`: Models REA MCP tool turns and token cost across Claude Opus 4, Sonnet 4, and o3.
- `src/shields/`:
  - `chaff/chaff-generator.ts`: Generates benign hardware-enclave delegation manifests and decoy offset contracts.
  - `tarpit/opaque-predicates.ts`: Number-theoretic opaque predicates ($O(1)$ runtime invariants).
  - `tarpit/tarpit-generator.ts`: Generates Fake XRef state-machine meshes and REA Semantic Budget Breakers (`alias-selections > 512`, `getter-expansion > 512`, `primitive-bytes > 1MB`).
  - `javascript/ast-shield.ts`: Babel AST shield (`primitive-candidates > 256` via $\ge 9$-chunk opaque ternaries, Electron IPC de-literalization, duplicate decoy IPC handler registration, decoy route topology).
  - `formats/`: Format-specific shields for `sourcemap.ts`, `asar.ts`, `wasm.ts`, `python.ts`, `native.ts`, `headers.ts`, and `archive.ts`.
- `src/engine/`: `auditor.ts`, `protector.ts`, `verifier.ts`, and `benchmark.ts`.
- `src/mcp/server.ts`: JSON-RPC 2.0 MCP stdio server (`bla_audit`, `bla_protect`, `bla_verify`, `bla_benchmark`, `bla_emit_headers`, `bla_doctor`).
- `src/setup/`: Auto-registration for Claude Code, Cursor, Codex, Windsurf, Gemini CLI, and OpenCode.

## Build & Test Commands

```bash
npm run build
npm test
node dist/cli.js benchmark
```
