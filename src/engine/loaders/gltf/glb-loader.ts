export type GlbAsset = {
  json: unknown;
  binaryChunk?: Uint8Array;
};

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const JSON_CHUNK_TYPE = 0x4e4f534a;
const BIN_CHUNK_TYPE = 0x004e4942;

export function parseGlb(buffer: ArrayBuffer): GlbAsset {
  const view = new DataView(buffer);

  if (view.byteLength < 12) {
    throw new Error("Invalid GLB: header is missing");
  }

  const magic = view.getUint32(0, true);
  const version = view.getUint32(4, true);
  const length = view.getUint32(8, true);

  if (magic !== GLB_MAGIC) {
    throw new Error("Invalid GLB: magic mismatch");
  }

  if (version !== GLB_VERSION) {
    throw new Error(`Unsupported GLB version: ${version}`);
  }

  if (length !== view.byteLength) {
    throw new Error("Invalid GLB: length mismatch");
  }

  let offset = 12;
  let json: unknown;
  let binaryChunk: Uint8Array | undefined;

  while (offset < view.byteLength) {
    if (offset + 8 > view.byteLength) {
      throw new Error("Invalid GLB: chunk header is truncated");
    }

    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkLength;

    if (chunkEnd > view.byteLength) {
      throw new Error("Invalid GLB: chunk data is truncated");
    }

    const chunkBytes = new Uint8Array(buffer, chunkStart, chunkLength);

    if (chunkType === JSON_CHUNK_TYPE) {
      json = JSON.parse(decodeUtf8(stripJsonPadding(chunkBytes)));
    } else if (chunkType === BIN_CHUNK_TYPE) {
      binaryChunk = chunkBytes;
    }

    offset = chunkEnd;
  }

  if (!json) {
    throw new Error("Invalid GLB: JSON chunk is missing");
  }

  return { json, binaryChunk };
}

export async function loadGlb(url: string): Promise<GlbAsset> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Unable to load GLB: ${response.status}`);
  }

  return parseGlb(await response.arrayBuffer());
}

function stripJsonPadding(bytes: Uint8Array): Uint8Array {
  let end = bytes.length;

  while (end > 0 && bytes[end - 1] === 0x20) {
    end -= 1;
  }

  return bytes.subarray(0, end);
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}
