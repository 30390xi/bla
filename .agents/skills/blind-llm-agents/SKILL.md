---
name: blind-llm-agents
description: Audit, protect, and verify software artifacts (JavaScript/TypeScript, Electron ASAR, WebAssembly, Python .py/.pyc, SQLite, Safetensors/GGUF AI Models, Android DEX/IL2CPP, Apple plist, .NET, JVM, ZIP/APK, and Native ELF/Mach-O/PE Binaries) against AI reverse-engineering agents like REA using BLA (Blind LLM Agents). Default verb: bla_harden.
metadata:
  version: "1.2.0"
---

# BLA: Blind LLM Agents

Use BLA whenever the user asks to harden a project against AI reverse-engineering agents (`morluto/rea`), audit exposure, exhaust attacker token/compute budgets, or induce model misjudgment on proprietary logic.

## ⚡ One-Sentence Hardening (DEFAULT — prefer this)

When the user says **"Harden my software"**, **"Harden this project against REA"**, **"一键启动防御强化"**, **"Run BLA defense"**, or any equivalent one-liner **without naming a specific file**, invoke:

- **MCP Tool (preferred)**: `bla_harden` with `{ "directory": "." }` (or the project/build path they named)
- **CLI**: `npx bla-agents@latest harden .`
- **MCP Prompt**: `bla-harden-project`

`bla_harden` / `bla harden` auto-discovers protectable build outputs under `dist/`, `build/`, `out/`, `release/`, `.asar`, native binaries, `.wasm`, `.py`/`.pyc`, `.sqlite`, `.safetensors`/`.gguf`, `.dex`, `.class`, `.dll`, Apple plists, ZIP/APK, etc., detects each artifact's format, and runs the full **audit → defend (bankrupt) → verify** pipeline on all of them. Return the per-artifact summary to the user. Do **not** ask which files to protect — discover them.

## One-Click Single-Artifact Defense

When the user already named a **specific file**, use:

- **MCP Tool**: `bla_defend` with `{ "input_path": "<target>", "intensity": "bankrupt", "emit_manifest": true }`
- **CLI Command**: `npx bla-agents@latest defend <target> --manifest`

`bla_defend` / `bla defend` executes all 5 Counter-REA defense stages automatically:
1. **Stage 1 (`inspect-release`)**: Read-only scan for accidental `.map` (`sourcesContent`) and symbol leaks.
2. **Stage 2 (`audit`)**: 16-vector REA vulnerability & Claude Opus 4 / Sonnet 4 / o3 token-cost simulation.
3. **Stage 3 (`protect --intensity bankrupt`)**: Injects both the **Resource-Exhaustion Suite** and the **Model-Misjudgment Induction Suite** (including canary honeypots + system-diagnostic decoys across JS, WASM, Python, SQLite, Safetensors/GGUF, DEX, IL2CPP, Apple plist, .NET, JVM, ZIP/APK).
4. **Stage 4 (`verify`)**: Verifies all Counter-REA mathematical invariants and confirms token/cost bankruptcy amplification.
5. **Stage 5 (`manifest`)**: Emits `<output>.bla-manifest.json` attesting to the hardened build.

## Step-by-Step Granular Workflow: Audit -> Protect -> Verify

1. **Audit (`bla_audit` or `npx bla-agents audit <target>`)**:
   - Reports the **REA Exposure Score (0–100)**, exposed functions/classes/IPC channels/routes, and estimated attacker token and dollar costs.
2. **Protect (`bla_protect` or `npx bla-agents protect <target> -o <output> --intensity bankrupt`)**:
   - **Resource Exhaustion (耗尽对方资源)** and **Model Misjudgment Induction (诱导模型误判)** as documented in [references/counter-rea-matrix.md](references/counter-rea-matrix.md).
3. **Verify (`bla_verify` or `npx bla-agents verify <protected> [original]`)**:
   - Confirms that all Counter-REA gates pass and reports exact Token & API Cost Amplification.

## CLI Fallback Commands

```bash
npx -y bla-agents@latest harden .
npx -y bla-agents@latest defend /absolute/path/to/target --manifest --json
npx -y bla-agents@latest audit /absolute/path/to/target --json
npx -y bla-agents@latest protect /absolute/path/to/target -o /absolute/path/to/protected --intensity bankrupt --json
npx -y bla-agents@latest verify /absolute/path/to/protected /absolute/path/to/target --json
npx -y bla-agents@latest doctor
```

See [references/counter-rea-matrix.md](references/counter-rea-matrix.md) for the complete mapping between REA's internal analyzers and BLA's countermeasures.
