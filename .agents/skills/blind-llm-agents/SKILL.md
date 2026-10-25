---
name: blind-llm-agents
description: Audit, protect, and verify software artifacts (JavaScript/TypeScript, Electron ASAR, WebAssembly, Python .py/.pyc, SQLite, Safetensors/GGUF AI Models, Android DEX/IL2CPP, and Native ELF/Mach-O/PE Binaries) against AI reverse-engineering agents like REA using BLA (Blind LLM Agents).
metadata:
  version: "1.1.0"
---

# BLA: Blind LLM Agents

Use BLA whenever the user asks to harden a project against AI reverse-engineering agents (`morluto/rea`), audit exposure, exhaust attacker token/compute budgets, or induce model misjudgment on proprietary logic.

## ⚡ One-Click Agent Defense Hardening (Recommended)

When the user says **"Harden this project against REA"**, **"一键启动防御强化"**, or **"Run BLA defense"**, invoke the single one-click pipeline immediately:

- **MCP Tool**: `bla_defend` with `{ "input_path": "<target>", "intensity": "bankrupt", "emit_manifest": true }`
- **CLI Command**: `npx bla-agents@latest defend <target> --manifest`

`bla_defend` / `bla defend` executes all 5 Counter-REA defense stages automatically:
1. **Stage 1 (`inspect-release`)**: Read-only scan for accidental `.map` (`sourcesContent`) and symbol leaks.
2. **Stage 2 (`audit`)**: 16-vector REA vulnerability & Claude Opus 4 / Sonnet 4 / o3 token-cost simulation.
3. **Stage 3 (`protect --intensity bankrupt`)**: Injects both the **Resource-Exhaustion Suite** (`REA_BUDGET_BREAKER_MATRIX`, 22-family `ReconstructionObligationLedger` flood, Tarjan SCC Call-Graph Labyrinth, BPE Subword Token Sink) and the **Model-Misjudgment Induction Suite** (`ShadowBusinessLogic`, `EvidenceContractPoison` competing-explanation lures, gRPC/vsock `ArchitectureMirage`, `SemanticHoneypot` bait exports, and Shared-ArrayBuffer `DecompilerIllusion`).
4. **Stage 4 (`verify`)**: Verifies all Counter-REA mathematical invariants and confirms `16x–51x` token/cost bankruptcy amplification.
5. **Stage 5 (`manifest`)**: Emits `<output>.bla-manifest.json` attesting to the hardened build.

## Step-by-Step Granular Workflow: Audit -> Protect -> Verify

1. **Audit (`bla_audit` or `npx bla-agents audit <target>`)**:
   - Reports the **REA Exposure Score (0–100)**, exposed functions/classes/IPC channels/routes, and estimated attacker token and dollar costs.
2. **Protect (`bla_protect` or `npx bla-agents protect <target> -o <output> --intensity bankrupt`)**:
   - **Resource Exhaustion (耗尽对方资源)**:
     - Trips REA's `SEMANTIC_PRIMITIVE_CANDIDATE_LIMIT = 256` ($2^9 = 512$ opaque ternary chunks), `SEMANTIC_ALIAS_SELECTION_LIMIT = 512` (520+ selector states), `SEMANTIC_GETTER_EXPANSION_LIMIT = 512` (self-referential getter rings), and `SEMANTIC_PRIMITIVE_JSON_BYTES_LIMIT = 1_048_576` (`codeUnits * 6 + 2` Cartesian string explosion).
     - Floods all 22 `ReconstructionObligationPolicies` families (`context-bridge-api`, `ipc-channel`, `ipc-handler`, `endpoint`, `storage`, `worker`, `service-worker`, `native-addon`, `child-process`, `stdio`, `signal`, `config-source`, etc.), multiplying mandatory verification fixtures (`positive`, `negative`, `malformed`, `cancellation`, `teardown`) by `20x–60x`.
     - Injects Tarjan SCC mutually-recursive call-graph labyrinths and BPE subword token amplifiers.
   - **Model Misjudgment Induction (诱导模型误判)**:
     - Exploits REA's `COMMON_DISCIPLINE` (*"Report Observations only from cited Evidence... Keep incomplete coverage explicit as Unknowns"*): wraps real business logic in `status: "unknown"` semantic budget breakers while leaving crystal-clear **Shadow Business Logic** (`shamir-ed25519-license-ring`, `enterprise-tiered-pricing-matrix`, `binary-wire-frame-ratchet`, `tpm2-pcr-dongle-handshake`) 100% `observed`, inducing the LLM to reconstruct the decoy algorithm.
     - Plants high-confidence Evidence Contract competing-explanation lures, gRPC/vsock hardware enclave mirages, and shared-`ArrayBuffer` decompiler aliasing illusions.
3. **Verify (`bla_verify` or `npx bla-agents verify <protected> [original]`)**:
   - Confirms that all Counter-REA gates pass and reports exact Token & API Cost Amplification.

## CLI Fallback Commands

```bash
npx -y bla-agents@latest defend /absolute/path/to/target --manifest --json
npx -y bla-agents@latest audit /absolute/path/to/target --json
npx -y bla-agents@latest protect /absolute/path/to/target -o /absolute/path/to/protected --intensity bankrupt --json
npx -y bla-agents@latest verify /absolute/path/to/protected /absolute/path/to/target --json
```

See [references/counter-rea-matrix.md](references/counter-rea-matrix.md) for the complete mapping between REA's internal analyzers and BLA's countermeasures.
