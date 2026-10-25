# CLI & MCP Reference (`bla-agents`)

## CLI Commands

| Command | Description |
| :--- | :--- |
| `npx bla-agents setup` | Auto-registers the `bla` MCP server and `blind-llm-agents` skill with Claude Code, Cursor, Codex, Windsurf, Gemini CLI, and Antigravity. |
| `npx bla-agents defend <target> [--manifest]` | **One-Click 5-Stage Defense Pipeline**: runs `inspect-release` $\to$ `audit` $\to$ `protect --intensity bankrupt` $\to$ `verify` $\to$ `.bla-manifest.json`. |
| `npx bla-agents inspect-release <target>` | Read-only local scan for embedded `.map` (`sourcesContent`) and sourceMappingURL references. |
| `npx bla-agents audit <target>` | Pre-flight 16-vector REA vulnerability & token-cost audit. |
| `npx bla-agents protect <target> [-o <out>]` | Injects BLA's Resource-Exhaustion and Model-Misjudgment shield (`stealth`, `balanced`, `maximum`, `bankrupt`). |
| `npx bla-agents verify <target> [original]` | Verifies Counter-REA invariants and calculates token/cost amplification. |
| `npx bla-agents benchmark` | Runs the 8-target Counter-REA Showcase Benchmark suite. |
| `npx bla-agents emit-headers --lang <c\|rust\|go>` | Emits compile-time native defense headers (`bla_shield.h`, `bla_shield.rs`, `bla_shield.go`). |
| `npx bla-agents doctor` | Checks readiness of all BLA protection engines and agent MCP registrations. |

## MCP Tools (`bla` Server)

- `bla_defend`: One-click full Counter-REA defense hardening pipeline (`input_path`, `output_path`, `intensity`, `emit_manifest`).
- `bla_audit`: Pre-flight REA exposure and token-economics audit (`path`).
- `bla_protect`: Granular shield injection (`input_path`, `output_path`, `intensity`, `seed`).
- `bla_verify`: Counter-REA invariant verification (`target_path`, `original_path`).
- `bla_benchmark`: Runs the 8-target showcase benchmark suite.
- `bla_emit_headers`: Generates C/C++, Rust, or Go defense headers (`language`, `intensity`).
- `bla_doctor`: Diagnostics for BLA engines and agent client registrations.
