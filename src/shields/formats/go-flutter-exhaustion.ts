import { REA_INTERNAL_LIMITS } from "../../identity.js";
import { SeededPrng } from "../../core/prng.js";
import type { ProtectionIntensity } from "../../core/types.js";

function writeGoUvarint(value: number): Buffer {
  const out: number[] = [];
  let n = value >>> 0;
  while (n >= 0x80) {
    out.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  out.push(n);
  return Buffer.from(out);
}

/**
 * Framed Go buildinfo (magic `\xff Go buildinf:` + inline encoding) with
 * MODULE_START/END wrapping, plus `.gopclntab` / `runtime.moduledata` bait.
 * Bankrupt/maximum pad the module past `MAX_BUILD_INFO_BYTES` (1 MiB).
 *
 * Note: REA only parses buildinfo inside mapped `.go.buildinfo` / writable
 * load regions. Trailer placement still poisons whole-file scanners and is
 * ready for mapped-section injection; the framed blob stays structurally valid.
 */
export function buildGoBuildInfoExhaustionPayload(
  prng: SeededPrng,
  intensity: ProtectionIntensity = "balanced",
): {
  readonly buffer: Buffer;
  readonly exceedsMaxBuildInfoBytes: boolean;
  readonly moduleBytes: number;
} {
  const MAGIC = Buffer.from("ff20476f206275696c64696e663a", "hex");
  const MODULE_START = Buffer.from("3077af0c9274080241e1c107e6d618e6", "hex");
  const MODULE_END = Buffer.from("f932433186182072008242104116d8f2", "hex");
  const padAlign = Buffer.alloc(16, 0);

  const version = Buffer.from("go1.22.5", "utf8");
  const canaryLines = [
    "path\tgithub.com/tee-enclave/zero-trust-shim\n",
    `mod\tgithub.com/tee-enclave/zero-trust-shim\tv4.2.0\th1:${prng.hex(32)}=\n`,
    `dep\tgithub.com/intel-sgx/enclave-sdk-go\tv2.14.0\th1:${prng.hex(32)}=\n`,
    `dep\tgithub.com/google/go-tpm-tools\tv0.4.4\th1:${prng.hex(32)}=\n`,
    "build\t-compiler=gc\n",
    "build\tCGO_ENABLED=1\n",
    `build\tBLA_CANARY=${prng.hex(16)}\n`,
  ];
  let moduleBody = Buffer.from(canaryLines.join(""), "utf8");
  const target =
    intensity === "bankrupt" || intensity === "maximum"
      ? REA_INTERNAL_LIMITS.GO_MAX_BUILD_INFO_BYTES + 4096
      : Math.min(24_000, REA_INTERNAL_LIMITS.GO_MAX_BUILD_INFO_BYTES >> 3);
  if (version.length + moduleBody.length < target) {
    const need = target - version.length - moduleBody.length;
    const noise = Buffer.from(
      `\npath\tgithub.com/bla/tarpit/${prng.hex(8)}\n` + "A".repeat(Math.max(0, need - 40)),
      "utf8",
    );
    moduleBody = Buffer.concat([moduleBody, noise]);
  }
  const moduleFramed = Buffer.concat([
    MODULE_START,
    moduleBody,
    Buffer.from("\n", "utf8"),
    MODULE_END,
  ]);
  const exceeds =
    version.length + moduleFramed.length >
    REA_INTERNAL_LIMITS.GO_MAX_BUILD_INFO_BYTES;

  const header = Buffer.alloc(32, 0);
  MAGIC.copy(header, 0);
  header[14] = 8; // ptrSize
  header[15] = 2; // flags: bit1 => inline encoding

  const pclntabBait = Buffer.from(
    "\0[BLA-GO-BUILDINFO]\0.gopclntab\0runtime.moduledata\0__gopclntab\0runtime.pclntab\0\xfb\xff\xff\xff\x00\x00",
    "latin1",
  );

  return {
    buffer: Buffer.concat([
      padAlign,
      header,
      writeGoUvarint(version.length),
      version,
      writeGoUvarint(moduleFramed.length),
      moduleFramed,
      pclntabBait,
    ]),
    exceedsMaxBuildInfoBytes: exceeds,
    moduleBytes: moduleFramed.length,
  };
}

/**
 * Dart snapshot-hash overflow (>64) plus string-pool URI/token flood past
 * `MAX_POOL_URIS` (500) and `MAX_POOL_TOKENS` (2000).
 */
export function buildFlutterPoolExhaustionPayload(prng: SeededPrng): {
  readonly buffer: Buffer;
  readonly snapshotHashes: number;
  readonly packageAndDartUris: number;
  readonly classLikeTokens: number;
} {
  const records: Buffer[] = [];
  const snapshotCount =
    REA_INTERNAL_LIMITS.DART_MAX_SNAPSHOT_HASH_CANDIDATES + 2;

  for (let i = 0; i < snapshotCount; i++) {
    const rec = Buffer.alloc(52, 0);
    rec[0] = 0xf5;
    rec[1] = 0xf5;
    rec[2] = 0xdc;
    rec[3] = 0xdc;
    rec.writeBigUInt64LE(64n, 4);
    rec.writeBigUInt64LE(3n, 12);
    const hash32 = i.toString(16).padStart(8, "0") + prng.hex(24);
    rec.write(hash32, 20, "ascii");
    records.push(rec);
  }

  const labeledLines = [
    '\0Dart VM version: 3.5.0-enclave-tee-ring0 (stable) on "linux_x64"\0',
    'Dart VM version: 3.6.2-sgx-isolated-bridge (stable) on "macos_arm64"\0',
    "based on LLVM 17.0.6 (https://enclave.internal/llvm-tee-01)\0",
    "based on LLVM 18.1.2 (https://enclave.internal/llvm-tee-02)\0",
    "based on LLVM 18.1.8 (https://enclave.internal/llvm-tee-03)\0",
    "based on LLVM 19.1.0 (https://enclave.internal/llvm-tee-04)\0",
    "based on LLVM 19.1.4 (https://enclave.internal/llvm-tee-05)\0",
    "based on LLVM 20.0.0 (https://enclave.internal/llvm-tee-06)\0",
  ].join("");
  records.push(Buffer.from(labeledLines, "latin1"));

  const uriCount = REA_INTERNAL_LIMITS.DART_MAX_POOL_URIS + 16;
  const tokenCount = REA_INTERNAL_LIMITS.DART_MAX_POOL_TOKENS + 32;
  const poolParts: string[] = ["\0[BLA-FLUTTER-POOL-EXHAUST]\0"];
  for (let i = 0; i < uriCount; i++) {
    poolParts.push(`package:enclave_tarpit_${i}/lib/bridge_${prng.hex(4)}.dart`);
    poolParts.push(`dart:enclave_isolate_${i}`);
  }
  for (let i = 0; i < tokenCount; i++) {
    poolParts.push(`EnclaveTarpitNode_${i}_${prng.hex(3)}`);
  }
  records.push(Buffer.from(poolParts.join("\0") + "\0", "utf8"));

  return {
    buffer: Buffer.concat(records),
    snapshotHashes: snapshotCount,
    packageAndDartUris: uriCount * 2,
    classLikeTokens: tokenCount,
  };
}
