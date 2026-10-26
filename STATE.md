# BLA state of the project

**Version:** 1.4.0 (`package.json` ↔ `src/identity.ts`, verified by build)  
**Status:** Launch-ready locally. Gates green on Node 22.23.4 and Node 24.22.1.  
**Blocker to publish:** GitHub token (no push / tag / npm publish / GitHub Release yet).

## One-sentence usage

```bash
npx bla-agents setup -y    # register MCP + skill (default verb: bla_harden)
bla harden .               # or tell your agent: "Harden my software against REA"
```

Also: `bla_harden` MCP tool with `{ "directory": "." }`.

## What BLA covers

| Format | Canary + diagnostic + exhaustion | Empirical vs real REA | Notes |
|--------|----------------------------------|------------------------|-------|
| JavaScript / TypeScript | ✓ | designed-for (showcase estimates) | AST + semantic budgets |
| Electron ASAR | ✓ | **verified** — `DEFAULT_ASAR_MAX_HEADER_BYTES` | |
| WebAssembly | ✓ export decoys | **verified** — Wabt `WASM_INTERFACE_REPRESENTATION_BYTES` / partial | needs Wabt for REA path |
| Python `.py` / `.pyc` | ✓ | designed-for | |
| Native ELF (Go/Flutter/Electron fuses) | ✓ | **verified** — `MAX_BUILD_INFO_BYTES`, pool URIs/tokens, fuse sentinels | |
| SQLite | ✓ honey + trap columns | **verified** on Node 24 — `SqliteColumnEvaluationFailure`; Node 22 soft `capability_gated` | |
| Safetensors | ✓ nesting breaker | **verified** — `MODEL_JSON_NESTING` (HF-loadable) | |
| GGUF | ✓ | **verified** — `MODEL_METADATA_NESTING` | |
| Erlang BEAM | ✓ | **verified** — `max_chunks` | |
| EVM bytecode | ✓ | **verified** — `EVM_INTERFACE_LIMITS.inputBytes` | |
| PCAP | ✓ | **verified** — `TSHARK_JSON_MAX_BYTES` (needs tshark) | |
| GPU PTX | ✓ canary/exhaustion | soft — REA still `after=ok` | densifies but no hard budget trip |
| DEX / IL2CPP / bplist / .NET / JVM / ZIP | ✓ | designed-for | signed APK refused (by design) |
| Firmware / SPIR-V / CUDA / AMD GPU objects | — | **skipped** | no stable REA analyzer / not in scope yet |

**Designed-for but not empirically verified here** (need native tooling on the REA side): Ghidra, Frida, LLDB, Rizin, JADX.

## Empirical red-team headlines (`npm run redteam:rea`)

Commodity hardware, sibling REA, Node 24.22.1 + Wabt 1.0.42 + tshark:

| Format | Before → after | REA budget / error |
|--------|----------------|--------------------|
| Go buildinfo | 51 339 → 1 214 706 B | `MAX_BUILD_INFO_BYTES` |
| Flutter pool | same ELF plant | `MAX_POOL_URIS` / `MAX_POOL_TOKENS` |
| BEAM | 84 → 267 876 B | `max_chunks` |
| EVM | 16 → 4 190 208 B | `EVM_INTERFACE_LIMITS.inputBytes` |
| PCAP | 24 → 1 348 012 B | `TSHARK_JSON_MAX_BYTES` |
| Safetensors | 128 → 10 328 B | `MODEL_JSON_NESTING` |
| GGUF | 24 → 7 840 B | `MODEL_METADATA_NESTING` |
| ASAR | 607 → 17 752 989 B | `DEFAULT_ASAR_MAX_HEADER_BYTES` |
| WASM | 54 → 6 878 763 B | `WASM_INTERFACE_REPRESENTATION_BYTES` |
| SQLite (N24) | 12 288 → 57 344 B | `SqliteColumnEvaluationFailure` |
| Electron fuses | same ELF plant | `maximumSentinelsPerSlice` |
| GPU PTX | 91 → 26 424 B | still soft (`after=ok`) |

`npm run verify:rea` — catalog alignment (42 checks).

## Benchmark (internal estimates)

14-target Counter-REA showcase: **~597.6×** token amplification, **~285.3×** cost, **100%** runtime-equivalent. Numbers are model estimates, not the empirical table above.

## Dogfood (local user journey)

Outside the repo, `npm pack` → install tarball → isolated `HOME`:

1. `npx bla-agents setup -y --client cursor` → APPLIED; skill default verb `bla_harden`
2. `bla harden .` → discovered **10** artifacts (dist/* + root `tools.py` / `local.sqlite`), hardened **10/10**, doctor **HEALTHY**
3. Hardened JS/WASM/SQLite/Safetensors/ELF/ASAR/Python remain valid and runtime-equivalent
4. MCP `tools/list` includes `bla_harden`; `tools/call bla_harden` succeeds

## Nightly roadmap remaining

1. **GPU objects** — make PTX (and later CUDA/SPIR-V/AMD) trip a real REA budget without breaking validity  
2. **Firmware** — decide scope or keep skipped  
3. **Native-tool REA verification** — Ghidra / Frida / LLDB / Rizin / JADX empirical probes  
4. **Signed APK** — keep refuse-by-default; optional resign workflow documentation  
5. Polish doctor subsystem list (SQLite / models / BEAM / EVM) for parity with shields  

## Publish checklist (once a GitHub token exists)

1. Confirm `package.json` version === `src/identity.ts` === `CHANGELOG` / `docs/releases/v1.4.0.md` (already 1.4.0)  
2. Final gate matrix on Node 22.23.4 **and** Node 24.22.1 (+ Wabt for redteam):  
   `npm run build && npm test && npm run benchmark && npm run verify:rea && npm run redteam:rea`  
3. Prefer Node **22.23.4** / **24.x** for REA (avoid `~/node22` 22.13.0 — lacks `zstdDecompressSync`)  
4. `git push origin main` (local commits are ahead; remotes currently untouched)  
5. `git tag v1.4.0 && git push origin v1.4.0`  
6. `npm publish` for `bla-agents` (and alias/`bla-shield` dual-pack flow if still used)  
7. GitHub Release from `docs/releases/v1.4.0.md`  
8. Smoke: `npx bla-agents@latest setup -y` + `bla harden .` on a fresh machine  

## Honesty red line

BLA is a **defensive** tool for protecting **your own** software. See [DISCLAIMER.md](DISCLAIMER.md). Do not overclaim: separate empirically verified commodity hits from designed-for / unverified native-tool paths and skipped formats.
