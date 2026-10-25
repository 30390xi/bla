# Counter-REA Technical Matrix (`morluto/rea` vs. `bla-shield`)

This reference documents the exact static, semantic, container, and dynamic runtime limits inside `morluto/rea` and how BLA deterministically trips or poisons every single one of them.

---

## 1. JavaScript / TypeScript Semantic Resource Limits (`src/domain/javascript/`)

| REA Constant | File in `morluto/rea` | Hard Limit | BLA Countermeasure | REA Failure Mode |
| :--- | :--- | :---: | :--- | :--- |
| `SEMANTIC_PRIMITIVE_CANDIDATE_LIMIT` | `javascriptSemanticResourceLimits.ts` | `256` | $\ge 9$-chunk opaque conditional string concatenation ($2^9 = 512 > 256$) | `semantic_resource_limits: ["primitive-candidates"]`, string resolves to `unknown` |
| `SEMANTIC_ALIAS_SELECTION_LIMIT` | `javascriptStaticAnalysis.ts` | `512` | 22-level optional-chaining selector pyramid ($2^{22} = 4,194,304 > 512$) | `parse_status: "partial"`, `examination.status: "limited"`, `["alias-selections"]` |
| `SEMANTIC_GETTER_EXPANSION_LIMIT` | `javascriptSemanticResourceLimits.ts` | `512` | Self-referential getter state machine (`get grow() { return this.grow.more; }`) | `["getter-expansion"]` |
| `SEMANTIC_PRIMITIVE_JSON_BYTES_LIMIT` | `javascriptSemanticResourceLimits.ts` | `1,048,576` (1 MiB) | 16-step inert string-doubling chain ($64 \times 2^{16} = 4\text{ MiB}$) | `["primitive-bytes"]` |

---

## 2. Electron ASAR, IPC Pairing & Electron Fuses (`src/electron/`)

| REA Component | File in `morluto/rea` | Mechanism / Limit | BLA Countermeasure | REA Failure Mode |
| :--- | :--- | :---: | :--- | :--- |
| **IPC Channel Pairing** | `electronStaticAnalysisIpc.ts` | Requires unique literal string on `ipcRenderer` and `ipcMain` | Converts real IPC channel strings into $\ge 9$-term opaque expressions + registers duplicate decoy channels | `channel: null`, `electron_call_paths_limited: true`, zero auto-paired channels |
| **Wrapper Call-Path Depth** | `electronWrappedCallPaths.ts` | `128` depth / `1,000,000` visits | Deep interconnected tarpit wrapper mesh | `electron_call_paths_limited: true` |
| **Electron Fuse Sentinel** | `ElectronFuseReader.ts` | `maximumSentinelsPerSlice = 32` (`dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX`) | Hardens real V1 fuse wire (`RunAsNode=0`, `EnableNodeCliInspectArguments=0`) AND injects 34 decoy sentinels | Throws `ElectronFuseResourceFailure("capacity", "Slice 0 contains more than 32 Electron fuse sentinels.")` |

---

## 3. Dynamic Runtime Observation (`observe-javascript-runtime` / `reconcile-javascript-runtime` / Frida / CDP)

| REA Tool | Mechanism | BLA Countermeasure (`src/shields/runtime/runtime-shield.ts`) | Effect on REA |
| :--- | :--- | :--- | :--- |
| `observe-javascript-runtime` / `reconcile-javascript-runtime` | Attaches CDP / Node Inspector to reconcile static unknowns | **"Truman Show" Shadow Runtime Deception**: detects `--inspect`, `navigator.webdriver`, Playwright/Puppeteer/Frida without crashing and exposes `__bla_enclave_runtime_*` proxy getters | Reconciles runtime state to hardware TEE stub metadata |
| `inspect-web-event-listeners` | Enumerates DOM `addEventListener` registrations | Registers 10 passive enclave event channels (`enclave:vsock:attestation-ready`, `tpm2:pcr0:monotonic-quote-verified`, etc.) | Floods event listener inventory with hardware enclave channels |

---

## 4. Native Binaries, Rust, Go & Flutter/Dart AOT (`src/rust/`, `src/go/`, `src/flutter/`)

| REA Component | File in `morluto/rea` | Hard Limit | BLA Countermeasure (`src/shields/formats/native.ts`) | REA Failure Mode |
| :--- | :--- | :---: | :--- | :--- |
| **Rust Commit Scanner** | `RustBinaryImage.ts` | `MAX_RUSTC_HASHES = 64` | Injects 68 distinct `/rustc/<40-hex>/` paths into `.rodata` | Throws `AnalysisResourceConstraintError("inspect_rust_binary", "capacity", { maximum_rustc_hashes: 64 })` |
| **Rust Auditable `.dep-v0`** | `RustAuditableReader.ts` | Zlib JSON crate graph | Injects compressed `.dep-v0` graph of `sgx-enclave-rt` & `tpm2-attestation-quote` | Reports TEE enclave dependency architecture |
| **Flutter / Dart Snapshot** | `FlutterPayloadScan.ts` | `MAX_SNAPSHOT_HASH_CANDIDATES = 64`, `MAX_TOOLCHAIN_LINES = 4` | Injects 66 `0xf5, 0xf5, 0xdc, 0xdc` Dart snapshot headers + conflicting `"Dart VM version:"` + 6 LLVM lines | `snapshotScan.capped = true`, `dartVersionCapped = true`, `toolchainCapped = true` |

---

## 5. SQLite 3, AI Models (`.safetensors` / `.gguf`), WASM, Python & Android DEX / Unity IL2CPP

| Artifact Format | REA Inspector | Hard Limit / Mechanism | BLA Countermeasure | REA Failure Mode |
| :--- | :--- | :--- | :--- | :--- |
| **SQLite 3 (`.sqlite`, `.db`)** | `SqliteDatabaseInspection.ts` | `readOnly: true, allowExtension: false` connection | Injects 3 Honey Tables with `GENERATED ALWAYS AS (bla_enclave_unseal(...)) VIRTUAL` columns | Throws `SqliteColumnEvaluationFailure` (`column-evaluation`) when REA projects rows without runtime scalar function |
| **Safetensors (`.safetensors`)** | `SafetensorsHeader.ts` | `MODEL_JSON_NESTING = 32` | Injects enclave `__metadata__` + 35-level nested JSON array (`_bla_nesting_breaker`) | Throws `ModelFormatFailure("capacity", "Safetensors JSON nesting exceeds 32 levels", "json-nesting")` |
| **GGUF v2/v3 (`.gguf`)** | `GgufHeader.ts` | `MODEL_METADATA_NESTING = 32` | Injects `enclave.delegation.manifest` + 35-frame nested `ARRAY` (`enclave.nesting.breaker`) | Throws `ModelFormatFailure("capacity", "GGUF metadata nesting exceeds 32 array frames", "metadata-nesting")` |
| **WebAssembly (`.wasm`)** | `WabtWat.ts` / `WasmInterfaceBudget.ts` | Custom `"name"` section & interface budget | Strips real debug names, injects honey `"name"` section (`tee_hardware_enclave_transport_stub_*`) + `@custom` manifests | Redirects WAT module naming to hardware enclave stub |
| **Android DEX & Unity IL2CPP** | `JadxProvider.ts` / `Il2cppMetadataAdmission.ts` | Class search & metadata admission | Injects decoy `Lcom/enclave/sgx/...` DEX classes (with valid SHA-1 & Adler32) and IL2CPP string literals | Floods class/metadata search with enclave tarpit nodes |
