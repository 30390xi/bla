import { writeFileSync, mkdtempSync } from "node:fs";
import { open } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  resolveReaDist,
  resolveTsharkEnv,
  reaDistReady,
} from "./paths.mjs";

const require = createRequire(import.meta.url);

/** Faithful replica of REA `projectStringPool` (private in FlutterBuildProvider). */
export function projectStringPoolReaFaithful(section, limits) {
  const MAX_POOL_URIS = limits.DART_MAX_POOL_URIS;
  const MAX_POOL_TOKENS = limits.DART_MAX_POOL_TOKENS;
  const COLLECTION_SLACK = 2;
  const MAX_RUN_BYTES = 1024;
  const IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/u;
  const packages = new Set();
  const darts = new Set();
  const tokens = new Set();
  let runCount = 0;
  let collectionCapped = false;
  const packageBudget = MAX_POOL_URIS * COLLECTION_SLACK;
  const dartBudget = MAX_POOL_URIS * COLLECTION_SLACK;
  const tokenBudget = MAX_POOL_TOKENS * COLLECTION_SLACK;
  if (section != null) {
    let run = "";
    let overflowed = false;
    const consider = (text) => {
      if (text.length < 5) return;
      runCount += 1;
      if (text.startsWith("package:")) {
        if (!packages.has(text) && packages.size >= packageBudget)
          collectionCapped = true;
        else packages.add(text);
      } else if (text.startsWith("dart:")) {
        if (!darts.has(text) && darts.size >= dartBudget)
          collectionCapped = true;
        else darts.add(text);
      } else if (
        text.length <= 128 &&
        text.length >= 5 &&
        IDENTIFIER_PATTERN.test(text)
      ) {
        if (!tokens.has(text) && tokens.size >= tokenBudget)
          collectionCapped = true;
        else tokens.add(text);
      }
    };
    for (const byte of section) {
      if (byte >= 0x20 && byte < 0x7f) {
        if (run.length < MAX_RUN_BYTES) run += String.fromCharCode(byte);
        else {
          overflowed = true;
          collectionCapped = true;
        }
      } else {
        if (!overflowed) consider(run);
        overflowed = false;
        run = "";
      }
    }
    if (!overflowed) consider(run);
  }
  return {
    packageUriCount: packages.size,
    dartUriCount: darts.size,
    classLikeTokenCount: tokens.size,
    printableRunCount: runCount,
    collectionCapped,
    reportWouldCap:
      packages.size > MAX_POOL_URIS ||
      darts.size > MAX_POOL_URIS ||
      tokens.size > MAX_POOL_TOKENS,
  };
}

function outcomeBase(format, phase, bytes) {
  return {
    format,
    phase,
    inputBytes: bytes.length,
    status: "ok",
    errorName: null,
    errorMessage: null,
    budgetHit: false,
    budgetName: null,
    redactionOrAmbiguity: null,
    metrics: {},
  };
}

function failOutcome(base, err, budgetName = null) {
  base.status = "error";
  base.errorName = err?.constructor?.name ?? "Error";
  base.errorMessage = String(err?.message ?? err).slice(0, 240);
  if (budgetName || err?.boundary || err?.limit) {
    base.budgetHit = true;
    base.budgetName =
      budgetName ??
      err?.boundary ??
      err?.limit ??
      err?.capacity ??
      "resource";
  }
  return base;
}

export async function loadReaProbes() {
  if (!reaDistReady()) {
    throw new Error(
      "REA dist missing — compile with: cd ../rea && npx tsc -p tsconfig.build.json",
    );
  }
  const { readGoBinaryImage } = await import(
    resolveReaDist("go/GoBinaryImage.js")
  );
  const { parseErlangBeam, BeamCapacityFailure } = await import(
    resolveReaDist("erlang/BeamParser.js")
  );
  const { EVM_INTERFACE_LIMITS } = await import(
    resolveReaDist("evm/EvmoleRelease.js")
  );
  const { decodeEvmBytecodeCarrier } = await import(
    resolveReaDist("evm/EvmBytecodeCarrier.js")
  );
  const { inspectSolidityMetadata } = await import(
    resolveReaDist("evm/SolidityMetadata.js")
  );
  const { TSHARK_JSON_MAX_BYTES, parseTsharkJsonOutput } = await import(
    resolveReaDist("pcap/PcapOutput.js")
  );
  const { MODEL_JSON_NESTING, MODEL_METADATA_NESTING, ModelFormatFailure } =
    await import(resolveReaDist("model/ModelFormat.js"));
  const { readSafetensorsHeader } = await import(
    resolveReaDist("model/SafetensorsHeader.js")
  );
  const { ModelHeaderReader } = await import(
    resolveReaDist("model/ModelHeaderReader.js")
  );
  const { GgufHeader } = await import(resolveReaDist("model/GgufHeader.js"));
  return {
    readGoBinaryImage,
    parseErlangBeam,
    BeamCapacityFailure,
    EVM_INTERFACE_LIMITS,
    decodeEvmBytecodeCarrier,
    inspectSolidityMetadata,
    TSHARK_JSON_MAX_BYTES,
    parseTsharkJsonOutput,
    MODEL_JSON_NESTING,
    MODEL_METADATA_NESTING,
    ModelFormatFailure,
    readSafetensorsHeader,
    ModelHeaderReader,
    GgufHeader,
  };
}

export async function probeGo(rea, bytes, phase) {
  const base = outcomeBase("go_buildinfo", phase, bytes);
  try {
    const img = rea.readGoBinaryImage(bytes);
    base.metrics = {
      hasBuildInfo: img.build_info != null,
      encoding: img.build_info?.encoding ?? null,
      goVersion: img.build_info?.go_version ?? null,
      moduleTextBytes: img.build_info?.module_text?.length ?? 0,
    };
    if (img.build_info == null) {
      base.redactionOrAmbiguity = "no_buildinfo_observed";
    }
  } catch (err) {
    failOutcome(base, err, err?.boundary === "build-info" ? "MAX_BUILD_INFO_BYTES" : err?.boundary);
  }
  return base;
}

export async function probeFlutterPool(bla, bytes, phase, limits) {
  const base = outcomeBase("flutter_pool", phase, bytes);
  try {
    // validateElf64Layout throws on invalid; returns layout summary otherwise.
    const layout = bla.validateElf64Layout(bytes);
    const names = bla.resolveElf64SectionNames(bytes, layout);
    const iso = names.get(".isolate");
    if (!iso) {
      base.redactionOrAmbiguity = "no_isolate_section";
      return base;
    }
    const section = bytes.subarray(iso.offset, iso.offset + iso.size);
    const pool = projectStringPoolReaFaithful(section, limits);
    base.metrics = { isolateBytes: iso.size, ...pool };
    if (pool.reportWouldCap) {
      base.budgetHit = true;
      base.budgetName = "MAX_POOL_URIS|MAX_POOL_TOKENS";
      base.redactionOrAmbiguity =
        "REA would report truncated package_uris/dart_uris/class_like_tokens with 'at least N' limitations";
    }
  } catch (err) {
    failOutcome(base, err);
  }
  return base;
}

export async function probeBeam(rea, bytes, phase) {
  const base = outcomeBase("erlang_beam", phase, bytes);
  try {
    const artifact = {
      path: "sample.beam",
      bytes: bytes.length,
      sha256: "0".repeat(64),
    };
    const result = rea.parseErlangBeam(bytes, artifact, {
      max_chunks: 64,
      max_atoms: 4096,
    });
    base.metrics = {
      chunkCount: result.chunks.length,
      atomCount: result.atoms?.length ?? 0,
      limitations: (result.limitations ?? []).slice(0, 3),
    };
  } catch (err) {
    const name =
      err?.constructor?.name === "BeamCapacityFailure"
        ? err.resource === "chunks"
          ? "max_chunks"
          : err.resource === "atoms"
            ? "max_atoms"
            : "beam_capacity"
        : null;
    failOutcome(base, err, name);
  }
  return base;
}

export async function probeEvm(rea, bytes, phase) {
  const base = outcomeBase("evm_bytecode", phase, bytes);
  const limit = rea.EVM_INTERFACE_LIMITS.inputBytes;
  base.metrics = {
    inputBytes: bytes.length,
    inputBytesLimit: limit,
    approachesLimit: bytes.length >= limit - 8192,
    exceedsLimit: bytes.length > limit,
  };
  if (bytes.length > limit) {
    base.budgetHit = true;
    base.budgetName = "EVM_INTERFACE_LIMITS.inputBytes";
    base.status = "rejected_pre_worker";
    base.redactionOrAmbiguity =
      "REA would refuse to start the EVM worker (input exceeds 4 MiB)";
    return base;
  }
  try {
    try {
      const carrier = rea.decodeEvmBytecodeCarrier(bytes, "raw");
      base.metrics.carrierBytes = carrier?.length;
    } catch (err) {
      base.metrics.carrierError = String(err.message).slice(0, 120);
    }
    try {
      const meta = rea.inspectSolidityMetadata(bytes);
      base.metrics.solidityMetadata = meta;
    } catch (err) {
      base.metrics.metadataError = String(err.message).slice(0, 120);
    }
    if (base.metrics.approachesLimit) {
      base.budgetHit = true;
      base.budgetName = "EVM_INTERFACE_LIMITS.inputBytes (approach)";
      base.redactionOrAmbiguity =
        "Hardened sample approaches full 4 MiB input budget";
    }
  } catch (err) {
    failOutcome(base, err);
  }
  return base;
}

export async function probePcap(rea, bytes, phase) {
  const base = outcomeBase("pcap_capture", phase, bytes);
  const tshark = resolveTsharkEnv();
  if (!tshark.available) {
    base.status = "skipped";
    base.redactionOrAmbiguity =
      "not empirically verified on this box (requires tshark)";
    return base;
  }
  const dir = mkdtempSync(join(tmpdir(), "bla-rt-pcap-"));
  const path = join(dir, `${phase}.pcap`);
  writeFileSync(path, bytes);
  const proc = spawnSync(
    tshark.bin,
    ["-r", path, "-T", "json"],
    {
      encoding: "buffer",
      maxBuffer: 64 * 1024 * 1024,
      env: tshark.env,
      timeout: 120_000,
    },
  );
  const jsonBytes = proc.stdout ? proc.stdout.length : 0;
  base.metrics = {
    tsharkStatus: proc.status,
    tsharkJsonBytes: jsonBytes,
    tsharkJsonLimit: rea.TSHARK_JSON_MAX_BYTES,
    exceedsTsharkJsonBudget: jsonBytes > rea.TSHARK_JSON_MAX_BYTES,
    stderrHead: proc.stderr
      ? Buffer.from(proc.stderr).toString("utf8").slice(0, 160)
      : "",
  };
  if (proc.error) {
    failOutcome(base, proc.error, "tshark");
    return base;
  }
  if (jsonBytes > rea.TSHARK_JSON_MAX_BYTES) {
    base.budgetHit = true;
    base.budgetName = "TSHARK_JSON_MAX_BYTES";
    base.redactionOrAmbiguity =
      "REA parseTsharkJsonOutput would throw AnalysisResourceConstraintError";
    // Confirm REA's parser rejects oversized JSON
    try {
      await rea.parseTsharkJsonOutput(proc.stdout.toString("utf8"));
      base.metrics.reaParseAcceptedOversized = true;
    } catch (err) {
      base.metrics.reaParseErrorName = err?.constructor?.name;
      base.metrics.reaParseError = String(err.message).slice(0, 160);
      base.status = "budget_rejected";
    }
  }
  return base;
}

export async function probeSafetensors(rea, bytes, phase) {
  const base = outcomeBase("safetensors", phase, bytes);
  const dir = mkdtempSync(join(tmpdir(), "bla-rt-st-"));
  const path = join(dir, `${phase}.safetensors`);
  writeFileSync(path, bytes);
  try {
    const fh = await open(path, "r");
    try {
      const reader = new rea.ModelHeaderReader(fh, bytes.length);
      const first = await reader.take(4);
      const result = await rea.readSafetensorsHeader(reader, first);
      base.metrics = {
        tensorCount: result.tensors?.length ?? 0,
        metadataCount: result.metadata?.length ?? 0,
        limitations: result.limitations ?? [],
      };
    } finally {
      await fh.close();
    }
  } catch (err) {
    const limit = err?.limit ?? null;
    failOutcome(
      base,
      err,
      limit === "json-nesting" ? "MODEL_JSON_NESTING" : limit,
    );
  }
  return base;
}

export async function probeGguf(rea, bytes, phase) {
  const base = outcomeBase("gguf", phase, bytes);
  const dir = mkdtempSync(join(tmpdir(), "bla-rt-gguf-"));
  const path = join(dir, `${phase}.gguf`);
  writeFileSync(path, bytes);
  try {
    const fh = await open(path, "r");
    try {
      const reader = new rea.ModelHeaderReader(fh, bytes.length);
      // ModelArtifactProvider consumes the 4-byte GGUF magic before GgufHeader.
      const magic = await reader.take(4);
      if (!magic.equals(Buffer.from("GGUF"))) {
        base.status = "error";
        base.errorMessage = `expected GGUF magic, got ${magic.toString("hex")}`;
        return base;
      }
      const header = new rea.GgufHeader(reader);
      const result = await header.read();
      base.metrics = {
        version: result?.version,
        tensorCount: result?.tensors?.length ?? result?.tensor_count,
        metadataCount: result?.metadata?.length,
        limitations: result?.limitations ?? [],
      };
    } finally {
      await fh.close();
    }
  } catch (err) {
    const limit = err?.limit ?? null;
    failOutcome(
      base,
      err,
      limit === "metadata-nesting" ? "MODEL_METADATA_NESTING" : limit,
    );
  }
  return base;
}

export async function probePtx(_rea, bytes, phase) {
  const base = outcomeBase("gpu_ptx", phase, bytes);
  const text = bytes.toString("utf8");
  const entries = [...text.matchAll(/\.entry\s+(\w+)/g)].map((m) => m[1]);
  base.metrics = {
    entryCount: entries.length,
    textBytes: bytes.length,
    note: "REA GPU object decode needs native tooling for fatbin/SPIR-V; PTX is text-scanned here",
  };
  return base;
}

/** Catalog of analyzers that cannot run empirically on this box. */
export function unverifiedAnalyzers() {
  return [
    {
      analyzer: "Ghidra / Hopper native decompile",
      reason: "requires Ghidra/Hopper install (not available without root/GUI)",
    },
    {
      analyzer: "Frida dynamic instrumentation",
      reason: "requires frida-tools + attachable target process",
    },
    {
      analyzer: "LLDB / GDB native tracing",
      reason: "requires lldb/gdb + debuggee; not installed here",
    },
    {
      analyzer: "Rizin / Cutter",
      reason: "requires rizin binary",
    },
    {
      analyzer: "JADX Android decompile",
      reason: "requires JADX JVM tooling",
    },
    {
      analyzer: "EVM EVMole worker full interface recovery",
      reason:
        "worker subprocess/path not exercised end-to-end; inputBytes budget checked in-process",
    },
    {
      analyzer: "SPIR-V / CUDA fatbinary / AMD GPU object",
      reason:
        "BLA skips these formats (GPU_OBJECT_HARDENING_SKIP_REASON); no shield to validate",
    },
    {
      analyzer: "Firmware analysis",
      reason:
        "BLA skips firmware (FIRMWARE_HARDENING_SKIP_REASON); needs vendor parsers",
    },
  ];
}
