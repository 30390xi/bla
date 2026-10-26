import { createRequire } from "node:module";
import { join } from "node:path";
import { BLA_ROOT } from "./paths.mjs";

const require = createRequire(import.meta.url);

/** Load BLA compiled modules (dist/). */
export async function loadBla() {
  const base = join(BLA_ROOT, "dist/shields/formats");
  return {
    buildMappedGoFlutterElfFixture: (
      await import(join(base, "go-flutter-exhaustion.js"))
    ).buildMappedGoFlutterElfFixture,
    protectNativeBinary: (await import(join(base, "native.js")))
      .protectNativeBinary,
    resolveElf64SectionNames: (await import(join(base, "native.js")))
      .resolveElf64SectionNames,
    validateElf64Layout: (await import(join(base, "native.js")))
      .validateElf64Layout,
    protectErlangBeamBuffer: (await import(join(base, "erlang-beam.js")))
      .protectErlangBeamBuffer,
    protectEvmBytecodeBuffer: (await import(join(base, "evm-bytecode.js")))
      .protectEvmBytecodeBuffer,
    protectPcapCaptureBuffer: (await import(join(base, "pcap-capture.js")))
      .protectPcapCaptureBuffer,
    protectGpuPtxText: (await import(join(base, "gpu-ptx.js"))).protectGpuPtxText,
    buildSafetensorsBuffer: (await import(join(base, "model.js")))
      .buildSafetensorsBuffer,
    protectSafetensorsBuffer: (await import(join(base, "model.js")))
      .protectSafetensorsBuffer,
    protectGgufBuffer: (await import(join(base, "model.js"))).protectGgufBuffer,
    REA_INTERNAL_LIMITS: (await import(join(BLA_ROOT, "dist/identity.js")))
      .REA_INTERNAL_LIMITS,
  };
}

function u32be(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0);
  return b;
}

function beamChunk(name, payload) {
  const pad = (4 - (payload.length % 4)) % 4;
  return Buffer.concat([
    Buffer.from(name, "latin1"),
    u32be(payload.length),
    payload,
    Buffer.alloc(pad),
  ]);
}

/** Minimal valid BEAM with non-compact AtU8. */
export function buildMinimalBeam() {
  const atoms = Buffer.concat([
    u32be(3),
    Buffer.from([4]),
    Buffer.from("main"),
    Buffer.from([6]),
    Buffer.from("module"),
    Buffer.from([4]),
    Buffer.from("init"),
  ]);
  const code = Buffer.alloc(20);
  code.writeUInt32BE(16, 0);
  const body = Buffer.concat([
    beamChunk("AtU8", atoms),
    beamChunk("Code", code),
    beamChunk("StrT", Buffer.from("x")),
  ]);
  return Buffer.concat([
    Buffer.from("FOR1"),
    u32be(4 + body.length),
    Buffer.from("BEAM"),
    body,
  ]);
}

/** Minimal EVM runtime bytecode (no metadata). */
export function buildMinimalEvm() {
  return Buffer.from("6080604052348015600f575f80fd5b50", "hex");
}

/** Minimal classic libpcap (empty global header only → protect appends decoys). */
export function buildEmptyPcap() {
  return Buffer.alloc(0);
}

/** Minimal classic libpcap global header (LE magic). */
export function buildMinimalPcap() {
  const h = Buffer.alloc(24, 0);
  h.writeUInt32LE(0xa1b2c3d4, 0);
  h.writeUInt16LE(2, 4);
  h.writeUInt16LE(4, 6);
  h.writeUInt32LE(65535, 16);
  h.writeUInt32LE(1, 20); // LINKTYPE_ETHERNET
  return h;
}

export function buildMinimalPtx() {
  return Buffer.from(
    `.version 7.0
.target sm_70
.address_size 64
.visible .entry demo(.param .u64 out) { ret; }
`,
    "utf8",
  );
}

export function buildMinimalSafetensors(bla) {
  return bla.buildSafetensorsBuffer(
    {
      weight: { dtype: "F32", shape: [2, 2], data_offsets: [0, 16] },
      __metadata__: { model: "redteam-demo" },
    },
    Buffer.alloc(16),
  );
}

/** Tiny GGUF v3 with one string KV — protect injects nesting breaker. */
export function buildMinimalGguf() {
  // Magic GGUF, version 3, tensor_count=0, kv_count=0
  const b = Buffer.alloc(24, 0);
  b.write("GGUF", 0);
  b.writeUInt32LE(3, 4);
  b.writeBigUInt64LE(0n, 8);
  b.writeBigUInt64LE(0n, 16);
  return b;
}

/**
 * Build the red-team sample matrix: one entry per empirically runnable format.
 */
export async function buildSampleMatrix() {
  const bla = await loadBla();
  const intensity = "bankrupt";
  const seed = "bla-redteam-empirical-v1";

  const elfRaw = bla.buildMappedGoFlutterElfFixture();
  const elfHard = bla.protectNativeBinary(elfRaw, { intensity, seed });

  const beamRaw = buildMinimalBeam();
  const beamHard = bla.protectErlangBeamBuffer(beamRaw, { intensity, seed });

  const evmRaw = buildMinimalEvm();
  const evmHard = bla.protectEvmBytecodeBuffer(evmRaw, { intensity, seed });

  const pcapRaw = buildMinimalPcap();
  const pcapHard = bla.protectPcapCaptureBuffer(pcapRaw, {
    intensity,
    seed,
  });

  const ptxRaw = buildMinimalPtx();
  const ptxHard = bla.protectGpuPtxText(ptxRaw.toString('utf8'), { intensity, seed });

  const stRaw = buildMinimalSafetensors(bla);
  const stHard = bla.protectSafetensorsBuffer(stRaw, { intensity, seed });

  let ggufRaw = buildMinimalGguf();
  let ggufHard;
  try {
    ggufHard = bla.protectGgufBuffer(ggufRaw, { intensity, seed });
  } catch (err) {
    ggufHard = { buffer: ggufRaw, error: String(err?.message ?? err) };
  }

  return {
    bla,
    intensity,
    seed,
    samples: {
      go_flutter_elf: {
        format: "go_flutter_elf",
        before: elfRaw,
        after: elfHard.buffer,
        meta: {
          mappedGo: elfHard.mappedGoBuildInfoPlanted,
          mappedFlutter: elfHard.mappedFlutterPoolPlanted,
          goTripsMax: elfHard.goBuildInfoExceedsLimit,
        },
      },
      erlang_beam: {
        format: "erlang_beam",
        before: beamRaw,
        after: beamHard.buffer,
        meta: {
          atomsInjected: beamHard.atomsInjected,
          chunksInjected: beamHard.chunksInjected,
          exceedsDefaultChunkBudget: beamHard.exceedsDefaultChunkBudget,
        },
      },
      evm_bytecode: {
        format: "evm_bytecode",
        before: evmRaw,
        after: evmHard.buffer,
        meta: {
          approachesInputBudget: evmHard.approachesInputBudget,
          afterBytes: evmHard.buffer.length,
        },
      },
      pcap_capture: {
        format: "pcap_capture",
        before: pcapRaw,
        after: pcapHard.buffer,
        meta: {
          estimatedTsharkJsonBytes: pcapHard.estimatedTsharkJsonBytes,
          exceedsTsharkJsonBudget: pcapHard.exceedsTsharkJsonBudget,
          packetsInjected: pcapHard.packetsInjected,
        },
      },
      gpu_ptx: {
        format: "gpu_ptx",
        before: ptxRaw,
        after: Buffer.from(ptxHard.text, "utf8"),
        meta: { entriesInjected: ptxHard.entriesInjected },
      },
      safetensors: {
        format: "safetensors",
        before: stRaw,
        after: stHard.buffer,
        meta: {
          triggeredJsonNestingBreaker: stHard.triggeredJsonNestingBreaker,
          canaryTokensEmbedded: stHard.canaryTokensEmbedded,
        },
      },
      gguf: {
        format: "gguf",
        before: ggufRaw,
        after: ggufHard.buffer,
        meta: {
          error: ggufHard.error,
          triggeredMetadataNestingBreaker:
            ggufHard.triggeredMetadataNestingBreaker === true,
        },
      },
    },
  };
}
