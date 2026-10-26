import { REA_INTERNAL_LIMITS } from "../../identity.js";
import { SeededPrng } from "../../core/prng.js";
import type { ProtectionIntensity } from "../../core/types.js";
import { buildCanaryAndDiagnosticPayloads } from "../deception/format-payloads.js";

const FOR1 = Buffer.from("FOR1", "latin1");
const BEAM = Buffer.from("BEAM", "latin1");

function u32be(value: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(value >>> 0);
  return b;
}

function pad4(bytes: Buffer): Buffer {
  const pad = (4 - (bytes.length % 4)) % 4;
  return pad === 0 ? bytes : Buffer.concat([bytes, Buffer.alloc(pad)]);
}

function encodeChunk(name: string, payload: Buffer): Buffer {
  if (name.length !== 4) throw new Error(`BEAM chunk name must be 4 chars: ${name}`);
  return Buffer.concat([
    Buffer.from(name, "latin1"),
    u32be(payload.length),
    pad4(payload),
  ]);
}

/** Non-compact AtU8 atom table (positive count, 1-byte lengths). */
function encodeAtU8(names: readonly string[]): Buffer {
  const parts: Buffer[] = [u32be(names.length)];
  for (const name of names) {
    const encoded = Buffer.from(name, "utf8");
    if (encoded.length > 255) {
      throw new Error(`BEAM atom name too long for non-compact encoding: ${name}`);
    }
    parts.push(Buffer.from([encoded.length]), encoded);
  }
  return encodeChunk("AtU8", Buffer.concat(parts));
}

export interface BeamChunkView {
  readonly name: string;
  readonly payload: Buffer;
}

export interface ErlangBeamInspection {
  readonly validMagic: boolean;
  readonly formSize: number;
  readonly chunkCount: number;
  readonly chunkNames: readonly string[];
  readonly atomCount: number;
  readonly blaProtected: boolean;
}

function parseBeamChunks(bytes: Buffer): {
  readonly valid: boolean;
  readonly formSize: number;
  readonly chunks: BeamChunkView[];
} {
  if (
    bytes.length < 12 ||
    bytes.subarray(0, 4).toString("latin1") !== "FOR1" ||
    bytes.subarray(8, 12).toString("latin1") !== "BEAM"
  ) {
    return { valid: false, formSize: 0, chunks: [] };
  }
  const formSize = bytes.readUInt32BE(4);
  const formEnd = 8 + formSize;
  if (formEnd > bytes.length) return { valid: false, formSize, chunks: [] };
  const chunks: BeamChunkView[] = [];
  let at = 12;
  while (at + 8 <= formEnd) {
    const name = bytes.subarray(at, at + 4).toString("latin1");
    const size = bytes.readUInt32BE(at + 4);
    const payloadOffset = at + 8;
    const padded = payloadOffset + size + ((4 - (size % 4)) % 4);
    if (padded > formEnd || payloadOffset + size > bytes.length) break;
    chunks.push({
      name,
      payload: Buffer.from(bytes.subarray(payloadOffset, payloadOffset + size)),
    });
    at = padded;
  }
  return { valid: true, formSize, chunks };
}

function decodeAtU8Names(payload: Buffer): string[] {
  if (payload.length < 4) return [];
  const declared = payload.readInt32BE(0);
  if (declared < 0) return []; // compact OTP layout — leave untouched
  const count = declared;
  const names: string[] = [];
  let at = 4;
  for (let i = 0; i < count; i++) {
    if (at >= payload.length) break;
    const len = payload[at]!;
    at += 1;
    if (at + len > payload.length) break;
    names.push(payload.subarray(at, at + len).toString("utf8"));
    at += len;
  }
  return names;
}

export function inspectErlangBeam(bytes: Buffer): ErlangBeamInspection {
  const parsed = parseBeamChunks(bytes);
  let atomCount = 0;
  for (const chunk of parsed.chunks) {
    if (chunk.name === "AtU8" || chunk.name === "Atom") {
      if (chunk.payload.length >= 4) {
        atomCount = Math.abs(chunk.payload.readInt32BE(0));
      }
    }
  }
  const text = bytes.toString("latin1");
  return {
    validMagic: parsed.valid,
    formSize: parsed.formSize,
    chunkCount: parsed.chunks.length,
    chunkNames: parsed.chunks.map((c) => c.name),
    atomCount,
    blaProtected:
      text.includes("[BLA-BEAM-SHIELD]") ||
      parsed.chunks.some((c) => c.name.startsWith("Bla")),
  };
}

function rebuildBeam(chunks: readonly BeamChunkView[]): Buffer {
  const body = Buffer.concat([
    BEAM,
    ...chunks.map((c) => encodeChunk(c.name, c.payload)),
  ]);
  return Buffer.concat([FOR1, u32be(body.length), body]);
}

/**
 * Protects an Erlang BEAM IFF container:
 * - Preserves original chunk order and non-AtU8 payloads (Code/ExpT/ImpT stay intact).
 * - Appends canary atoms onto a non-compact AtU8 table (original indices preserved).
 * - Appends decoy IFF chunks past REA's default `max_chunks` (64) budget.
 * Compact (OTP28+) AtU8 tables are left byte-identical; decoy chunks still apply.
 */
export function protectErlangBeamBuffer(
  input: Buffer,
  options: {
    readonly intensity?: ProtectionIntensity;
    readonly seed?: string;
  } = {},
): {
  readonly buffer: Buffer;
  readonly chunksInjected: number;
  readonly atomsInjected: number;
  readonly canaryTokensEmbedded: number;
  readonly diagnosticsEmbedded: number;
  readonly exceedsDefaultChunkBudget: boolean;
  readonly exceedsDefaultAtomBudget: boolean;
} {
  const intensity = options.intensity ?? "balanced";
  const prng = new SeededPrng(options.seed ?? "bla-beam-shield");
  const deception = buildCanaryAndDiagnosticPayloads(prng, intensity);

  const parsed = parseBeamChunks(input);
  const baseChunks: BeamChunkView[] = parsed.valid
    ? parsed.chunks.map((c) => ({ name: c.name, payload: Buffer.from(c.payload) }))
    : [
        {
          name: "AtU8",
          payload: (() => {
            // Minimal valid module atoms so ExpT can reference indices.
            const names = ["bla_beam_module", "module_info", "start"];
            const parts: Buffer[] = [u32be(names.length)];
            for (const name of names) {
              const enc = Buffer.from(name, "utf8");
              parts.push(Buffer.from([enc.length]), enc);
            }
            return Buffer.concat(parts);
          })(),
        },
        {
          name: "Code",
          payload: Buffer.concat([
            u32be(16),
            u32be(0),
            u32be(169),
            u32be(4),
            u32be(2),
            Buffer.from("code"),
          ]),
        },
        {
          name: "ExpT",
          payload: Buffer.concat([u32be(1), u32be(2), u32be(0), u32be(1)]),
        },
      ];

  // Expand non-compact AtU8 in place (keep original atom indices).
  let atomsInjected = 0;
  let exceedsDefaultAtomBudget = false;
  const atomExtraTarget =
    intensity === "bankrupt" || intensity === "maximum"
      ? REA_INTERNAL_LIMITS.BEAM_DEFAULT_MAX_ATOMS + 64
      : 48;

  for (let i = 0; i < baseChunks.length; i++) {
    const chunk = baseChunks[i]!;
    if (chunk.name !== "AtU8") continue;
    const existing = decodeAtU8Names(chunk.payload);
    if (existing.length === 0) break; // compact or undecodable — skip mutation
    const extras: string[] = [
      "bla_beam_canary",
      `[BLA-BEAM-SHIELD]`,
      ...deception.textRecords
        .map((r) => r.replace(/[^\w.:/=+-]/g, "_").slice(0, 200))
        .filter((r) => r.length > 0)
        .slice(0, 16),
    ];
    while (existing.length + extras.length < atomExtraTarget) {
      extras.push(`bla_tarpit_atom_${extras.length}_${prng.hex(4)}`);
    }
    const merged = [...existing, ...extras];
    atomsInjected = extras.length;
    exceedsDefaultAtomBudget =
      merged.length > REA_INTERNAL_LIMITS.BEAM_DEFAULT_MAX_ATOMS;
    // Replace this chunk's payload with expanded AtU8 body (not wrapped again).
    const parts: Buffer[] = [u32be(merged.length)];
    for (const name of merged) {
      const enc = Buffer.from(name, "utf8");
      if (enc.length > 255) continue;
      parts.push(Buffer.from([enc.length]), enc);
    }
    baseChunks[i] = { name: "AtU8", payload: Buffer.concat(parts) };
    break;
  }

  // Decoy chunks: push past default max_chunks (64); bankrupt approaches hard 256.
  const targetChunks =
    intensity === "bankrupt"
      ? REA_INTERNAL_LIMITS.BEAM_MAX_CHUNKS + 4
      : intensity === "maximum"
        ? REA_INTERNAL_LIMITS.BEAM_DEFAULT_MAX_CHUNKS + 32
        : REA_INTERNAL_LIMITS.BEAM_DEFAULT_MAX_CHUNKS + 8;

  const decoyPayload = Buffer.from(
    [
      "[BLA-BEAM-SHIELD]",
      ...deception.textRecords.slice(0, 8),
      `BLA_BEAM_CANARY=${prng.hex(16)}`,
    ].join("\0") + "\0",
    "utf8",
  );

  let chunksInjected = 0;
  while (baseChunks.length < targetChunks) {
    const idx = chunksInjected;
    // 4-char IFF names; "Bla0".."Bla9" then "Bl10"+ via hex
    const name =
      idx < 10
        ? `Bla${idx}`
        : idx < 36
          ? `Bl${idx.toString(36).padStart(2, "0")}`.slice(0, 4)
          : `B${idx.toString(36).padStart(3, "0")}`.slice(0, 4);
    baseChunks.push({
      name: name.padEnd(4, "x").slice(0, 4),
      payload: Buffer.concat([
        decoyPayload,
        Buffer.from(`\nchunk=${idx}\n`, "utf8"),
      ]),
    });
    chunksInjected++;
  }

  const buffer = rebuildBeam(baseChunks);
  return {
    buffer,
    chunksInjected,
    atomsInjected,
    canaryTokensEmbedded: deception.canary.syntheticCanaryTokens.length,
    diagnosticsEmbedded: deception.diagnostics.diagnosticsInjected.length,
    exceedsDefaultChunkBudget:
      baseChunks.length > REA_INTERNAL_LIMITS.BEAM_DEFAULT_MAX_CHUNKS,
    exceedsDefaultAtomBudget,
  };
}
