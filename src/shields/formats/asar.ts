import { createHash } from "node:crypto";

export interface AsarFileEntry {
  readonly offset: string;
  readonly size: number;
  readonly unpacked?: boolean;
  readonly executable?: boolean;
  readonly integrity?: {
    readonly algorithm: "SHA256";
    readonly hash: string;
    readonly blockSize: number;
    readonly blocks: readonly string[];
  };
}

export interface AsarDirectoryNode {
  readonly files: Record<string, AsarNode>;
}

export type AsarNode = AsarFileEntry | AsarDirectoryNode;

export interface VirtualAsarFile {
  readonly relativePath: string;
  readonly content: Buffer;
  readonly executable?: boolean;
}

const ASAR_BLOCK_SIZE = 4 * 1024 * 1024;

function isDirectoryNode(node: AsarNode): node is AsarDirectoryNode {
  return typeof (node as AsarDirectoryNode).files === "object" && (node as AsarDirectoryNode).files !== null;
}

function computeAsarIntegrity(content: Buffer): NonNullable<AsarFileEntry["integrity"]> {
  const hash = createHash("sha256").update(content).digest("hex");
  const blocks: string[] = [];
  if (content.length === 0) {
    blocks.push(createHash("sha256").update(Buffer.alloc(0)).digest("hex"));
  } else {
    for (let offset = 0; offset < content.length; offset += ASAR_BLOCK_SIZE) {
      const slice = content.subarray(offset, Math.min(content.length, offset + ASAR_BLOCK_SIZE));
      blocks.push(createHash("sha256").update(slice).digest("hex"));
    }
  }
  return {
    algorithm: "SHA256",
    hash,
    blockSize: ASAR_BLOCK_SIZE,
    blocks,
  };
}

/**
 * Unpacks an Electron `.asar` archive buffer into an in-memory array of virtual files.
 * Follows Chromium Pickle framing used by `@electron/asar` and `morluto/rea`.
 */
export function unpackAsarBuffer(asarBytes: Buffer): readonly VirtualAsarFile[] {
  if (asarBytes.length < 16) {
    throw new Error("Invalid ASAR archive: buffer shorter than 16-byte pickle header");
  }
  const sizePicklePayload = asarBytes.readUInt32LE(0);
  if (sizePicklePayload !== 4) {
    throw new Error(`Invalid ASAR header: expected outer pickle payload size 4, got ${sizePicklePayload}`);
  }
  const headerSize = asarBytes.readUInt32LE(4);
  const jsonStringSize = asarBytes.readUInt32LE(12);
  const dataOffsetBase = 8 + headerSize;

  if (16 + jsonStringSize > asarBytes.length || dataOffsetBase > asarBytes.length) {
    throw new Error("Invalid ASAR archive: header exceeds buffer bounds");
  }

  const headerJson = asarBytes.subarray(16, 16 + jsonStringSize).toString("utf8");
  const root = JSON.parse(headerJson) as AsarDirectoryNode;
  const files: VirtualAsarFile[] = [];

  const walk = (node: AsarNode, prefix: string): void => {
    if (isDirectoryNode(node)) {
      for (const [name, child] of Object.entries(node.files)) {
        const nextPath = prefix ? `${prefix}/${name}` : name;
        walk(child, nextPath);
      }
      return;
    }
    if (node.unpacked) return;
    const offset = Number.parseInt(node.offset, 10);
    const start = dataOffsetBase + offset;
    const end = start + node.size;
    if (start < dataOffsetBase || end > asarBytes.length) {
      throw new Error(`Invalid ASAR file entry bounds for ${prefix}`);
    }
    files.push({
      relativePath: prefix,
      content: Buffer.from(asarBytes.subarray(start, end)),
      ...(node.executable ? { executable: true } : {}),
    });
  };

  walk(root, "");
  return files;
}

/**
 * Packs an array of virtual files into a valid Electron `.asar` archive buffer
 * with full SHA-256 block integrity metadata.
 */
export function packAsarBuffer(files: readonly VirtualAsarFile[]): Buffer {
  const root: AsarDirectoryNode = { files: {} };
  const payloadChunks: Buffer[] = [];
  let currentOffset = 0;

  for (const file of files) {
    const segments = file.relativePath.replace(/^\/+/, "").split("/").filter(Boolean);
    if (segments.length === 0) continue;

    let currentDir = root;
    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i]!;
      let existing = currentDir.files[seg];
      if (!existing || !isDirectoryNode(existing)) {
        existing = { files: {} };
        currentDir.files[seg] = existing;
      }
      currentDir = existing;
    }

    const leafName = segments[segments.length - 1]!;
    currentDir.files[leafName] = {
      offset: String(currentOffset),
      size: file.content.length,
      ...(file.executable ? { executable: true } : {}),
      integrity: computeAsarIntegrity(file.content),
    };
    payloadChunks.push(file.content);
    currentOffset += file.content.length;
  }

  const jsonBytes = Buffer.from(JSON.stringify(root), "utf8");
  const jsonStringSize = jsonBytes.length;
  // Align JSON bytes to 4-byte boundary per Chromium Pickle string framing
  const alignedJsonSize = Math.ceil(jsonStringSize / 4) * 4;
  const innerPickleSize = alignedJsonSize + 4;
  const headerSize = innerPickleSize + 4;

  const headerBuffer = Buffer.alloc(8 + headerSize, 0);
  headerBuffer.writeUInt32LE(4, 0);
  headerBuffer.writeUInt32LE(headerSize, 4);
  headerBuffer.writeUInt32LE(innerPickleSize, 8);
  headerBuffer.writeUInt32LE(jsonStringSize, 12);
  jsonBytes.copy(headerBuffer, 16);

  return Buffer.concat([headerBuffer, ...payloadChunks]);
}
