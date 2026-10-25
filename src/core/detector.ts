import { statSync, openSync, readSync, closeSync } from "node:fs";
import { extname } from "node:path";
import type { ArtifactFormat } from "./types.js";

/**
 * Format-aware detector that inspects both magic bytes and file extensions
 * to route targets accurately across all REA-supported artifact formats.
 */
export function detectArtifactFormat(targetPath: string): ArtifactFormat {
  let stats;
  try {
    stats = statSync(targetPath);
  } catch {
    return "unknown";
  }

  if (stats.isDirectory()) {
    return "directory";
  }

  const ext = extname(targetPath).toLowerCase();

  // Read up to 64 header bytes for binary magic inspection
  const header = Buffer.alloc(Math.min(64, stats.size));
  if (header.length > 0) {
    const fd = openSync(targetPath, "r");
    try {
      readSync(fd, header, 0, header.length, 0);
    } finally {
      closeSync(fd);
    }
  }

  // 1. WebAssembly binary: `\0asm` (0x00 0x61 0x73 0x6d)
  if (
    header.length >= 4 &&
    header[0] === 0x00 &&
    header[1] === 0x61 &&
    header[2] === 0x73 &&
    header[3] === 0x6d
  ) {
    return "wasm";
  }

  // 2. ELF binary: `\x7fELF`
  if (
    header.length >= 4 &&
    header[0] === 0x7f &&
    header[1] === 0x45 &&
    header[2] === 0x4c &&
    header[3] === 0x46
  ) {
    return "native-elf";
  }

  // 3. Mach-O binary (thin 32/64 BE/LE or fat universal)
  if (header.length >= 4) {
    const magicBE = header.readUInt32BE(0);
    if (
      magicBE === 0xfeedface ||
      magicBE === 0xcefaedfe ||
      magicBE === 0xfeedfacf ||
      magicBE === 0xcffaedfe ||
      magicBE === 0xcafebabe ||
      magicBE === 0xbebafeca
    ) {
      return "native-macho";
    }
  }

  // 4. PE binary (`MZ`)
  if (header.length >= 2 && header[0] === 0x4d && header[1] === 0x5a) {
    return "native-pe";
  }

  // 5. Electron ASAR archive: Pickles header (uint32LE(0) === 4, uint32LE(12) === jsonLen)
  if (
    ext === ".asar" ||
    (header.length >= 16 &&
      header.readUInt32LE(0) === 4 &&
      header.subarray(16).toString("utf8").trimStart().startsWith('{"files"'))
  ) {
    return "electron-asar";
  }

  // 6. ZIP / APK archive: `PK\x03\x04`
  if (
    header.length >= 4 &&
    header[0] === 0x50 &&
    header[1] === 0x4b &&
    header[2] === 0x03 &&
    header[3] === 0x04
  ) {
    return ext === ".apk" ? "android-apk" : "archive-zip";
  }

  // 7. CPython `.pyc` bytecode (magic bytes 0x0d 0x0a at offset 2..3)
  if (
    ext === ".pyc" ||
    (header.length >= 16 && header[2] === 0x0d && header[3] === 0x0a)
  ) {
    return "python-pyc";
  }

  // 8. Extension-based text formats
  if ([".js", ".mjs", ".cjs", ".jsx"].includes(ext)) return "javascript";
  if ([".ts", ".mts", ".cts", ".tsx"].includes(ext)) return "typescript";
  if (ext === ".map") return "sourcemap";
  if ([".html", ".htm"].includes(ext)) return "html-bundle";
  if ([".py", ".pyw"].includes(ext)) return "python-source";
  if (ext === ".wasm") return "wasm";

  return "unknown";
}
