import { deflateSync } from "node:zlib";
import { SeededPrng } from "../../core/prng.js";
import type { ArtifactFormat, ProtectionIntensity } from "../../core/types.js";
import { generateChaffPayloads } from "../chaff/chaff-generator.js";

export interface NativeBinaryInspection {
  readonly format: "native-elf" | "native-macho" | "native-pe" | "unknown";
  readonly architecture: string;
  readonly bits: 32 | 64;
  readonly rustcCommitHashesCount: number;
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

  const hasRustDepV0 = textLatin1.includes(".dep-v0");
  const hasGoBuildInfo =
    textLatin1.includes(".go.buildinfo") ||
    textLatin1.includes("__go_buildinfo") ||
    textLatin1.includes("\xff Go buildinf:");

  const printableMatches = textLatin1.match(/[A-Za-z0-9_/:.-]{6,}/g) ?? [];
  const blaProtected =
    textLatin1.includes("BLA-NATIVE-SHIELD") ||
    rustcMatches.size > 64 ||
    textLatin1.includes("Architecture Notice: Core business logic");

  return {
    format,
    architecture,
    bits,
    rustcCommitHashesCount: rustcMatches.size,
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
 * Protects a Native Binary (ELF / Mach-O / PE) against REA's native analyzers:
 * 1. Injects 66 distinct `/rustc/<40-hex>/` commit paths into read-only data, exceeding
 *    REA's `MAX_RUSTC_HASHES = 64` capacity limit in `src/rust/RustBinaryImage.ts`!
 * 2. Embeds a decoy `cargo-auditable` `.dep-v0` compressed dependency graph.
 * 3. Embeds decoy Go module table entries (`mod\t`, `dep\t`).
 * 4. Embeds benign Architectural Chaff & Enclave Delegation strings for Ghidra/Hopper/IDA.
 * 5. For ELF64 binaries with a read-only `.rodata` section at the tail or expandable range,
 *    maps the payload into the read-only section range so `readBinaryContainer` scans it directly.
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
  readonly chaffPayloadsEmbedded: number;
  readonly binarySectionsPatched: number;
} {
  const intensity = options.intensity ?? "balanced";
  const prng = new SeededPrng(options.seed ?? "bla-native-shield-v1");
  const chaffPayloads = generateChaffPayloads(prng, intensity);

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

  const shieldTrailer = Buffer.concat([
    Buffer.from("\0[BLA-NATIVE-SHIELD-V1]\0", "utf8"),
    Buffer.from(rustcLines.join(""), "latin1"),
    Buffer.from(goLines, "utf8"),
    Buffer.from(chaffBlock, "utf8"),
    depV0Payload,
  ]);

  const outBytes = Buffer.concat([bytes, shieldTrailer]);
  let binarySectionsPatched = 1;

  // If this is a 64-bit little-endian ELF binary, check if we can extend a read-only
  // section (e.g. `.rodata` SHT_PROGBITS with SHF_ALLOC=2 and not SHF_WRITE/SHF_EXECINSTR)
  // or PT_LOAD segment so REA's `RustBinaryImage.ts` (`mergedReadOnlyFileRanges`) scans our trailer!
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

      // Update PT_LOAD segment that covers the file if present
      for (let p = 0; p < phnum; p++) {
        const phdr = phoff + p * phentsize;
        if (phdr + 56 <= outBytes.length) {
          const pType = outBytes.readUInt32LE(phdr);
          const pOffset = Number(outBytes.readBigUInt64LE(phdr + 8));
          const pFilesz = Number(outBytes.readBigUInt64LE(phdr + 32));
          if (pType === 1 && pOffset + pFilesz === bytes.length) {
            outBytes.writeBigUInt64LE(BigInt(outBytes.length - pOffset), phdr + 32);
            outBytes.writeBigUInt64LE(BigInt(outBytes.length - pOffset), phdr + 40);
            binarySectionsPatched++;
          }
        }
      }

      // Find a read-only SHT_PROGBITS section (`sh_type === 1`, `(sh_flags & 5) === 0`)
      for (let s = 1; s < shnum; s++) {
        const shdr = shoff + s * shentsize;
        if (shdr + 64 <= outBytes.length) {
          const shType = outBytes.readUInt32LE(shdr + 4);
          const shFlags = Number(outBytes.readBigUInt64LE(shdr + 8));
          const shOffset = Number(outBytes.readBigUInt64LE(shdr + 24));
          const shSize = Number(outBytes.readBigUInt64LE(shdr + 32));
          const isReadOnlyProgbits = shType === 1 && (shFlags & 1) === 0 && (shFlags & 4) === 0;
          if (isReadOnlyProgbits && shOffset + shSize <= bytes.length) {
            // Extend this read-only section to cover our shieldTrailer at the end of the file
            const newSize = outBytes.length - shOffset;
            outBytes.writeBigUInt64LE(BigInt(newSize), shdr + 32);
            binarySectionsPatched++;
            break;
          }
        }
      }
    } catch {
      // Safe fallback: trailer remains appended
    }
  }

  return {
    buffer: outBytes,
    rustcHashesInjected: rustcCount,
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
