import { describe, expect, it } from "vitest";
import { parseGlb } from "./glb-loader";

describe("parseGlb", () => {
  it("parses GLB JSON and binary chunks", () => {
    const gltf = { asset: { version: "2.0" }, meshes: [{ primitives: [] }] };
    const binary = new Uint8Array([1, 2, 3, 4]);
    const asset = parseGlb(createGlb(gltf, binary));

    expect(asset.json).toEqual(gltf);
    expect(asset.binaryChunk).toEqual(binary);
  });

  it("rejects invalid magic", () => {
    const glb = createGlb({ asset: { version: "2.0" } });
    new DataView(glb).setUint32(0, 0, true);

    expect(() => parseGlb(glb)).toThrow("magic mismatch");
  });
});

function createGlb(json: unknown, binary?: Uint8Array): ArrayBuffer {
  const jsonBytes = padTo4(new TextEncoder().encode(JSON.stringify(json)), 0x20);
  const binaryBytes = binary ? padTo4(binary, 0) : undefined;
  const totalLength = 12 + 8 + jsonBytes.length + (binaryBytes ? 8 + binaryBytes.length : 0);
  const buffer = new ArrayBuffer(totalLength);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let offset = 0;

  view.setUint32(offset, 0x46546c67, true);
  view.setUint32(offset + 4, 2, true);
  view.setUint32(offset + 8, totalLength, true);
  offset += 12;

  view.setUint32(offset, jsonBytes.length, true);
  view.setUint32(offset + 4, 0x4e4f534a, true);
  bytes.set(jsonBytes, offset + 8);
  offset += 8 + jsonBytes.length;

  if (binaryBytes) {
    view.setUint32(offset, binaryBytes.length, true);
    view.setUint32(offset + 4, 0x004e4942, true);
    bytes.set(binaryBytes, offset + 8);
  }

  return buffer;
}

function padTo4(bytes: Uint8Array, padding: number): Uint8Array {
  const padded = new Uint8Array(Math.ceil(bytes.length / 4) * 4);
  padded.fill(padding);
  padded.set(bytes);
  return padded;
}
