import { SeededPrng } from "../../core/prng.js";
import type { ProtectionIntensity } from "../../core/types.js";
import { buildCanaryAndDiagnosticPayloads } from "../deception/format-payloads.js";

/** Classic libpcap global-header magic (microsecond, little-endian host). */
const PCAP_MAGIC_LE = 0xa1b2c3d4;

export interface PcapInspection {
  readonly validMagic: boolean;
  readonly versionMajor: number;
  readonly versionMinor: number;
  readonly packetCount: number;
  readonly blaProtected: boolean;
}

function buildGlobalHeader(): Buffer {
  const hdr = Buffer.alloc(24);
  hdr.writeUInt32LE(PCAP_MAGIC_LE, 0);
  hdr.writeUInt16LE(2, 4); // version major
  hdr.writeUInt16LE(4, 6); // version minor
  hdr.writeInt32LE(0, 8); // thiszone
  hdr.writeUInt32LE(0, 12); // sigfigs
  hdr.writeUInt32LE(65535, 16); // snaplen
  hdr.writeUInt32LE(1, 20); // network = Ethernet
  return hdr;
}

/** Minimal Ethernet + IPv4 + UDP frame carrying a UTF-8 payload. */
function buildUdpPacket(payload: Buffer, tsSec: number, tsUsec: number): Buffer {
  const eth = Buffer.alloc(14, 0);
  eth[12] = 0x08;
  eth[13] = 0x00; // IPv4
  const ipLen = 20 + 8 + payload.length;
  const ip = Buffer.alloc(20, 0);
  ip[0] = 0x45;
  ip.writeUInt16BE(ipLen, 2);
  ip[8] = 64; // TTL
  ip[9] = 17; // UDP
  ip[12] = 10;
  ip[13] = 0;
  ip[14] = 0;
  ip[15] = 1;
  ip[16] = 10;
  ip[17] = 0;
  ip[18] = 0;
  ip[19] = 2;
  // Leave checksum 0 (valid for many offline parsers)
  const udp = Buffer.alloc(8, 0);
  udp.writeUInt16BE(1337, 0);
  udp.writeUInt16BE(53, 2);
  udp.writeUInt16BE(8 + payload.length, 4);
  const frame = Buffer.concat([eth, ip, udp, payload]);
  const recHdr = Buffer.alloc(16);
  recHdr.writeUInt32LE(tsSec, 0);
  recHdr.writeUInt32LE(tsUsec, 4);
  recHdr.writeUInt32LE(frame.length, 8);
  recHdr.writeUInt32LE(frame.length, 12);
  return Buffer.concat([recHdr, frame]);
}

export function inspectPcapCapture(bytes: Buffer): PcapInspection {
  const validMagic =
    bytes.length >= 24 &&
    (bytes.readUInt32LE(0) === PCAP_MAGIC_LE ||
      bytes.readUInt32BE(0) === PCAP_MAGIC_LE ||
      bytes.readUInt32LE(0) === 0xa1b23c4d); // nanosecond variant
  let versionMajor = 0;
  let versionMinor = 0;
  let packetCount = 0;
  if (validMagic && bytes.length >= 24) {
    const le = bytes.readUInt32LE(0) === PCAP_MAGIC_LE || bytes.readUInt32LE(0) === 0xa1b23c4d;
    versionMajor = le ? bytes.readUInt16LE(4) : bytes.readUInt16BE(4);
    versionMinor = le ? bytes.readUInt16LE(6) : bytes.readUInt16BE(6);
    let at = 24;
    while (at + 16 <= bytes.length) {
      const incl = le ? bytes.readUInt32LE(at + 8) : bytes.readUInt32BE(at + 8);
      at += 16 + incl;
      if (at > bytes.length) break;
      packetCount++;
      if (packetCount > 100_000) break;
    }
  }
  return {
    validMagic,
    versionMajor,
    versionMinor,
    packetCount,
    blaProtected: bytes.includes(Buffer.from("[BLA-PCAP-SHIELD]", "utf8")),
  };
}

/**
 * Protects a classic libpcap capture by appending UDP packets whose payloads
 * carry canary/diagnostic strings. Preserves the original global header and
 * existing packets byte-for-byte; only appends new records.
 *
 * Note: REA's tshark path budgets JSON output (`TSHARK_JSON_MAX_BYTES`); these
 * decoy packets are designed to inflate dissected JSON when tshark runs.
 */
export function protectPcapCaptureBuffer(
  input: Buffer,
  options: {
    readonly intensity?: ProtectionIntensity;
    readonly seed?: string;
  } = {},
): {
  readonly buffer: Buffer;
  readonly packetsInjected: number;
  readonly canaryTokensEmbedded: number;
  readonly diagnosticsEmbedded: number;
} {
  const intensity = options.intensity ?? "balanced";
  const prng = new SeededPrng(options.seed ?? "bla-pcap-shield");
  const deception = buildCanaryAndDiagnosticPayloads(prng, intensity);

  const base =
    input.length >= 24 &&
    (input.readUInt32LE(0) === PCAP_MAGIC_LE ||
      input.readUInt32BE(0) === PCAP_MAGIC_LE ||
      input.readUInt32LE(0) === 0xa1b23c4d)
      ? input
      : buildGlobalHeader();

  const packetTarget =
    intensity === "bankrupt" ? 256 : intensity === "maximum" ? 64 : 16;

  const injected: Buffer[] = [];
  const records = [
    "[BLA-PCAP-SHIELD]",
    ...deception.textRecords.slice(0, 12),
    `BLA_PCAP_CANARY=${prng.hex(16)}`,
  ];
  for (let i = 0; i < packetTarget; i++) {
    const payload = Buffer.from(
      `${records[i % records.length]}\npcap_decoy=${i}\n`,
      "utf8",
    );
    injected.push(buildUdpPacket(payload, 1_700_000_000 + i, i * 1000));
  }

  return {
    buffer: Buffer.concat([base, ...injected]),
    packetsInjected: injected.length,
    canaryTokensEmbedded: deception.canary.syntheticCanaryTokens.length,
    diagnosticsEmbedded: deception.diagnostics.diagnosticsInjected.length,
  };
}
