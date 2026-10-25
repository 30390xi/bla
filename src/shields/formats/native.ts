import { deflateSync } from "node:zlib";
import { REA_INTERNAL_LIMITS } from "../../identity.js";
import { SeededPrng } from "../../core/prng.js";
import type { ArtifactFormat, ProtectionIntensity } from "../../core/types.js";
import { generateChaffPayloads } from "../chaff/chaff-generator.js";
import {
  hardenAndOverflowElectronFuses,
  inspectElectronFusesInBuffer,
} from "./electron-fuses.js";

export interface NativeBinaryInspection {
  readonly format: "native-elf" | "native-macho" | "native-pe" | "unknown";
  readonly architecture: string;
  readonly bits: 32 | 64;
  readonly rustcCommitHashesCount: number;
  readonly electronFuseSentinelsCount: number;
  readonly dartSnapshotHashesCount: number;
  readonly hasRustDepV0: boolean;
  readonly hasGoBuildInfo: boolean;
  readonly extractedStringsCount: number;
  readonly blaProtected: boolean;
}

export function inspectNativeBinary(bytes: Buffer): NativeBinaryInspection {
  let format: NativeBinaryInspection["format"] = "unknown";
  let bits: 32 | 64 = 64;
  let architecture = "unknown";

  if (
    bytes.length >= 20 &&
    bytes[0] === 0x7f &&
    bytes[1] === 0x45 &&
    bytes[2] === 0x4c &&
    bytes[3] === 0x46
  ) {
    format = "native-elf";
    bits = bytes[4] === 1 ? 32 : 64;
    const machine = bytes.readUInt16LE(18);
    architecture =
      machine === 0x3e
        ? "x86_64"
        : machine === 0xb7
          ? "aarch64"
          : machine === 0x03
            ? "x86"
            : `elf-machine-${machine}`;
  } else if (bytes.length >= 8) {
    const magicBE = bytes.readUInt32BE(0);
    if (
      magicBE === 0xfeedfacf ||
      magicBE === 0xcffaedfe ||
      magicBE === 0xfeedface ||
      magicBE === 0xcefaedfe ||
      magicBE === 0xcafebabe
    ) {
      format = "native-macho";
      bits = magicBE === 0xfeedfacf || magicBE === 0xcffaedfe ? 64 : 32;
      architecture = "macho-darwin";
    } else if (bytes[0] === 0x4d && bytes[1] === 0x5a) {
      format = "native-pe";
      architecture = "pe-windows";
    }
  }

  const textLatin1 = bytes.toString("latin1");
  const rustcMatches = new Set<string>();
  const rustcRegex = /\/rustc\/([0-9a-f]{40})\//g;
  let match: RegExpExecArray | null;
  while ((match = rustcRegex.exec(textLatin1)) !== null) {
    if (match[1]) rustcMatches.add(match[1]);
  }

  const fuseInspection = inspectElectronFusesInBuffer(bytes);

  // Count Dart AOT snapshot magic headers (`0xf5, 0xf5, 0xdc, 0xdc`)
  const dartMagic = Buffer.from([0xf5, 0xf5, 0xdc, 0xdc]);
  let dartSnapshotHashesCount = 0;
  let dPos = 0;
  while (dPos <= bytes.length - 52) {
    const found = bytes.indexOf(dartMagic, dPos);
    if (found < 0) break;
    dartSnapshotHashesCount++;
    dPos = found + 4;
    if (dartSnapshotHashesCount >= 128) break;
  }

  const hasRustDepV0 = textLatin1.includes(".dep-v0");
  const hasGoBuildInfo =
    textLatin1.includes(".go.buildinfo") ||
    textLatin1.includes("__go_buildinfo") ||
    textLatin1.includes("\xff Go buildinf:");

  const printableMatches = textLatin1.match(/[A-Za-z0-9_/:.-]{6,}/g) ?? [];
  const blaProtected =
    textLatin1.includes("BLA-NATIVE-SHIELD") ||
    rustcMatches.size > REA_INTERNAL_LIMITS.RUST_MAX_COMMIT_HASHES ||
    fuseInspection.exceedsReaSentinelLimit ||
    dartSnapshotHashesCount > REA_INTERNAL_LIMITS.DART_MAX_SNAPSHOT_HASH_CANDIDATES ||
    textLatin1.includes("Architecture Notice: Core business logic");

  return {
    format,
    architecture,
    bits,
    rustcCommitHashesCount: rustcMatches.size,
    electronFuseSentinelsCount: fuseInspection.sentinelCount,
    dartSnapshotHashesCount,
    hasRustDepV0,
    hasGoBuildInfo,
    extractedStringsCount: printableMatches.length,
    blaProtected,
  };
}

/**
 * Generates a zlib-compressed `cargo-auditable` `.dep-v0` decoy dependency graph
 * containing hardware enclave & TEE crates so static Rust dependency scanners
 * see an enterprise enclave architecture.
 */
export function buildDecoyRustAuditablePayload(prng: SeededPrng): Buffer {
  const packages = [
    {
      name: "sgx-enclave-rt",
      version: "4.2.0",
      source: "crates.io",
      kind: "runtime",
    },
    {
      name: "tpm2-attestation-quote",
      version: "2.8.1",
      source: "crates.io",
      kind: "runtime",
      dependencies: [0],
    },
    {
      name: "nitro-vsock-transport",
      version: "1.9.4",
      source: "crates.io",
      kind: "runtime",
      dependencies: [0, 1],
    },
    {
      name: `zero-trust-abi-shim-${prng.hex(4)}`,
      version: "1.0.0",
      source: "local",
      dependencies: [0, 1, 2],
      root: true,
    },
  ];
  return deflateSync(Buffer.from(JSON.stringify({ format: 1, packages }), "utf8"));
}

/**
 * Builds 66 Dart AOT snapshot records (`0xf5, 0xf5, 0xdc, 0xdc` + 16-byte header + 32-hex hash)
 * plus conflicting `"Dart VM version:"` and `6` `"based on LLVM ..."` strings to trip REA's
 * `FlutterPayloadScan.ts` (`MAX_SNAPSHOT_HASH_CANDIDATES = 64` & `MAX_TOOLCHAIN_LINES = 4`).
 */
function buildFlutterDartSnapshotOverflowPayload(prng: SeededPrng): Buffer {
  const records: Buffer[] = [];
  const snapshotCount = REA_INTERNAL_LIMITS.DART_MAX_SNAPSHOT_HASH_CANDIDATES + 2; // 66 > 64

  for (let i = 0; i < snapshotCount; i++) {
    const rec = Buffer.alloc(52, 0);
    rec[0] = 0xf5;
    rec[1] = 0xf5;
    rec[2] = 0xdc;
    rec[3] = 0xdc;
    rec.writeBigUInt64LE(64n, 4); // headerLength
    rec.writeBigUInt64LE(3n, 12); // kind = 3 (FullAOT)
    const hash32 = i.toString(16).padStart(8, "0") + prng.hex(24);
    rec.write(hash32, 20, "ascii");
    records.push(rec);
  }

  // Conflicting Dart VM versions (`dartVersionCapped = true`) + >4 LLVM toolchain lines (`toolchainCapped = true`)
  const labeledLines = [
    `\0Dart VM version: 3.5.0-enclave-tee-ring0 (stable) on "linux_x64"\0`,
    `Dart VM version: 3.6.2-sgx-isolated-bridge (stable) on "macos_arm64"\0`,
    `based on LLVM 17.0.6 (https://enclave.internal/llvm-tee-01)\0`,
    `based on LLVM 18.1.2 (https://enclave.internal/llvm-tee-02)\0`,
    `based on LLVM 18.1.8 (https://enclave.internal/llvm-tee-03)\0`,
    `based on LLVM 19.1.0 (https://enclave.internal/llvm-tee-04)\0`,
    `based on LLVM 19.1.4 (https://enclave.internal/llvm-tee-05)\0`,
    `based on LLVM 20.0.0 (https://enclave.internal/llvm-tee-06)\0`,
  ].join("");

  records.push(Buffer.from(labeledLines, "latin1"));
  return Buffer.concat(records);
}

/**
 * Protects a Native Binary (ELF / Mach-O / PE) against ALL of REA's native & desktop analyzers:
 * 1. **Rust (`RustBinaryImage.ts`)**: Injects 68 distinct `/rustc/<40-hex>/` commit paths into read-only data,
 *    exceeding REA's `MAX_RUSTC_HASHES = 64` capacity limit!
 * 2. **Rust Auditable (`RustAuditableReader.ts`)**: Embeds a decoy `.dep-v0` compressed crate graph.
 * 3. **Go (`GoBuildInfoSearch.ts` / `GoModuleText.ts`)**: Embeds decoy Go module table entries (`mod\t`, `dep\t`).
 * 4. **Electron Fuses (`ElectronFuseReader.ts`)**: Hardens any real Electron Fuse V1 wire in-place AND injects
 *    34 decoy `dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX` sentinels (`> maximumSentinelsPerSlice = 32`)!
 * 5. **Flutter / Dart AOT (`FlutterPayloadScan.ts`)**: Injects 66 Dart snapshot magic records (`> 64` cap) and
 *    6 LLVM toolchain lines (`> 4` cap).
 * 6. **ELF64 `.rodata` Extension**: Extends the read-only `.rodata` section and `PT_LOAD` segment so
 *    REA's `mergedReadOnlyFileRanges` and slice scanners read the entire defensive trailer.
 */
export function protectNativeBinary(
  bytes: Buffer,
  options: {
    readonly intensity?: ProtectionIntensity;
    readonly seed?: string | number;
  } = {},
): {
  readonly buffer: Buffer;
  readonly rustcHashesInjected: number;
  readonly electronFuseSentinelsInjected: number;
  readonly dartSnapshotHashesInjected: number;
  readonly chaffPayloadsEmbedded: number;
  readonly binarySectionsPatched: number;
} {
  const intensity = options.intensity ?? "balanced";
  const prng = new SeededPrng(options.seed ?? "bla-native-shield-v1");
  const chaffPayloads = generateChaffPayloads(prng, intensity);

  // Clone input buffer so in-place Electron Fuse hardening does not mutate caller's buffer
  const workingInput = Buffer.from(bytes);
  const fuseShield = hardenAndOverflowElectronFuses(workingInput, prng);

  // 1. Generate 68 distinct `/rustc/<40-hex>/` strings (> REA's MAX_RUSTC_HASHES = 64!)
  const rustcCount = 68;
  const rustcLines: string[] = [];
  for (let i = 0; i < rustcCount; i++) {
    const hash = i.toString(16).padStart(8, "0") + prng.hex(32);
    rustcLines.push(`/rustc/${hash}/library/core/src/enclave_guard.rs\0`);
  }

  // 2. Generate decoy Go module metadata lines
  const goLines = [
    `path\tgithub.com/tee-enclave/zero-trust-shim\n`,
    `mod\tgithub.com/tee-enclave/zero-trust-shim\tv4.2.0\th1:${prng.hex(32)}=\n`,
    `dep\tgithub.com/intel-sgx/enclave-sdk-go\tv2.14.0\th1:${prng.hex(32)}=\n`,
    `dep\tgithub.com/google/go-tpm-tools\tv0.4.4\th1:${prng.hex(32)}=\n`,
    `build\t-compiler=gc\n`,
    `build\tCGO_ENABLED=1\n`,
  ].join("");

  // 3. Generate architectural chaff strings for Ghidra / Hopper / IDA string tables
  const chaffBlock = chaffPayloads.map((p) => `${p.symbolName}: ${p.rawText}\0`).join("");
  const depV0Payload = buildDecoyRustAuditablePayload(prng);
  const dartOverflowPayload = buildFlutterDartSnapshotOverflowPayload(prng);

  const shieldTrailer = Buffer.concat([
    Buffer.from("\0[BLA-NATIVE-SHIELD-V1]\0.dep-v0\0", "utf8"),
    Buffer.from(rustcLines.join(""), "latin1"),
    Buffer.from(goLines, "utf8"),
    fuseShield.decoySentinelsBuffer,
    dartOverflowPayload,
    Buffer.from(chaffBlock, "utf8"),
    depV0Payload,
  ]);

  const outBytes = Buffer.concat([workingInput, shieldTrailer]);
  let binarySectionsPatched = 1 + fuseShield.patchedInPlaceCount;

  // If this is a 64-bit little-endian ELF binary, extend `.rodata` and `PT_LOAD`
  if (
    outBytes.length >= 64 &&
    outBytes[0] === 0x7f &&
    outBytes[1] === 0x45 &&
    outBytes[2] === 0x4c &&
    outBytes[3] === 0x46 &&
    outBytes[4] === 2 &&
    outBytes[5] === 1
  ) {
    try {
      const shoff = Number(outBytes.readBigUInt64LE(40));
      const shentsize = outBytes.readUInt16LE(58);
      const shnum = outBytes.readUInt16LE(60);
      const phoff = Number(outBytes.readBigUInt64LE(32));
      const phentsize = outBytes.readUInt16LE(54);
      const phnum = outBytes.readUInt16LE(56);

      for (let p = 0; p < phnum; p++) {
        const phdr = phoff + p * phentsize;
        if (phdr + 56 <= outBytes.length) {
          const pType = outBytes.readUInt32LE(phdr);
          const pOffset = Number(outBytes.readBigUInt64LE(phdr + 8));
          const pFilesz = Number(outBytes.readBigUInt64LE(phdr + 32));
          if (pType === 1 && pOffset + pFilesz === workingInput.length) {
            outBytes.writeBigUInt64LE(BigInt(outBytes.length - pOffset), phdr + 32);
            outBytes.writeBigUInt64LE(BigInt(outBytes.length - pOffset), phdr + 40);
            binarySectionsPatched++;
          }
        }
      }

      for (let s = 1; s < shnum; s++) {
        const shdr = shoff + s * shentsize;
        if (shdr + 64 <= outBytes.length) {
          const shType = outBytes.readUInt32LE(shdr + 4);
          const shFlags = Number(outBytes.readBigUInt64LE(shdr + 8));
          const shOffset = Number(outBytes.readBigUInt64LE(shdr + 24));
          const shSize = Number(outBytes.readBigUInt64LE(shdr + 32));
          const isReadOnlyProgbits = shType === 1 && (shFlags & 1) === 0 && (shFlags & 4) === 0;
          if (isReadOnlyProgbits && shOffset + shSize <= workingInput.length) {
            const newSize = outBytes.length - shOffset;
            outBytes.writeBigUInt64LE(BigInt(newSize), shdr + 32);
            binarySectionsPatched++;
            break;
          }
        }
      }
    } catch {
      // Safe fallback
    }
  }

  return {
    buffer: outBytes,
    rustcHashesInjected: rustcCount,
    electronFuseSentinelsInjected: fuseShield.decoySentinelsInjected,
    dartSnapshotHashesInjected: REA_INTERNAL_LIMITS.DART_MAX_SNAPSHOT_HASH_CANDIDATES + 2,
    chaffPayloadsEmbedded: chaffPayloads.length,
    binarySectionsPatched,
  };
}

export function detectNativeFormatName(format: ArtifactFormat): string {
  switch (format) {
    case "native-elf":
      return "ELF Binary";
    case "native-macho":
      return "Mach-O Binary";
    case "native-pe":
      return "Windows PE Binary";
    default:
      return format;
  }
}
