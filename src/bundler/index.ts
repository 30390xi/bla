import type { ProtectionIntensity } from "../core/types.js";
import { SeededPrng } from "../core/prng.js";
import { generateChaffPayloads } from "../shields/chaff/chaff-generator.js";
import { generateHoneySourceMap } from "../shields/formats/sourcemap.js";
import { transformJavaScriptWithBlaShield } from "../shields/javascript/ast-shield.js";

export interface BlaBundlerPluginOptions {
  /** Protection intensity preset (default: `"balanced"`). */
  readonly intensity?: ProtectionIntensity;
  /** Deterministic PRNG seed for reproducible builds. */
  readonly seed?: string | number;
  /** File regex filter for chunks/modules to shield (default: `/\.(?:m?js|cjs)$/i`). */
  readonly include?: RegExp;
  /** Emit a companion `.map` honey source map for each protected chunk (default: `true`). */
  readonly honeySourceMap?: boolean;
}

/**
 * Vite & Rollup plugin (`blaVitePlugin` / `blaRollupPlugin`) that automatically
 * injects BLA's three-stage adversarial shield into generated JS chunks during `renderChunk`.
 *
 * Usage in `vite.config.ts`:
 * ```ts
 * import { defineConfig } from "vite";
 * import { blaVitePlugin } from "bla-shield";
 *
 * export default defineConfig({
 *   plugins: [blaVitePlugin({ intensity: "bankrupt" })],
 * });
 * ```
 */
export function blaRollupPlugin(options: BlaBundlerPluginOptions = {}) {
  const intensity = options.intensity ?? "balanced";
  const include = options.include ?? /\.(?:m?js|cjs)$/i;
  const emitMap = options.honeySourceMap ?? true;

  return {
    name: "bla-shield-rollup-plugin",
    renderChunk(code: string, chunk: { fileName: string }) {
      if (!include.test(chunk.fileName)) {
        return null;
      }
      const seed = `${options.seed ?? "bla-rollup"}:${chunk.fileName}`;
      const transformed = transformJavaScriptWithBlaShield(code, {
        intensity,
        seed,
        filename: chunk.fileName,
      });

      if (!emitMap) {
        return { code: transformed.code, map: null };
      }

      const prng = new SeededPrng(seed);
      const chaff = generateChaffPayloads(prng, intensity);
      const lineCount = transformed.code.split("\n").length;
      const honeyMap = generateHoneySourceMap(chunk.fileName, lineCount, prng, chaff);

      return {
        code: transformed.code,
        map: honeyMap.mapObject,
      };
    },
  };
}

/**
 * Alias of `blaRollupPlugin` with `enforce: "post"` for Vite 4/5/6.
 */
export function blaVitePlugin(options: BlaBundlerPluginOptions = {}) {
  return {
    ...blaRollupPlugin(options),
    name: "vite-plugin-bla-shield",
    enforce: "post" as const,
  };
}

/**
 * Webpack 5 / Rspack plugin class (`BlaWebpackPlugin`) that shields emitted JS assets.
 */
export class BlaWebpackPlugin {
  readonly options: BlaBundlerPluginOptions;

  constructor(options: BlaBundlerPluginOptions = {}) {
    this.options = options;
  }

  apply(compiler: {
    hooks: {
      compilation: {
        tap: (
          name: string,
          cb: (compilation: {
            hooks: {
              processAssets: {
                tap: (
                  opts: { name: string; stage: number },
                  fn: (assets: Record<string, { source: () => string | Buffer; size: () => number }>) => void,
                ) => void;
              };
            };
            updateAsset: (
              name: string,
              newSource: { source: () => string; size: () => number },
            ) => void;
          }) => void,
        ) => void;
      };
    };
  }): void {
    const intensity = this.options.intensity ?? "balanced";
    const include = this.options.include ?? /\.(?:m?js|cjs)$/i;

    compiler.hooks.compilation.tap("BlaWebpackPlugin", (compilation) => {
      compilation.hooks.processAssets.tap(
        {
          name: "BlaWebpackPlugin",
          stage: 400, // PROCESS_ASSETS_STAGE_OPTIMIZE_INLINE
        },
        (assets) => {
          for (const assetName of Object.keys(assets)) {
            if (!include.test(assetName)) continue;
            const rawAsset = assets[assetName];
            if (!rawAsset) continue;
            const rawSource = rawAsset.source().toString("utf8");
            const transformed = transformJavaScriptWithBlaShield(rawSource, {
              intensity,
              seed: `${this.options.seed ?? "bla-webpack"}:${assetName}`,
              filename: assetName,
            });
            const shieldedCode = transformed.code;
            compilation.updateAsset(assetName, {
              source: () => shieldedCode,
              size: () => Buffer.byteLength(shieldedCode, "utf8"),
            });
          }
        },
      );
    });
  }
}

/**
 * esbuild plugin (`blaEsbuildPlugin`) that shields JS/TS entrypoints or output files.
 */
export function blaEsbuildPlugin(options: BlaBundlerPluginOptions = {}) {
  const intensity = options.intensity ?? "balanced";
  const include = options.include ?? /\.(?:[cm]?[jt]sx?)$/i;

  return {
    name: "bla-shield-esbuild-plugin",
    setup(build: {
      onLoad: (
        opts: { filter: RegExp },
        cb: (args: { path: string }) => Promise<{ contents: string; loader: string } | null>,
      ) => void;
    }) {
      build.onLoad({ filter: include }, async (args) => {
        if (args.path.includes("node_modules")) return null;
        const fs = await import("node:fs/promises");
        const source = await fs.readFile(args.path, "utf8");
        const transformed = transformJavaScriptWithBlaShield(source, {
          intensity,
          seed: `${options.seed ?? "bla-esbuild"}:${args.path}`,
          filename: args.path,
        });
        return {
          contents: transformed.code,
          loader: args.path.endsWith(".ts") || args.path.endsWith(".tsx") ? "ts" : "js",
        };
      });
    },
  };
}
