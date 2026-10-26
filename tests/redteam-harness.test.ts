import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { join } from "node:path";
import {
  buildMappedFlutterIsolatePoolPlant,
  buildMappedGoFlutterElfFixture,
} from "../src/shields/formats/go-flutter-exhaustion.js";
import {
  protectNativeBinary,
  resolveElf64SectionNames,
  validateElf64Layout,
} from "../src/shields/formats/native.js";
import { SeededPrng } from "../src/core/prng.js";
import { REA_INTERNAL_LIMITS } from "../src/identity.js";

const require = createRequire(import.meta.url);
const samplesPath = join(process.cwd(), "scripts/redteam/lib/samples.mjs");
const probesPath = join(process.cwd(), "scripts/redteam/lib/probes.mjs");

describe("red-team harness sample generators", () => {
  it("builds minimal BEAM / EVM / PCAP / GGUF / PTX fixtures with expected magic", async () => {
    const samples = await import(samplesPath);
    const beam = samples.buildMinimalBeam();
    expect(beam.subarray(0, 4).toString("latin1")).toBe("FOR1");
    expect(beam.subarray(8, 12).toString("latin1")).toBe("BEAM");

    const evm = samples.buildMinimalEvm();
    expect(evm.length).toBeGreaterThan(8);
    expect(evm[0]).toBe(0x60);

    const pcap = samples.buildMinimalPcap();
    expect(pcap.length).toBe(24);
    expect(pcap.readUInt32LE(0)).toBe(0xa1b2c3d4);

    const gguf = samples.buildMinimalGguf();
    expect(gguf.subarray(0, 4).toString("ascii")).toBe("GGUF");
    expect(gguf.readUInt32LE(4)).toBe(3);

    const ptx = samples.buildMinimalPtx().toString("utf8");
    expect(ptx).toContain(".entry demo");
  });

  it("projectStringPoolReaFaithful reports wouldCap past REA URI/token limits", async () => {
    const { projectStringPoolReaFaithful } = await import(probesPath);
    const parts: string[] = [];
    for (let i = 0; i < REA_INTERNAL_LIMITS.DART_MAX_POOL_URIS + 10; i++) {
      parts.push(`package:m${i}/b.dart`);
      parts.push(`dart:d${i}`);
    }
    for (let i = 0; i < REA_INTERNAL_LIMITS.DART_MAX_POOL_TOKENS + 10; i++) {
      parts.push(`Node_${i}_X`);
    }
    const section = Buffer.from(parts.join("\0") + "\0", "utf8");
    const pool = projectStringPoolReaFaithful(section, REA_INTERNAL_LIMITS);
    expect(pool.packageUriCount).toBeGreaterThan(
      REA_INTERNAL_LIMITS.DART_MAX_POOL_URIS,
    );
    expect(pool.dartUriCount).toBeGreaterThan(
      REA_INTERNAL_LIMITS.DART_MAX_POOL_URIS,
    );
    expect(pool.classLikeTokenCount).toBeGreaterThan(
      REA_INTERNAL_LIMITS.DART_MAX_POOL_TOKENS,
    );
    expect(pool.reportWouldCap).toBe(true);
  });
});

describe("mapped Go/Flutter plants vs REA pool caps", () => {
  it("mapped Flutter isolate plant exceeds per-kind MAX_POOL_URIS and MAX_POOL_TOKENS", () => {
    const plant = buildMappedFlutterIsolatePoolPlant(
      160 * 1024,
      new SeededPrng("redteam-flutter-cap"),
    );
    // packageAndDartUris counts both kinds; each alone must clear 500.
    expect(plant.packageAndDartUris).toBeGreaterThan(
      REA_INTERNAL_LIMITS.DART_MAX_POOL_URIS * 2,
    );
    expect(plant.classLikeTokens).toBeGreaterThan(
      REA_INTERNAL_LIMITS.DART_MAX_POOL_TOKENS,
    );
    const text = plant.buffer.toString("utf8");
    expect(text).toContain("package:m0/b.dart");
    expect(text).toContain("dart:d0");
    expect(text).toContain("Node_0_X");
  });

  it("protectNativeBinary on mapped fixture plants pool past REA report caps", async () => {
    const { projectStringPoolReaFaithful } = await import(probesPath);
    const fixture = buildMappedGoFlutterElfFixture();
    const res = protectNativeBinary(fixture, {
      intensity: "bankrupt",
      seed: "redteam-mapped-caps",
    });
    expect(res.mappedFlutterPoolPlanted).toBe(true);
    expect(res.goBuildInfoExceedsLimit).toBe(true);
    const layout = validateElf64Layout(res.buffer);
    const names = resolveElf64SectionNames(res.buffer, layout);
    const iso = names.get(".isolate")!;
    const section = res.buffer.subarray(iso.offset, iso.offset + iso.size);
    const pool = projectStringPoolReaFaithful(section, REA_INTERNAL_LIMITS);
    expect(pool.reportWouldCap).toBe(true);
    expect(pool.packageUriCount).toBeGreaterThan(
      REA_INTERNAL_LIMITS.DART_MAX_POOL_URIS,
    );
    expect(pool.classLikeTokenCount).toBeGreaterThan(
      REA_INTERNAL_LIMITS.DART_MAX_POOL_TOKENS,
    );
  });
});
