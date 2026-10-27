# BLA nightly development log

## 2026-10-28 (Asia/Shanghai)

### REA delta
- Pulled `morluto/rea`: `dd7a2da5b` → `0cd7ef456` (**325 commits**).
- New analyzers / budgets worth countering:
  - **#7456** caller-selected R8/ProGuard mapping (`PROGUARD_MAPPING_LIMITS`:
    candidates=8, malformedSamples=16, projectionBytes=8MiB, indexBytes=128MiB;
    `ANDROID_MAPPING_LIMITS.fileBytes`=64MiB).
  - **#7472** JNI native-declaration ↔ `.so` export linking
    (`ANDROID_JNI_REPORT_BYTES`=16MiB, `ANDROID_JNI_LIBRARY_LIMITS`).
  - **#7379** selected AndroidManifest component declarations (queued for next night).
- Remainder of delta: evidence/contract refactors, browser/cli fixes — no new
  BLA-relevant budget constants beyond the Android set above.

### Done tonight
- `src/identity.ts`: registered Android mapping + JNI + `MAX_NATIVE_EXPORT_ROWS` limits.
- `src/shields/formats/android-r8.ts`: mapping generator (residual conflicts +
  malformed bait) + ELF64 AArch64 ET_DYN decoy with real `Java_*` dynsym exports.
- Wired into unsigned APK path + DEX trailer JNI names.
- `verify:rea` catalog extended (Object.freeze-aware).
- Release **bla-agents@1.4.6**.

### Next step (2026-10-29)
1. Empirical red-team: point sibling REA Android mapping + JNI tools at a
   BLA-hardened unsigned APK fixture; capture before/after in `docs/redteam/`.
2. Counter REA #7379 with binary/XML AndroidManifest component decoys (unsigned only).
3. Optionally densify decoy JNI `.so` past `ANDROID_JNI_REPORT_BYTES` projection
   when intensity ≥ maximum (keep red-line: never rewrite developer libs).
