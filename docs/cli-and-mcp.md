# CLI & MCP Reference

This document specifies all command-line flags and Model Context Protocol (MCP) tool contracts provided by **BLA (`bla-shield`)**.

---

## 1. CLI Commands

### `bla audit <target>`

Simulates an REA (Reverse Engineer Anything) reconnaissance pass against `<target>` and computes an exposure score (`0-100`), leaked symbols, IPC channels, build metadata, and estimated attacker API cost.

```bash
bla audit <target> [--json]
```

- `<target>`: Path to `.js`, `.mjs`, `.cjs`, `.ts`, `.asar`, `.wasm`, `.py`, `.pyc`, ELF, Mach-O, PE, `.zip`, `.apk`, or directory.
- `--json`: Emit raw `AuditReport` JSON to stdout.

---

### `bla protect <target>`

Injects BLA's three-stage counter-agent shield (**Poison → Exhaust → Hallucinate**) into `<target>`.

```bash
bla protect <target> [options]
```

| Option | Default | Description |
| :--- | :--- | :--- |
| `-o, --output <path>` | `<target>.bla.<ext>` | Output path for protected artifact |
| `--in-place` | `false` | Overwrite `<target>` directly |
| `-m, --mode <mode>` | `bankrupt` | Protection profile: `stealth`, `balanced`, or `bankrupt` |
| `--tarpit-depth <n>` | Mode-dependent (`4`/`7`/`10`) | Call-graph depth of fake XRef state machines |
| `--tarpit-fanout <n>` | Mode-dependent (`2`/`3`/`4`) | Branch fanout per tarpit node |
| `--chaff-density <n>` | Mode-dependent (`2`/`4`/`6`) | Number of decoy architectural manifests injected |
| `--seed <string>` | Target basename | Deterministic PRNG seed for reproducible builds |
| `--no-sourcemap` | `false` | Skip emitting a companion `.map` honey source map for JS targets |
| `--json` | `false` | Emit raw `ProtectionResult` JSON to stdout |

---

### `bla verify <original> <protected>`

Verifies that `<protected>` preserves runtime exports and structural validity while neutralizing REA's static and semantic analyzers.

```bash
bla verify <original> <protected> [--json]
```

---

### `bla benchmark [target]`

Runs the empirical before/after Counter-REA benchmark suite across JavaScript, Electron IPC, Python, WebAssembly, and Native Rust/Go ELF binaries (or against a specific `<target>`).

```bash
bla benchmark [target] [--mode stealth|balanced|bankrupt] [--json]
```

---

### `bla emit-headers [output-dir]`

Generates compile-time C/C++ (`bla_shield.h`), Rust (`bla_shield.rs`), and Go (`bla_shield.go`) headers containing 68 decoy `/rustc/<40-hex>/` commit hashes, decoy `.dep-v0` crate tables, decoy Go `dep` lines, and Collatz/Hensel opaque predicates.

```bash
bla emit-headers [output-dir] [--seed <seed>] [--json]
```

---

### `bla setup`, `bla doctor`, `bla uninstall`

Manage coding-agent MCP registration and skill installation:

```bash
bla setup [--client claude-code,cursor,codex,windsurf,gemini,opencode] [--json]
bla doctor [--json]
bla uninstall [--client ...] [--json]
```

---

## 2. MCP Server Tools (`bla mcp`)

BLA runs a standards-compliant JSON-RPC 2.0 MCP server over `stdio` (`npx bla-shield mcp`).

### `bla_audit`

- **Description**: Audit a software artifact for vulnerability to AI reverse-engineering agents (like REA).
- **Input Schema**:
  - `targetPath` (`string`, required): Path to the file or directory to audit.

### `bla_protect`

- **Description**: Apply BLA's adversarial defense shield (Chaff + Algorithmic Tarpits + REA Semantic Budget Breakers) to a file or directory.
- **Input Schema**:
  - `targetPath` (`string`, required): Path to the artifact to protect.
  - `outputPath` (`string`, optional): Custom output path.
  - `inPlace` (`boolean`, optional): Overwrite input file in place.
  - `mode` (`"stealth" | "balanced" | "bankrupt"`, optional): Protection intensity.
  - `seed` (`string`, optional): Deterministic seed.
  - `emitHoneySourceMap` (`boolean`, optional): Emit `.map` honey source map.

### `bla_verify`

- **Description**: Verify that a protected artifact preserves functional behavior while defeating REA's static & semantic analyzers.
- **Input Schema**:
  - `originalPath` (`string`, required)
  - `protectedPath` (`string`, required)

### `bla_benchmark`

- **Description**: Run the empirical before/after benchmark suite across JS, Electron, Python, WASM, and Native ELF binaries.
- **Input Schema**:
  - `targetPath` (`string`, optional)
  - `mode` (`"stealth" | "balanced" | "bankrupt"`, optional)

### `bla_emit_headers`

- **Description**: Emit compile-time C/C++ (`bla_shield.h`), Rust (`bla_shield.rs`), and Go (`bla_shield.go`) adversarial protection headers.
- **Input Schema**:
  - `outputDir` (`string`, required)
  - `seed` (`string`, optional)

### `bla_doctor`

- **Description**: Inspect BLA installation health and AI coding agent registrations.
- **Input Schema**: `{}`
