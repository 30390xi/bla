import { deflateSync } from "node:zlib";
import { REA_INTERNAL_LIMITS } from "../../identity.js";
import { SeededPrng } from "../../core/prng.js";
import type { ArtifactFormat, ProtectionIntensity } from "../../core/types.js";
import { generateChaffPayloads } from "../chaff/chaff-generator.js";
import {
  buildDecoyElectronFuseSentinels,
  hardenElectronFusesWithContext,
  inspectElectronFusesInBuffer,
  type ElectronHardeningContext,
  type ElectronHardeningReport,
} from "./electron-fuses.js";

export class InvalidNativeBinaryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidNativeBinaryError";
  }
}

export interface Elf64ProgramHeaderSummary {
  readonly index: number;
  readonly type: number;
  readonly flags: number;
  readonly offset: number;
  readonly vaddr: bigint;
  readonly paddr: bigint;
  readonly filesz: number;
  readonly memsz: bigint;
  readonly align: bigint;
}

export interface Elf64SectionHeaderSummary {
  readonly index: number;
  readonly nameOffset: number;
  readonly type: number;
  readonly flags: bigint;
  readonly addr: bigint;
  readonly offset: number;
  readonly size: number;
}

export interface Elf64LayoutSummary {
  readonly phoff: number;
  readonly phentsize: number;
  readonly phnum: number;
  readonly shoff: number;
  readonly shentsize: number;
  readonly shnum: number;
  readonly shstrndx: number;
  readonly programHeaders: readonly Elf64ProgramHeaderSummary[];
  readonly sectionHeaders: readonly Elf64SectionHeaderSummary[];
}

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

const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

/**
 * Validates ELF64 little-endian header, program headers (`PT_LOAD`, `p_filesz <= p_memsz`,
 * non-overlapping virtual address ranges, in-bounds file ranges), and section headers
 * (in-bounds file ranges, valid `e_shstrndx`, non-overlapping file-backed sections).
 */
export function validateElf64Layout(bytes: Buffer): Elf64LayoutSummary {
  if (
    bytes.length < 64 ||
    bytes[0] !== 0x7f ||
    bytes[1] !== 0x45 ||
    bytes[2] !== 0x4c ||
    bytes[3] !== 0x46
  ) {
    throw new InvalidNativeBinaryError(
      "Invalid or truncated ELF header (minimum 64 bytes required)",
    );
  }

  if (bytes[4] !== 2 || bytes[5] !== 1) {
    throw new InvalidNativeBinaryError(
      "Unsupported ELF class or endianness (expected ELF64 little-endian)",
    );
  }

  const phoffBig = bytes.readBigUInt64LE(32);
  const shoffBig = bytes.readBigUInt64LE(40);
  const ehsize = bytes.readUInt16LE(52);
  const phentsize = bytes.readUInt16LE(54);
  const phnum = bytes.readUInt16LE(56);
  const shentsize = bytes.readUInt16LE(58);
  const shnum = bytes.readUInt16LE(60);
  const shstrndx = bytes.readUInt16LE(62);

  if (ehsize !== 0 && (ehsize < 64 || ehsize > bytes.length)) {
    throw new InvalidNativeBinaryError(`Invalid ELF64 e_ehsize: ${ehsize}`);
  }

  if (phoffBig > MAX_SAFE_BIGINT || shoffBig > MAX_SAFE_BIGINT) {
    throw new InvalidNativeBinaryError(
      "ELF64 header table offsets exceed safe integer range",
    );
  }

  const phoff = Number(phoffBig);
  const shoff = Number(shoffBig);

  const programHeaders: Elf64ProgramHeaderSummary[] = [];
  const phTableEnd = phnum > 0 ? phoff + phnum * phentsize : 0;

  if (phnum > 0) {
    if (
      phentsize < 56 ||
      phoff < 64 ||
      !Number.isSafeInteger(phTableEnd) ||
      phTableEnd > bytes.length
    ) {
      throw new InvalidNativeBinaryError(
        "ELF64 program header table out of bounds or malformed",
      );
    }

    for (let i = 0; i < phnum; i++) {
      const phdr = phoff + i * phentsize;
      const pType = bytes.readUInt32LE(phdr);
      const pFlags = bytes.readUInt32LE(phdr + 4);
      const pOffsetBig = bytes.readBigUInt64LE(phdr + 8);
      const pVaddrBig = bytes.readBigUInt64LE(phdr + 16);
      const pPaddrBig = bytes.readBigUInt64LE(phdr + 24);
      const pFileszBig = bytes.readBigUInt64LE(phdr + 32);
      const pMemszBig = bytes.readBigUInt64LE(phdr + 40);
      const pAlignBig = bytes.readBigUInt64LE(phdr + 48);

      if (pOffsetBig > MAX_SAFE_BIGINT || pFileszBig > MAX_SAFE_BIGINT) {
        throw new InvalidNativeBinaryError(
          `ELF64 program header ${i} file offset/size exceeds safe integer range`,
        );
      }

      const pOffset = Number(pOffsetBig);
      const pFilesz = Number(pFileszBig);
      if (
        !Number.isSafeInteger(pOffset + pFilesz) ||
        pOffset + pFilesz > bytes.length
      ) {
        throw new InvalidNativeBinaryError(
          `ELF64 program header ${i} file range [${pOffset}, ${pOffset + pFilesz}) out of bounds (${bytes.length})`,
        );
      }

      if (pType === 1) {
        // PT_LOAD
        if (pMemszBig < pFileszBig) {
          throw new InvalidNativeBinaryError(
            `ELF64 PT_LOAD segment ${i} has p_memsz (${pMemszBig}) < p_filesz (${pFileszBig})`,
          );
        }
      }

      programHeaders.push({
        index: i,
        type: pType,
        flags: pFlags,
        offset: pOffset,
        vaddr: pVaddrBig,
        paddr: pPaddrBig,
        filesz: pFilesz,
        memsz: pMemszBig,
        align: pAlignBig,
      });
    }

    // Verify no two PT_LOAD segments have overlapping virtual address ranges
    const loadSegments = programHeaders.filter(
      (ph) => ph.type === 1 && ph.memsz > 0n,
    );
    for (let i = 0; i < loadSegments.length; i++) {
      const a = loadSegments[i]!;
      const aEnd = a.vaddr + a.memsz;
      for (let j = i + 1; j < loadSegments.length; j++) {
        const b = loadSegments[j]!;
        const bEnd = b.vaddr + b.memsz;
        if (a.vaddr < bEnd && b.vaddr < aEnd) {
          throw new InvalidNativeBinaryError(
            `ELF64 PT_LOAD segments ${a.index} and ${b.index} have overlapping virtual address ranges`,
          );
        }
      }
    }
  }

  const sectionHeaders: Elf64SectionHeaderSummary[] = [];
  const shTableEnd = shnum > 0 ? shoff + shnum * shentsize : 0;

  if (shnum > 0) {
    if (
      shentsize < 64 ||
      shoff < 64 ||
      !Number.isSafeInteger(shTableEnd) ||
      shTableEnd > bytes.length
    ) {
      throw new InvalidNativeBinaryError(
        "ELF64 section header table out of bounds or malformed",
      );
    }

    if (phnum > 0 && phoff < shTableEnd && shoff < phTableEnd) {
      throw new InvalidNativeBinaryError(
        "ELF64 section header table overlaps program header table",
      );
    }

    if (shstrndx !== 0 && shstrndx >= shnum) {
      throw new InvalidNativeBinaryError(
        `ELF64 e_shstrndx (${shstrndx}) out of bounds for e_shnum (${shnum})`,
      );
    }

    for (let s = 0; s < shnum; s++) {
      const shdr = shoff + s * shentsize;
      const shName = bytes.readUInt32LE(shdr);
      const shType = bytes.readUInt32LE(shdr + 4);
      const shFlags = bytes.readBigUInt64LE(shdr + 8);
      const shAddr = bytes.readBigUInt64LE(shdr + 16);
      const shOffsetBig = bytes.readBigUInt64LE(shdr + 24);
      const shSizeBig = bytes.readBigUInt64LE(shdr + 32);

      if (shOffsetBig > MAX_SAFE_BIGINT || shSizeBig > MAX_SAFE_BIGINT) {
        throw new InvalidNativeBinaryError(
          `ELF64 section ${s} offset/size exceeds safe integer range`,
        );
      }

      const shOffset = Number(shOffsetBig);
      const shSize = Number(shSizeBig);

      // File-backed sections: not SHT_NULL (0) and not SHT_NOBITS (8)
      if (s >= 1 && shType !== 0 && shType !== 8) {
        if (
          !Number.isSafeInteger(shOffset + shSize) ||
          shOffset + shSize > bytes.length
        ) {
          throw new InvalidNativeBinaryError(
            `ELF64 section ${s} file range [${shOffset}, ${shOffset + shSize}) out of bounds (${bytes.length})`,
          );
        }

        if (shSize > 0) {
          if (shOffset < 64) {
            throw new InvalidNativeBinaryError(
              `ELF64 section ${s} overlaps ELF64 header`,
            );
          }
          if (
            phnum > 0 &&
            shOffset < phTableEnd &&
            phoff < shOffset + shSize
          ) {
            throw new InvalidNativeBinaryError(
              `ELF64 section ${s} overlaps program header table`,
            );
          }
          if (shOffset < shTableEnd && shoff < shOffset + shSize) {
            throw new InvalidNativeBinaryError(
              `ELF64 section ${s} overlaps section header table`,
            );
          }
        }
      }

      sectionHeaders.push({
        index: s,
        nameOffset: shName,
        type: shType,
        flags: shFlags,
        addr: shAddr,
        offset: shOffset,
        size: shSize,
      });
    }

    // Verify no two non-empty file-backed sections overlap in file range
    const fileBackedSections = sectionHeaders.filter(
      (sec) => sec.index >= 1 && sec.type !== 0 && sec.type !== 8 && sec.size > 0,
    );
    for (let i = 0; i < fileBackedSections.length; i++) {
      const a = fileBackedSections[i]!;
      const aEnd = a.offset + a.size;
      for (let j = i + 1; j < fileBackedSections.length; j++) {
        const b = fileBackedSections[j]!;
        const bEnd = b.offset + b.size;
        if (a.offset < bEnd && b.offset < aEnd) {
          throw new InvalidNativeBinaryError(
            `ELF64 sections ${a.index} and ${b.index} have overlapping file ranges`,
          );
        }
      }
    }
  }

  return {
    phoff,
    phentsize,
    phnum,
    shoff,
    shentsize,
    shnum,
    shstrndx,
    programHeaders,
    sectionHeaders,
  };
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
    dartSnapshotHashesCount >
      REA_INTERNAL_LIMITS.DART_MAX_SNAPSHOT_HASH_CANDIDATES ||
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
  return deflateSync(
    Buffer.from(JSON.stringify({ format: 1, packages }), "utf8"),
  );
}

/**
 * Builds 66 Dart AOT snapshot records (`0xf5, 0xf5, 0xdc, 0xdc` + 16-byte header + 32-hex hash)
 * plus conflicting `"Dart VM version:"` and `6` `"based on LLVM ..."` strings to trip REA's
 * `FlutterPayloadScan.ts` (`MAX_SNAPSHOT_HASH_CANDIDATES = 64` & `MAX_TOOLCHAIN_LINES = 4`).
 */
function buildFlutterDartSnapshotOverflowPayload(prng: SeededPrng): Buffer {
  const records: Buffer[] = [];
  const snapshotCount =
    REA_INTERNAL_LIMITS.DART_MAX_SNAPSHOT_HASH_CANDIDATES + 2; // 66 > 64

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
 * Protects a Native Binary (ELF / Mach-O / PE) against REA's native & desktop analyzers
 * while strictly preserving ELF64 `PT_LOAD` (`p_offset`, `p_filesz`, `p_memsz` / BSS) and
 * section header boundaries. Real Electron fuses are only mutated when an explicit
 * verified `electronHardeningContext` is provided.
 */
export function protectNativeBinary(
  bytes: Buffer,
  options: {
    readonly intensity?: ProtectionIntensity;
    readonly seed?: string | number;
    readonly electronHardeningContext?: ElectronHardeningContext;
  } = {},
): {
  readonly buffer: Buffer;
  readonly rustcHashesInjected: number;
  readonly electronFuseSentinelsInjected: number;
  readonly dartSnapshotHashesInjected: number;
  readonly chaffPayloadsEmbedded: number;
  readonly binarySectionsPatched: number;
  readonly electronHardeningReport?: ElectronHardeningReport;
} {
  const isElfMagic =
    bytes.length >= 4 &&
    bytes[0] === 0x7f &&
    bytes[1] === 0x45 &&
    bytes[2] === 0x4c &&
    bytes[3] === 0x46;

  const elfBefore = isElfMagic ? validateElf64Layout(bytes) : undefined;

  const intensity = options.intensity ?? "balanced";
  const prng = new SeededPrng(options.seed ?? "bla-native-shield-v1");
  const chaffPayloads = generateChaffPayloads(prng, intensity);

  let workingInput = Buffer.from(bytes);
  let electronHardeningReport: ElectronHardeningReport | undefined;
  let patchedInPlaceCount = 0;

  if (options.electronHardeningContext) {
    electronHardeningReport = hardenElectronFusesWithContext(
      workingInput,
      options.electronHardeningContext,
    );
    workingInput = Buffer.from(electronHardeningReport.buffer);
    patchedInPlaceCount =
      electronHardeningReport.mutatedFuses.length > 0 ? 1 : 0;
  }

  const decoySentinelsInjected = 34;
  const decoySentinelsBuffer = buildDecoyElectronFuseSentinels(
    prng,
    decoySentinelsInjected,
  );

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
  const chaffBlock = chaffPayloads
    .map((p) => `${p.symbolName}: ${p.rawText}\0`)
    .join("");
  const depV0Payload = buildDecoyRustAuditablePayload(prng);
  const dartOverflowPayload = buildFlutterDartSnapshotOverflowPayload(prng);

  const shieldTrailer = Buffer.concat([
    Buffer.from("\0[BLA-NATIVE-SHIELD-V1]\0.dep-v0\0", "utf8"),
    Buffer.from(rustcLines.join(""), "latin1"),
    Buffer.from(goLines, "utf8"),
    decoySentinelsBuffer,
    dartOverflowPayload,
    Buffer.from(chaffBlock, "utf8"),
    depV0Payload,
  ]);

  const outBytes = Buffer.concat([workingInput, shieldTrailer]);
  const binarySectionsPatched = 1 + patchedInPlaceCount + (elfBefore ? 2 : 0);

  if (elfBefore) {
    const elfAfter = validateElf64Layout(outBytes);
    for (let i = 0; i < elfBefore.programHeaders.length; i++) {
      const beforePh = elfBefore.programHeaders[i]!;
      const afterPh = elfAfter.programHeaders[i]!;
      if (
        beforePh.type !== afterPh.type ||
        beforePh.flags !== afterPh.flags ||
        beforePh.offset !== afterPh.offset ||
        beforePh.vaddr !== afterPh.vaddr ||
        beforePh.paddr !== afterPh.paddr ||
        beforePh.filesz !== afterPh.filesz ||
        beforePh.memsz !== afterPh.memsz ||
        beforePh.align !== afterPh.align
      ) {
        throw new InvalidNativeBinaryError(
          `ELF64 program header ${i} was mutated during protection`,
        );
      }
    }
    for (let s = 0; s < elfBefore.sectionHeaders.length; s++) {
      const beforeSh = elfBefore.sectionHeaders[s]!;
      const afterSh = elfAfter.sectionHeaders[s]!;
      if (
        beforeSh.type !== afterSh.type ||
        beforeSh.flags !== afterSh.flags ||
        beforeSh.addr !== afterSh.addr ||
        beforeSh.offset !== afterSh.offset ||
        beforeSh.size !== afterSh.size
      ) {
        throw new InvalidNativeBinaryError(
          `ELF64 section header ${s} was mutated during protection`,
        );
      }
    }
  }

  return {
    buffer: outBytes,
    rustcHashesInjected: rustcCount,
    electronFuseSentinelsInjected: decoySentinelsInjected,
    dartSnapshotHashesInjected:
      REA_INTERNAL_LIMITS.DART_MAX_SNAPSHOT_HASH_CANDIDATES + 2,
    chaffPayloadsEmbedded: chaffPayloads.length,
    binarySectionsPatched,
    ...(electronHardeningReport ? { electronHardeningReport } : {}),
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
