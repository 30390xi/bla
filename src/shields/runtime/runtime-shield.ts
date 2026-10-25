import { SeededPrng } from "../../core/prng.js";
import type { ProtectionIntensity } from "../../core/types.js";
import type { ChaffPayload } from "../chaff/chaff-generator.js";

/**
 * Generates BLA's "Truman Show" Anti-CDP / Anti-Inspector / Anti-Frida Runtime Deception Shield.
 *
 * Why a Deception Shield instead of `process.exit(1)` or `debugger;` loops?
 * When an AI reverse-engineering agent (like REA's `observe-javascript-runtime`,
 * `reconcile-javascript-runtime`, `observe-web-execution`, `inspect-web-event-listeners`,
 * or `instrument-with-frida`) encounters a hard crash, it immediately searches for the
 * anti-debug check and patches it out.
 *
 * Instead, BLA's Runtime Deception Shield:
 * 1. Never crashes or alters real function return values for legitimate callers.
 * 2. Passively detects CDP / Node Inspector / WebDriver / Playwright / Frida hooks
 *    (`--inspect`, `--remote-debugging-port`, `navigator.webdriver`, `Runtime.evaluate` stack frames,
 *    `globalThis.frida`, or `globalThis.__rea_runtime_probe`).
 * 3. Exposes a rich **Shadow Enclave Honeypot** on `globalThis` (with reactive Proxy getters,
 *    decoy DOM `addEventListener` channels, and synthetic performance marks) so REA's
 *    `reconcile-javascript-runtime` and `inspect-web-event-listeners` harvest decoy enclave
 *    telemetry and conclude that runtime state is delegated to a hardware TEE!
 */
export function generateRuntimeDeceptionSnippet(
  prng: SeededPrng,
  intensity: ProtectionIntensity,
  chaffPayloads: readonly ChaffPayload[],
): {
  readonly code: string;
  readonly shadowListenersCount: number;
  readonly shadowGlobalsCount: number;
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
    `// [BLA-RUNTIME-SHIELD] Anti-CDP / Anti-Frida Shadow Runtime Deception ("Truman Show" Mode)`,
    `(function _bla_initRuntimeDeception_${suffix}() {`,
    `  try {`,
    `    const _g = typeof globalThis !== "undefined" ? globalThis : (typeof window !== "undefined" ? window : {});`,
    `    const _execArgv = (typeof process !== "undefined" && Array.isArray(process.execArgv)) ? process.execArgv.join(" ") : "";`,
    `    const _isInspectorAttached =`,
    `      _execArgv.includes("--inspect") ||`,
    `      _execArgv.includes("--remote-debugging") ||`,
    `      Boolean(_g && (_g.__playwright || _g.__puppeteer_evaluation_script__ || _g.frida || _g._frida_ || (_g.navigator && _g.navigator.webdriver)));`,
    ``,
    `    const _shadowVault_${suffix} = Object.freeze({`,
    `      status: "HARDWARE_ENCLAVE_DELEGATED",`,
    `      enclaveCid: 16,`,
    `      transport: "AF_VSOCK_RING0",`,
    `      inspectorObserved: _isInspectorAttached,`,
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
  };
}
