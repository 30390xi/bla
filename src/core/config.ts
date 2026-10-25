import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ProtectionIntensity } from "./types.js";

export interface BlaProjectConfig {
  readonly $schema?: string;
  readonly input?: string;
  readonly output?: string;
  readonly intensity?: ProtectionIntensity;
  readonly seed?: string;
  readonly emitManifest?: boolean;
  readonly honeySourceMaps?: boolean;
  readonly minDefenseScore?: number;
}

export const DEFAULT_BLA_CONFIG: BlaProjectConfig = Object.freeze({
  $schema: "https://bla.tools/schemas/bla.config.v1.json",
  input: "./dist",
  intensity: "bankrupt",
  seed: "bla-project-seed-v1",
  emitManifest: true,
  honeySourceMaps: true,
  minDefenseScore: 90,
});

const CONFIG_FILENAMES = ["bla.config.json", ".blarc.json", ".blarc"] as const;

/**
 * Loads `bla.config.json`, `.blarc.json`, or the `"bla"` field from `package.json`
 * in `cwd` (or an explicit config file path).
 */
export function loadBlaConfig(
  cwd: string = process.cwd(),
  explicitConfigPath?: string,
): { config: BlaProjectConfig; sourcePath: string | null } {
  const root = resolve(cwd);

  if (explicitConfigPath) {
    const absExplicit = resolve(root, explicitConfigPath);
    if (!existsSync(absExplicit)) {
      throw new Error(`BLA config file not found: ${absExplicit}`);
    }
    const parsed = JSON.parse(readFileSync(absExplicit, "utf8")) as BlaProjectConfig;
    return {
      config: { ...DEFAULT_BLA_CONFIG, ...parsed },
      sourcePath: absExplicit,
    };
  }

  for (const name of CONFIG_FILENAMES) {
    const candidate = join(root, name);
    if (existsSync(candidate)) {
      try {
        const parsed = JSON.parse(readFileSync(candidate, "utf8")) as BlaProjectConfig;
        return {
          config: { ...DEFAULT_BLA_CONFIG, ...parsed },
          sourcePath: candidate,
        };
      } catch {
        // ignore malformed optional config
      }
    }
  }

  const pkgPath = join(root, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
        bla?: BlaProjectConfig;
      };
      if (pkg.bla && typeof pkg.bla === "object") {
        return {
          config: { ...DEFAULT_BLA_CONFIG, ...pkg.bla },
          sourcePath: pkgPath,
        };
      }
    } catch {
      // ignore
    }
  }

  return {
    config: DEFAULT_BLA_CONFIG,
    sourcePath: null,
  };
}

/**
 * Writes a starter `bla.config.json` in `targetDir`.
 */
export function initBlaConfig(
  targetDir: string = process.cwd(),
  overwrite = false,
): { configPath: string; created: boolean; config: BlaProjectConfig } {
  const configPath = join(resolve(targetDir), "bla.config.json");
  if (existsSync(configPath) && !overwrite) {
    const existing = JSON.parse(readFileSync(configPath, "utf8")) as BlaProjectConfig;
    return {
      configPath,
      created: false,
      config: { ...DEFAULT_BLA_CONFIG, ...existing },
    };
  }

  writeFileSync(
    configPath,
    JSON.stringify(DEFAULT_BLA_CONFIG, null, 2) + "\n",
    "utf8",
  );
  return {
    configPath,
    created: true,
    config: DEFAULT_BLA_CONFIG,
  };
}
