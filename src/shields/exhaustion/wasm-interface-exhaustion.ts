import { SeededPrng } from "../../core/prng.js";
import type { ProtectionIntensity } from "../../core/types.js";
import { computeReaWasmInterfaceCharge } from "./rea-budget-matrix.js";

export interface WasmExhaustionDescriptor {
  readonly moduleName: string;
  readonly exportName: string;
  readonly paramCount: number;
  readonly resultCount: number;
  readonly reaChargedRepresentationBytes: number;
}

export interface WasmInterfaceExhaustionPlan {
  readonly descriptors: readonly WasmExhaustionDescriptor[];
  readonly totalBinaryOverheadBytes: number;
  readonly totalReaChargedBytes: number;
  readonly byteAmplificationFactor: number;
}

/**
 * Targets REA's `WasmInterfaceBudget` (`src/domain/wasm/wasmInterface.ts:90-108`),
 * where every WebAssembly import/export entry is charged:
 * `1024 + (module.length + name.length + wat_form.length) * 6 + (params.length + results.length) * 16`
 * against a fixed 32 MiB (`WASM_INTERFACE_REPRESENTATION_BYTES`) ceiling.
 */
export function planWasmInterfaceBudgetExhaustion(
  prng: SeededPrng,
  intensity: ProtectionIntensity = "balanced",
): WasmInterfaceExhaustionPlan {
  const count =
    intensity === "stealth"
      ? 12
      : intensity === "balanced"
        ? 24
        : intensity === "maximum"
          ? 48
          : 72;

  const descriptors: WasmExhaustionDescriptor[] = [];
  let totalBinaryOverheadBytes = 0;
  let totalReaChargedBytes = 0;

  for (let i = 0; i < count; i++) {
    const moduleName = `enclave_tee_ring0_attestation_domain_${prng.hex(6)}`;
    const exportName = `bla_enclave_verify_zero_trust_merkle_slot_${i}_${prng.hex(8)}`;
    const paramCount = 16;
    const resultCount = 4;
    const watForm = `(func $${exportName} (param ${Array(paramCount).fill("i64").join(" ")}) (result ${Array(resultCount).fill("i64").join(" ")}))`;
    const reaChargedRepresentationBytes = computeReaWasmInterfaceCharge({
      moduleName,
      exportOrImportName: exportName,
      watForm,
      paramCount,
      resultCount,
    });
    const binaryBytes = moduleName.length + exportName.length + paramCount + resultCount + 8;

    descriptors.push({
      moduleName,
      exportName,
      paramCount,
      resultCount,
      reaChargedRepresentationBytes,
    });
    totalBinaryOverheadBytes += binaryBytes;
    totalReaChargedBytes += reaChargedRepresentationBytes;
  }

  return {
    descriptors,
    totalBinaryOverheadBytes,
    totalReaChargedBytes,
    byteAmplificationFactor: Number(
      (totalReaChargedBytes / Math.max(1, totalBinaryOverheadBytes)).toFixed(2),
    ),
  };
}
