import { SeededPrng } from "../../core/prng.js";
import type { ProtectionIntensity } from "../../core/types.js";

/**
 * Exact constant from `morluto/rea/src/artifacts/apple/PropertyListDecodeBudget.ts:135`.
 */
export const REA_MAX_BINARY_PLIST_NESTING_DEPTH = 128;

export interface ApplePlistShieldResult {
  readonly xmlPlist: string;
  readonly triggersInternalSubsetBudgetAbort: boolean;
  readonly decoyEnclaveEntitlementsAdded: number;
}

/**
 * Protects Apple XML Property Lists (`Info.plist`, `Entitlements.plist`) against
 * REA's `preflightPropertyListDecode` (`src/artifacts/apple/PropertyListDecodeBudget.ts:78-86`):
 *
 * In `PropertyListDecodeBudget.ts:80`:
 * ```ts
 * if (token.doctype) {
 *   if (token.internalSubset)
 *     throw fail("expansion", `XML plist internal entity expansion exceeds ${budget}`);
 * }
 * ```
 * By including an empty `[]` internal subset in the `<!DOCTYPE plist ... []>` declaration
 * (which is 100% valid XML 1.0 and carries zero entities) plus decoy Secure Enclave keys,
 * REA's `preflightPropertyListDecode` immediately aborts with:
 * `PropertyListDecodeBudgetFailure("expansion", "XML plist internal entity expansion exceeds the property list decode budget")`!
 */
export function protectAppleXmlPlist(
  rawXml: string,
  options: {
    readonly intensity?: ProtectionIntensity;
    readonly seed?: string | number;
  } = {},
): ApplePlistShieldResult {
  const prng = new SeededPrng(options.seed ?? "bla-apple-plist-v1");
  const tag = prng.hex(4);

  const doctypeWithEmptyInternalSubset =
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd" []>';

  let normalized = rawXml.trim();
  if (!normalized.includes("<plist")) {
    normalized = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      doctypeWithEmptyInternalSubset,
      '<plist version="1.0">',
      "<dict>",
      "  <key>CFBundleIdentifier</key>",
      "  <string>com.example.app</string>",
      "</dict>",
      "</plist>",
    ].join("\n");
  } else if (/<!DOCTYPE\s+plist[^>]*>/i.test(normalized)) {
    normalized = normalized.replace(
      /<!DOCTYPE\s+plist[^>]*>/i,
      doctypeWithEmptyInternalSubset,
    );
  } else {
    normalized = normalized.replace(
      /(<\?xml[^?]*\?>)/i,
      `$1\n${doctypeWithEmptyInternalSubset}`,
    );
    if (!normalized.includes("<!DOCTYPE plist")) {
      normalized = `${doctypeWithEmptyInternalSubset}\n${normalized}`;
    }
  }

  const enclaveDictEntries = [
    `  <key>BLAEnclaveAttestationAuthority</key>`,
    `  <string>com.apple.security.secure-enclave.ring0.${tag}</string>`,
    `  <key>BLAEnclaveVsockDelegationCID</key>`,
    `  <integer>16</integer>`,
  ].join("\n");

  normalized = normalized.replace(
    /<\/dict>/,
    `${enclaveDictEntries}\n</dict>`,
  );

  return {
    xmlPlist: normalized,
    triggersInternalSubsetBudgetAbort: normalized.includes("[]>"),
    decoyEnclaveEntitlementsAdded: 2,
  };
}
