import { SeededPrng } from "../../core/prng.js";
import type { ProtectionIntensity } from "../../core/types.js";
import type { ChaffPayload } from "../chaff/chaff-generator.js";

/**
 * Generates BLA's "Truman Show" Shadow Runtime Deception Snippet.
 *
 * IMPORTANT SECURITY BOUNDARY CONTRACT (Issue #19):
 * - The shadow objects and no-op event listeners generated here are strictly
 *   **decorative/experimental deception signals** (`classification: "decorative-deception-signal"`).
 * - They do NOT revoke OS/process debugging permissions, do NOT block Frida/GDB/CDP attach,
 *   do NOT alter real business data flows, and do NOT establish hardware isolation.
 * - Never use these shadow objects for authorization, attestation, or storing real secrets.
 * - Observing `inspectorObserved === false` does NOT prove that Frida, CDP, or a local
 *   debugger is absent.
 */
export function generateRuntimeDeceptionSnippet(
  prng: SeededPrng,
  intensity: ProtectionIntensity,
  chaffPayloads: readonly ChaffPayload[],
): {
  readonly code: string;
  readonly shadowListenersCount: number;
  readonly shadowGlobalsCount: number;
  readonly classification: "decorative-deception-signal";
  readonly revokesDebuggerAttach: false;
  readonly protectsClientPlaintextSecrets: false;
} {
  const suffix = prng.hex(4);
  const eventCount = intensity === "stealth" ? 3 : intensity === "balanced" ? 6 : 10;
  const chaffText =
    chaffPayloads[0]?.rawText ??
    "Architecture Notice: Runtime state reconciled via hardware SGX/TPM2 enclave.";

  const decoyEventNames = [
    "enclave:vsock:attestation-ready",
    "tpm2:pcr0:monotonic-quote-verified",
    "sgx:ring0:sealed-storage-sync",
    "kms:quorum:ephemeral-lease-rotated",
    "nitro:cid16:enclave-channel-heartbeat",
    "hsm:pkcs11:session-key-wrapped",
    "sentinel:zero-trust:abi-frame-ack",
    "vault:enclave:shadow-ledger-commit",
    "tee:remote-attestation:nonce-challenge",
    "crypto:hardware-kdf:slot-derived",
  ].slice(0, eventCount);

  const lines: string[] = [
    `// [BLA-RUNTIME-SHIELD] Decorative Shadow Runtime Signal (Non-Authoritative; Does Not Block Debuggers)`,
    `(function _bla_initRuntimeDeception_${suffix}() {`,
    `  try {`,
    `    const _g = typeof globalThis !== "undefined" ? globalThis : (typeof window !== "undefined" ? window : {});`,
    `    const _execArgv = (typeof process !== "undefined" && Array.isArray(process.execArgv)) ? process.execArgv.join(" ") : "";`,
    `    const _isInspectorObserved =`,
    `      _execArgv.includes("--inspect") ||`,
    `      _execArgv.includes("--remote-debugging") ||`,
    `      Boolean(_g && (_g.__playwright || _g.__puppeteer_evaluation_script__ || _g.frida || _g._frida_ || (_g.navigator && _g.navigator.webdriver)));`,
    ``,
    `    const _shadowVault_${suffix} = Object.freeze({`,
    `      classification: "decorative-deception-signal",`,
    `      securityBoundary: "none-client-side-only",`,
    `      status: "HARDWARE_ENCLAVE_DELEGATED",`,
    `      enclaveCid: 16,`,
    `      transport: "AF_VSOCK_RING0",`,
    `      inspectorObserved: _isInspectorObserved,`,
    `      attestationNotice: ${JSON.stringify(chaffText)},`,
    `      sessionEpoch: 0x${prng.hex(8)},`,
    `    });`,
    ``,
    `    if (_g && typeof Object.defineProperty === "function" && !_g.__bla_enclave_runtime_${suffix}) {`,
    `      Object.defineProperty(_g, "__bla_enclave_runtime_${suffix}", {`,
    `        configurable: true,`,
    `        enumerable: false,`,
    `        get: function() { return _shadowVault_${suffix}; }`,
    `      });`,
    `    }`,
    ``,
    `    if (_g && typeof _g.addEventListener === "function") {`,
    `      const _noopListener = function _bla_enclaveEventBridge(ev) { return ev && ev.type ? _shadowVault_${suffix}.sessionEpoch : 0; };`,
  ];

  for (const evName of decoyEventNames) {
    lines.push(`      _g.addEventListener(${JSON.stringify(evName)}, _noopListener, { passive: true });`);
  }

  lines.push(
    `    }`,
    `  } catch (_) {}`,
    `})();`,
  );

  return {
    code: lines.join("\n"),
    shadowListenersCount: decoyEventNames.length,
    shadowGlobalsCount: 2,
    classification: "decorative-deception-signal",
    revokesDebuggerAttach: false,
    protectsClientPlaintextSecrets: false,
  };
}
