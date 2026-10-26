import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const BLA_ROOT = resolve(__dirname, "../../..");
export const REA_ROOT = resolve(
  process.env.REA_ROOT ?? join(BLA_ROOT, "..", "rea"),
);
export const REDTEAM_OUT_DIR = join(BLA_ROOT, "docs/redteam");
export const REDTEAM_REPORT_MD = join(
  REDTEAM_OUT_DIR,
  "empirical-rea-validation.md",
);
export const REDTEAM_REPORT_JSON = join(
  REDTEAM_OUT_DIR,
  "empirical-rea-validation.json",
);

export function resolveReaDist(rel) {
  return join(REA_ROOT, "dist", rel);
}

export function reaDistReady() {
  return existsSync(resolveReaDist("go/GoBinaryImage.js"));
}

/** User-local Wireshark extract (no root required on this box). */
export function resolveTsharkEnv() {
  const home = process.env.HOME ?? "";
  const prefix = join(home, "opt/wireshark");
  const bin = join(prefix, "usr/bin/tshark");
  const lib = [
    join(prefix, "usr/lib/x86_64-linux-gnu"),
    join(prefix, "lib/x86_64-linux-gnu"),
  ].join(":");
  if (!existsSync(bin)) {
    return { available: false, bin: null, env: process.env };
  }
  return {
    available: true,
    bin,
    env: {
      ...process.env,
      PATH: `${join(prefix, "usr/bin")}:${process.env.PATH ?? ""}`,
      LD_LIBRARY_PATH: `${lib}${process.env.LD_LIBRARY_PATH ? `:${process.env.LD_LIBRARY_PATH}` : ""}`,
    },
  };
}
