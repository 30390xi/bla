# Empirical REA red-team validation

Generated: 2026-10-27, 04:56:45 (Asia/Shanghai)
BLA root: `/workspace/bla-dev/bla`
REA root: `/workspace/bla-dev/rea`
Intensity: `bankrupt` · seed: `bla-redteam-empirical-v1`
Node: `v22.23.4`
tshark: `TShark (Wireshark) 4.4.19.`

## Summary

| Format | Before status | After status | Budget hit (after) | vs BLA estimate |
|---|---|---|---|---|
| go_buildinfo | ok | error | MAX_BUILD_INFO_BYTES | agree |
| flutter_pool | ok | ok | MAX_POOL_URIS|MAX_POOL_TOKENS | agree |
| erlang_beam | ok | error | max_chunks | agree |
| evm_bytecode | ok | ok | EVM_INTERFACE_LIMITS.inputBytes (approach) | agree |
| pcap_capture | ok | budget_rejected | TSHARK_JSON_MAX_BYTES | agree |
| safetensors | ok | ok | no | noted |
| gguf | ok | error | MODEL_METADATA_NESTING | agree |
| gpu_ptx | ok | ok | no | noted |
| electron_asar | ok | error | DEFAULT_ASAR_MAX_HEADER_BYTES | agree |
| wasm_module | ok | budget_rejected | WASM_INTERFACE_REPRESENTATION_BYTES | agree |
| sqlite_db | capability_gated | capability_gated | no | agree |
| electron_fuses | ok | budget_rejected | ELECTRON_FUSE_LIMITS.maximumSentinelsPerSlice | agree |

## Per-format empirical outcomes

### go_buildinfo

- Input before: 51339 (50.1 KiB)
- Input after: 1214706 (1.16 MiB)
- Before: status=ok; budgetHit=false; note=no_buildinfo_observed
- After: status=error; budgetHit=MAX_BUILD_INFO_BYTES; error=BinaryResourceFailure: Go build-info string length exceeds the 1 MiB limit

**Before metrics**

- `hasBuildInfo`: false
- `encoding`: null
- `goVersion`: null
- `moduleTextBytes`: 0

**After metrics**

_no metrics_

**Estimate comparison**

- AGREE with BLA goBuildInfoExceedsLimit=true

### flutter_pool

- Input before: 51339 (50.1 KiB)
- Input after: 1214706 (1.16 MiB)
- Before: status=ok; budgetHit=false
- After: status=ok; budgetHit=MAX_POOL_URIS|MAX_POOL_TOKENS; note=REA would report truncated package_uris/dart_uris/class_like_tokens with 'at least N' limitations

**Before metrics**

- `isolateBytes`: 49152
- `packageUriCount`: 0
- `dartUriCount`: 0
- `classLikeTokenCount`: 0
- `printableRunCount`: 1
- `collectionCapped`: false
- `reportWouldCap`: false

**After metrics**

- `isolateBytes`: 49152
- `packageUriCount`: 532
- `dartUriCount`: 532
- `classLikeTokenCount`: 2032
- `printableRunCount`: 3098
- `collectionCapped`: false
- `reportWouldCap`: true

**Estimate comparison**

- AGREE: REA pool projection would truncate past MAX_POOL_URIS/TOKENS
- packageUriCount=532 (cap 500), dartUriCount=532, classLikeTokenCount=2032 (cap 2000)

### erlang_beam

- Input before: 84
- Input after: 267876 (261.6 KiB)
- Before: status=ok; budgetHit=false
- After: status=error; budgetHit=max_chunks; error=BeamCapacityFailure: BEAM form exceeds the 64-chunk budget.

**Before metrics**

- `chunkCount`: 3
- `atomCount`: 3
- `limitations`: ["This workflow does not execute BEAM bytecode, inflate LitT literals, or decode Attr/CInf external-term payloads.","Atom names are structural table entries; they do not authenticate the originating compiler or module checksum."]

**After metrics**

_no metrics_

**Estimate comparison**

- AGREE with BLA exceedsDefaultChunkBudget=true

### evm_bytecode

- Input before: 16
- Input after: 4190208 (4.00 MiB)
- Before: status=ok; budgetHit=false
- After: status=ok; budgetHit=EVM_INTERFACE_LIMITS.inputBytes (approach); note=Hardened sample approaches full 4 MiB input budget

**Before metrics**

- `inputBytes`: 16
- `inputBytesLimit`: 4194304
- `approachesLimit`: false
- `exceedsLimit`: false
- `carrierBytes`: 16
- `solidityMetadata`: {"profile":"terminal-cbor-scalars-v1","status":"unavailable","bytecode_offset":null,"cbor_bytes":null,"entries":[],"compiler_version":null,"diagnostic":"No plausible terminal CBOR map was identified; Solidity origin and metadata absence remain unknown."}

**After metrics**

- `inputBytes`: 4190208
- `inputBytesLimit`: 4194304
- `approachesLimit`: true
- `exceedsLimit`: false
- `carrierBytes`: 4190208
- `solidityMetadata`: {"profile":"terminal-cbor-scalars-v1","status":"decoded","bytecode_offset":4189159,"cbor_bytes":1047,"entries":[{"key":{"kind":"text","value":"solc"},"value":{"kind":"bytes","value":"00081e"}},{"key":{"kind":"text","value":"bla"},"value":{"kind":"text","value":"[BLA-EVM-SHIELD]"}},{"key":{"kind":"text","value":"bla_evm_canary"},"value":{"kind":"text","value":"407f29249793f34f"}},{"key":{"kind":"text","value":"bla_3"},"value":{"kind":"text","value":"PROTECTED_CANARY_CREDENTIAL=AKIAIOSFODNN7EXAMPLE_1C72_0"}},{"key":{"kind":"text","value":"bla_4"},"value":{"kind":"text","value":"PROTECTED_CANARY_CREDENTIAL=sk-canary-honeypot-do-not-exfiltrate-1c72-bfd73d9a"}},{"key":{"kind":"text","value":"bla_5"},"value":{"kind":"text","value":"PROTECTED_CANARY_CREDENTIAL=ghp_canaryHoneypotSyntheticToken1c72e72b5016"}},{"key":{"kind":"text","value":"bla_6"},"value":{"kind":"text","value":"PROTECTED_CANARY_CREDENTIAL=AKIAIOSFODNN7EXAMPLE_1C72_3"}},{"key":{"kind":"text","value":"bla_7"},"value":{"kind":"text","value":"PROTECTED_CANARY_CREDENTIAL=sk-canary-honeypot-do-not-exfiltrate-1c72-24b248fa"}},{"key":{"kind":"text","value":"bla_8"},"value":{"kind":"text","value":"PROTECTED_CANARY_CREDENTIAL=ghp_canaryHoneypotSyntheticToken1c72ee234dff"}},{"key":{"kind":"text","value":"bla_9"},"value":{"kind":"text","value":"PROTECTED_CANARY_CREDENTIAL=AKIAIOSFODNN7EXAMPLE_1C72_6"}},{"key":{"kind":"text","value":"bla_10"},"value":{"kind":"text","value":"PROTECTED_CANARY_CREDENTIAL=sk-canary-honeypot-do-not-exfiltrate-1c72-547dca4c"}},{"key":{"kind":"text","value":"bla_11"},"value":{"kind":"text","value":"TRANSPORT_ENDPOINT=https:/canary_1c72_0:secret_539feb84@enclave.internal/v2/attest"}},{"key":{"kind":"text","value":"bla_12"},"value":{"kind":"text","value":"TRANSPORT_ENDPOINT=https:/canary_1c72_1:secret_bfd73d9a@kms.internal/v3/quorum-lease"}},{"key":{"kind":"text","value":"bla_13"},"value":{"kind":"text","value":"TRANSPORT_ENDPOINT=https:/canary_1c72_2:secret_e72b5016@hsm.internal/v1/pkcs11-unwrap"}},{"key":{"kind":"text","value":"bla_14"},"value":{"kind":"text","value":"TRANSPORT_ENDPOINT=https:/canary_1c72_3:secret_be7452a2@sentinel.internal/v2/license-seal"}}],"compiler_version":{"representation":"release-bytes","value":"0.8.30"},"diagnostic":null}

**Estimate comparison**

- AGREE with BLA approachesInputBudget=true (after=4190208 (4.00 MiB), limit=4194304 (4.00 MiB))

### pcap_capture

- Input before: 24
- Input after: 1348012 (1.29 MiB)
- Before: status=ok; budgetHit=false
- After: status=budget_rejected; budgetHit=TSHARK_JSON_MAX_BYTES; note=REA parseTsharkJsonOutput would throw AnalysisResourceConstraintError

**Before metrics**

- `tsharkStatus`: 0
- `tsharkJsonBytes`: 3
- `tsharkJsonLimit`: 8388608
- `exceedsTsharkJsonBudget`: false
- `stderrHead`: 

**After metrics**

- `tsharkStatus`: 0
- `tsharkJsonBytes`: 12779702
- `tsharkJsonLimit`: 8388608
- `exceedsTsharkJsonBudget`: true
- `stderrHead`: 
- `reaParseErrorName`: AnalysisResourceConstraintError
- `reaParseError`: Resource constraint during inspect_pcap_capture: tshark JSON exceeds the bounded decoding budget

**Estimate comparison**

- BLA estimate=11355808 (10.83 MiB); empirical tshark JSON=12779702 (12.19 MiB)
- AGREE with BLA exceedsTsharkJsonBudget=true

### safetensors

- Input before: 128
- Input after: 9560 (9.3 KiB)
- Before: status=ok; budgetHit=false
- After: status=ok; budgetHit=false

**Before metrics**

- `tensorCount`: 1
- `metadataCount`: 1
- `limitations`: []

**After metrics**

- `tensorCount`: 1
- `metadataCount`: 44
- `limitations`: []

**Estimate comparison**

- EXPECTED: safetensors does NOT trip MODEL_JSON_NESTING (HF validity red line); canaries only
- empirical: header parse succeeded (no nesting breaker)

### gguf

- Input before: 24
- Input after: 7840 (7.7 KiB)
- Before: status=ok; budgetHit=false
- After: status=error; budgetHit=MODEL_METADATA_NESTING; error=ModelFormatFailure: GGUF metadata nesting exceeds 32 array frames

**Before metrics**

- `version`: 3
- `tensorCount`: 0
- `metadataCount`: 0
- `limitations`: []

**After metrics**

_no metrics_

**Estimate comparison**

- AGREE with BLA triggeredMetadataNestingBreaker=true

### gpu_ptx

- Input before: 91
- Input after: 26424 (25.8 KiB)
- Before: status=ok; budgetHit=false
- After: status=ok; budgetHit=false

**Before metrics**

- `entryCount`: 1
- `textBytes`: 91
- `note`: REA GPU object decode needs native tooling for fatbin/SPIR-V; PTX is text-scanned here

**After metrics**

- `entryCount`: 129
- `textBytes`: 26424
- `note`: REA GPU object decode needs native tooling for fatbin/SPIR-V; PTX is text-scanned here

**Estimate comparison**

- PTX is text-scanned only; REA GPU object decode needs native tooling (not empirically verified for fatbin/SPIR-V)

### electron_asar

- Input before: 607
- Input after: 17752989 (16.93 MiB)
- Before: status=ok; budgetHit=false
- After: status=error; budgetHit=DEFAULT_ASAR_MAX_HEADER_BYTES; error=ArtifactReaderFailure: ASAR header/index admission is limited to 16 MiB / 16777216 bytes. On MCP, call update_analysis_settings with setting asar.max_header_bytes, action set, and a value in bytes up to 256 MiB / 268435456 bytes (default 16 MiB / 16777216 bytes),

**Before metrics**

- `headerBytes`: 512
- `archiveBytes`: 607
- `jsonBytes`: 501
- `listingEntries`: 2
- `listingPathBytes`: 19

**After metrics**

_no metrics_

**Estimate comparison**

- AGREE with BLA exceedsDefaultAdmission=true (header after metrics=ASAR header/index admission is limited to 16 MiB / 16777216 bytes. On MCP, call update_analysis_settings with setting asar.max_header_bytes, action set, and a value in bytes up to 256 MiB / 268435456 bytes (default 16 MiB / 16777216 bytes),)

### wasm_module

- Input before: 54
- Input after: 3870869 (3.69 MiB)
- Before: status=ok; budgetHit=false
- After: status=budget_rejected; budgetHit=WASM_INTERFACE_REPRESENTATION_BYTES; error=AnalysisResourceConstraintError: Resource constraint during inspect_wasm_artifact: Typed WASM interface decoding exceeds the WABT output representation budget; note=WasmInterfaceBudget refused projected interface inventory (Wabt E2E needs REA_WABT_BIN_DIRECTORY)

**Before metrics**

- `validates`: true
- `sectionCount`: 4
- `customSectionNames`: []
- `exportNames`: ["computeDigest"]
- `importCount`: 0
- `projectedChargeBytes`: 34929624
- `representationBudget`: 33554432
- `descriptorCount`: 128
- `exceedsRepresentationBudget`: true

**After metrics**

- `validates`: true
- `sectionCount`: 13
- `customSectionNames`: ["name","bla.enclave.manifest","enclave.attestation.0","enclave.attestation.1","enclave.attestation.2","bla.canary.credentials","bla.system.diagnostics","bla.export.name.decoys","bla.wasm.interface.exhaustion"]
- `exportNames`: ["computeDigest"]
- `importCount`: 0
- `projectedChargeBytes`: 34929624
- `representationBudget`: 33554432
- `descriptorCount`: 128
- `exceedsRepresentationBudget`: true
- `chargeWhenTripped`: 33292236

**Estimate comparison**

- AGREE with BLA exceedsRepresentationBudget=true (projected=34929624)
- Full Wabt WAT decode is tool-backed; in-process WasmInterfaceBudget reserved with projected descriptors

### sqlite_db

- Input before: 12288 (12.0 KiB)
- Input after: 57344 (56.0 KiB)
- Before: status=capability_gated; budgetHit=false; error=SqliteInspectionFailure: SQLite inspection requires the native DatabaseSync.limits API to bound untrusted values and SQL. Use Node.js 24.15 or newer in the supported 24.x line, or a compatible Node.js 26+ runtime.; note=REA SQLite inspection requires Node.js 24.15+ / 26+ DatabaseSync.limits; honey/canary evidence recorded via BLA inspect instead
- After: status=capability_gated; budgetHit=false; error=SqliteInspectionFailure: SQLite inspection requires the native DatabaseSync.limits API to bound untrusted values and SQL. Use Node.js 24.15 or newer in the supported 24.x line, or a compatible Node.js 26+ runtime.; note=REA SQLite inspection requires Node.js 24.15+ / 26+ DatabaseSync.limits; honey/canary evidence recorded via BLA inspect instead

**Before metrics**

- `blaHoneyTables`: 0
- `blaTableCount`: 1
- `blaProtected`: false

**After metrics**

- `blaHoneyTables`: 5
- `blaTableCount`: 6
- `blaProtected`: true

**Estimate comparison**

- NOTED: REA SQLite inspection capability-gated on Node <24.15; BLA honey/canary evidence recorded
- AGREE: BLA honeyTablesInjected=5, canaryTokens=8

### electron_fuses

- Input before: 51339 (50.1 KiB)
- Input after: 1214706 (1.16 MiB)
- Before: status=ok; budgetHit=false
- After: status=budget_rejected; budgetHit=ELECTRON_FUSE_LIMITS.maximumSentinelsPerSlice; error=ElectronFuseResourceFailure: Slice 0 contains more than 32 Electron fuse sentinels.

**Before metrics**

- `sentinelCount`: null
- `sliceCount`: 1

**After metrics**

_no metrics_

**Estimate comparison**

- AGREE: decoy sentinels 34 > maximumSentinelsPerSlice=32

## Analyzers NOT empirically verified on this box

- **Ghidra / Hopper native decompile** — requires Ghidra/Hopper install (not available without root/GUI)
- **Frida dynamic instrumentation** — requires frida-tools + attachable target process
- **LLDB / GDB native tracing** — requires lldb/gdb + debuggee; not installed here
- **Rizin / Cutter** — requires rizin binary
- **JADX Android decompile** — requires JADX JVM tooling
- **EVM EVMole worker full interface recovery** — Not pathable in-process: EvmoleInterfaceWorker refuses library import ('Owned worker request path missing') and only runs under REA's owned subprocess launcher (prlimit address-space/CPU/file-size, 256 MiB heap, IPC reply schema). The evmole npm package exists in the REA tree but cannot be driven without that ownership harness. inputBytes (4 MiB) admission is checked in-process via probeEvm.
- **WASM Wabt full WAT decode (wasm-objdump / wasm2wat)** — Requires REA_WABT_BIN_DIRECTORY with WABT 1.0.42 tools; not installed here. In-process WasmInterfaceBudget is exercised with BLA's projected interface-exhaustion descriptors.
- **SQLite inspect_sqlite_database (full REA worker)** — REA inspectSqliteDatabaseSnapshot requires Node.js DatabaseSync.limits (24.15+ / 26+). This box runs Node 22.23.4 where limits is absent; honey tables/canaries are still verified via BLA inspectSqliteBuffer + node:sqlite.
- **SPIR-V / CUDA fatbinary / AMD GPU object** — BLA skips these formats (GPU_OBJECT_HARDENING_SKIP_REASON); no shield to validate
- **Firmware analysis** — BLA skips firmware (FIRMWARE_HARDENING_SKIP_REASON); needs vendor parsers

## Method

Harness lives under `scripts/redteam/`. For each in-process REA analyzer, it builds a representative sample, runs the real REA parser on the unhardened bytes, hardens via BLA (`protect*` APIs / mapped plants), re-runs REA, and records budget/redaction/error outcomes. Flutter pool projection uses a faithful replica of REA's private `projectStringPool` (same caps, slack, identifier rules). PCAP uses a real user-local tshark when present.
