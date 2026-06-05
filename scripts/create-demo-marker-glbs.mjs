import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const FLOAT = 5126;
const UNSIGNED_SHORT = 5123;
const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;
const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const JSON_CHUNK_TYPE = 0x4e4f534a;
const BIN_CHUNK_TYPE = 0x004e4942;

writeFileSync("public/models/demo-marker.glb", createMarkerGlb({
  name: "Orbix LOD 0 marker",
  colorFactor: [0.9, 1, 1, 1],
  textureColors: [
    [42, 210, 235, 255],
    [95, 255, 214, 255],
    [18, 90, 160, 255],
    [240, 255, 255, 255],
  ],
}));

writeFileSync("public/models/demo-marker-lod1.glb", createMarkerGlb({
  name: "Orbix LOD 1 marker",
  colorFactor: [1, 0.88, 0.28, 1],
  textureColors: [
    [255, 209, 64, 255],
    [255, 108, 72, 255],
    [120, 36, 180, 255],
    [255, 255, 210, 255],
  ],
}));

function createMarkerGlb({ name, colorFactor, textureColors }) {
  const positions = new Float32Array([
    -0.45, 0, -0.45,
    0.45, 0, -0.45,
    0.45, 0, 0.45,
    -0.45, 0, 0.45,
    0, 1.15, 0,
  ]);
  const texcoords = new Float32Array([
    0, 0,
    1, 0,
    1, 1,
    0, 1,
    0.5, 0.5,
  ]);
  const indices = new Uint16Array([
    0, 2, 1,
    0, 3, 2,
    0, 1, 4,
    1, 2, 4,
    2, 3, 4,
    3, 0, 4,
  ]);
  const png = createPng2x2(textureColors);

  const positionBytes = toBytes(positions);
  const texcoordBytes = toBytes(texcoords);
  const indexBytes = toBytes(indices);
  const chunks = [
    { bytes: positionBytes, target: ARRAY_BUFFER },
    { bytes: texcoordBytes, target: ARRAY_BUFFER },
    { bytes: indexBytes, target: ELEMENT_ARRAY_BUFFER },
    { bytes: png },
  ];

  let offset = 0;
  const bufferViews = chunks.map((chunk) => {
    offset = align4(offset);
    const view = {
      buffer: 0,
      byteOffset: offset,
      byteLength: chunk.bytes.byteLength,
      ...(chunk.target ? { target: chunk.target } : {}),
    };
    offset += chunk.bytes.byteLength;
    return view;
  });

  const binary = new Uint8Array(align4(offset));
  for (let index = 0; index < chunks.length; index += 1) {
    binary.set(chunks[index].bytes, bufferViews[index].byteOffset);
  }

  const json = {
    asset: { version: "2.0", generator: "OrbixJS demo asset generator" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [
      {
        name,
        primitives: [
          {
            attributes: { POSITION: 0, TEXCOORD_0: 1 },
            indices: 2,
            material: 0,
            mode: 4,
          },
        ],
      },
    ],
    materials: [
      {
        pbrMetallicRoughness: {
          baseColorFactor: colorFactor,
          baseColorTexture: { index: 0 },
          metallicFactor: 0,
          roughnessFactor: 0.8,
        },
      },
    ],
    textures: [{ source: 0 }],
    images: [{ bufferView: 3, mimeType: "image/png" }],
    buffers: [{ byteLength: binary.byteLength }],
    bufferViews,
    accessors: [
      {
        bufferView: 0,
        componentType: FLOAT,
        count: positions.length / 3,
        type: "VEC3",
        min: [-0.45, 0, -0.45],
        max: [0.45, 1.15, 0.45],
      },
      {
        bufferView: 1,
        componentType: FLOAT,
        count: texcoords.length / 2,
        type: "VEC2",
      },
      {
        bufferView: 2,
        componentType: UNSIGNED_SHORT,
        count: indices.length,
        type: "SCALAR",
      },
    ],
  };

  const jsonBytes = padJson(new TextEncoder().encode(JSON.stringify(json)));
  const totalLength = 12 + 8 + jsonBytes.byteLength + 8 + binary.byteLength;
  const glb = new Uint8Array(totalLength);
  const view = new DataView(glb.buffer);

  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, GLB_VERSION, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, jsonBytes.byteLength, true);
  view.setUint32(16, JSON_CHUNK_TYPE, true);
  glb.set(jsonBytes, 20);
  const binHeaderOffset = 20 + jsonBytes.byteLength;
  view.setUint32(binHeaderOffset, binary.byteLength, true);
  view.setUint32(binHeaderOffset + 4, BIN_CHUNK_TYPE, true);
  glb.set(binary, binHeaderOffset + 8);

  return glb;
}

function createPng2x2(colors) {
  const width = 2;
  const height = 2;
  const raw = new Uint8Array(height * (1 + width * 4));

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      raw.set(colors[y * width + x], rowStart + 1 + x * 4);
    }
  }

  return concatBytes(
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", concatBytes(uint32(width), uint32(height), new Uint8Array([8, 6, 0, 0, 0]))),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", new Uint8Array()),
  );
}

function pngChunk(type, data) {
  const typeBytes = new TextEncoder().encode(type);
  return concatBytes(uint32(data.byteLength), typeBytes, data, uint32(crc32(concatBytes(typeBytes, data))));
}

function uint32(value) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, false);
  return bytes;
}

function crc32(bytes) {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function toBytes(typedArray) {
  return new Uint8Array(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
}

function padJson(bytes) {
  const padded = new Uint8Array(align4(bytes.byteLength));
  padded.set(bytes);
  padded.fill(0x20, bytes.byteLength);
  return padded;
}

function concatBytes(...parts) {
  const bytes = new Uint8Array(parts.reduce((size, part) => size + part.byteLength, 0));
  let offset = 0;

  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }

  return bytes;
}

function align4(value) {
  return (value + 3) & ~3;
}
