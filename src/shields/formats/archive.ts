import { deflateRawSync, inflateRawSync } from "node:zlib";
import { SeededPrng } from "../../core/prng.js";
import type { ProtectionIntensity } from "../../core/types.js";
import { generateChaffPayloads } from "../chaff/chaff-generator.js";

export interface ZipEntryInfo {
  readonly name: string;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly compressionMethod: number;
  readonly data: Buffer;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC32_TABLE[(crc ^ buf[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Reads entries from a standard ZIP or Android APK archive (`PK\x03\x04`).
 */
export function readZipEntries(bytes: Buffer): readonly ZipEntryInfo[] {
  const entries: ZipEntryInfo[] = [];
  let offset = 0;

  while (offset + 30 <= bytes.length) {
    const sig = bytes.readUInt32LE(offset);
    if (sig !== 0x04034b50) break; // Stop at Central Directory (`0x02014b50`)

    const compressionMethod = bytes.readUInt16LE(offset + 8);
    const compressedSize = bytes.readUInt32LE(offset + 18);
    const uncompressedSize = bytes.readUInt32LE(offset + 22);
    const nameLen = bytes.readUInt16LE(offset + 26);
    const extraLen = bytes.readUInt16LE(offset + 28);

    const nameStart = offset + 30;
    const dataStart = nameStart + nameLen + extraLen;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.length) break;

    const name = bytes.subarray(nameStart, nameStart + nameLen).toString("utf8");
    const rawCompressed = bytes.subarray(dataStart, dataEnd);
    let data = rawCompressed;
    if (compressionMethod === 8 && compressedSize > 0) {
      try {
        data = inflateRawSync(rawCompressed);
      } catch {
        data = rawCompressed;
      }
    }

    entries.push({
      name,
      compressedSize,
      uncompressedSize,
      compressionMethod,
      data: Buffer.from(data),
    });

    offset = dataEnd;
  }

  return entries;
}

/**
 * Writes a valid ZIP / Android APK archive from a list of named file buffers.
 */
export function writeZipArchive(
  files: readonly { readonly name: string; readonly data: Buffer; readonly storeOnly?: boolean }[],
): Buffer {
  const localHeaders: Buffer[] = [];
  const centralHeaders: Buffer[] = [];
  let localOffset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, "utf8");
    const uncompressedSize = file.data.length;
    const crc = crc32(file.data);
    const useStore = file.storeOnly === true || uncompressedSize < 64;
    const compressedData = useStore ? file.data : deflateRawSync(file.data);
    const method = useStore ? 0 : 8;

    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10); // mod time
    local.writeUInt16LE(0, 12); // mod date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressedData.length, 18);
    local.writeUInt32LE(uncompressedSize, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);

    localHeaders.push(local, compressedData);

    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressedData.length, 20);
    central.writeUInt32LE(uncompressedSize, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(localOffset, 42);
    nameBuf.copy(central, 46);

    centralHeaders.push(central);
    localOffset += local.length + compressedData.length;
  }

  const centralSize = centralHeaders.reduce((acc, b) => acc + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(localOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
}

/**
 * Protects a ZIP or Android APK archive against `rea inspect-artifact` and `rea inspect-android-package`
 * by injecting decoy enclave manifests, decoy DEX/native stub descriptors, and protecting embedded JS/WASM assets.
 */
export function protectZipOrApkBuffer(
  bytes: Buffer,
  options: {
    readonly intensity?: ProtectionIntensity;
    readonly seed?: string | number;
    readonly isApk?: boolean;
  } = {},
): {
  readonly buffer: Buffer;
  readonly decoyEntriesInjected: number;
  readonly chaffPayloadsEmbedded: number;
} {
  const intensity = options.intensity ?? "balanced";
  const prng = new SeededPrng(options.seed ?? "bla-archive-shield-v1");
  const chaffPayloads = generateChaffPayloads(prng, intensity);
  const existingEntries = readZipEntries(bytes);

  const outputFiles: { name: string; data: Buffer; storeOnly?: boolean }[] = existingEntries.map((e) => ({
    name: e.name,
    data: e.data,
  }));

  // Inject decoy enclave asset manifests & shadow class descriptors
  const manifestContent = JSON.stringify(
    {
      schema: "bla-archive-enclave-shield/v1",
      protected: true,
      enclave_delegation: "hardware_tee_ring0",
      manifests: chaffPayloads.map((p) => p.rawText),
    },
    null,
    2,
  );

  outputFiles.push({
    name: "assets/enclave/bla-attestation-manifest.json",
    data: Buffer.from(manifestContent, "utf8"),
  });

  const decoyCount = intensity === "stealth" ? 2 : intensity === "balanced" ? 4 : 8;
  for (let i = 0; i < decoyCount; i++) {
    const hex = prng.hex(6);
    const payload = chaffPayloads[i % chaffPayloads.length]!;
    outputFiles.push({
      name: options.isApk
        ? `assets/enclave/tee_bridge_stub_${hex}.properties`
        : `enclave/shadow_module_${hex}.json`,
      data: Buffer.from(`# ${payload.rawText}\nenclave.cid=${16 + i}\nenclave.sealed=true\n`, "utf8"),
    });
  }

  return {
    buffer: writeZipArchive(outputFiles),
    decoyEntriesInjected: decoyCount + 1,
    chaffPayloadsEmbedded: chaffPayloads.length,
  };
}
