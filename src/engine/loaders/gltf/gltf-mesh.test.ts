import { describe, expect, it } from "vitest";
import { extractFirstMeshPrimitive } from "./gltf-mesh";

describe("extractFirstMeshPrimitive", () => {
  it("extracts positions and uint16 indices", () => {
    const binary = new Uint8Array(54);
    const view = new DataView(binary.buffer);
    const positions = [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
    ];

    positions.flat().forEach((value, index) => view.setFloat32(index * 4, value, true));
    view.setUint16(36, 0, true);
    view.setUint16(38, 1, true);
    view.setUint16(40, 2, true);
    view.setFloat32(42, 0.25, true);
    view.setFloat32(46, 0.75, true);
    binary.set([137, 80, 78, 71], 50);

    const primitive = extractFirstMeshPrimitive(
      {
        asset: { version: "2.0" },
        bufferViews: [
          { buffer: 0, byteOffset: 0, byteLength: 36 },
          { buffer: 0, byteOffset: 36, byteLength: 6 },
          { buffer: 0, byteOffset: 42, byteLength: 8 },
          { buffer: 0, byteOffset: 50, byteLength: 4 },
        ],
        accessors: [
          { bufferView: 0, componentType: 5126, count: 3, type: "VEC3" },
          { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" },
          { bufferView: 2, componentType: 5126, count: 1, type: "VEC2" },
        ],
        images: [{ bufferView: 3, mimeType: "image/png" }],
        textures: [{ source: 0 }],
        materials: [
          { pbrMetallicRoughness: { baseColorFactor: [0.2, 0.4, 0.8, 1], baseColorTexture: { index: 0 } } },
        ],
        meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 2 }, indices: 1, material: 0 }] }],
      },
      binary,
    );

    expect([...primitive.positions]).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    expect([...(primitive.texcoords ?? [])]).toEqual([0.25, 0.75]);
    expect([...(primitive.indices ?? [])]).toEqual([0, 1, 2]);
    expect(primitive.baseColorFactor).toEqual([0.2, 0.4, 0.8, 1]);
    expect(primitive.baseColorTexture?.mimeType).toBe("image/png");
    expect([...(primitive.baseColorTexture?.bytes ?? [])]).toEqual([137, 80, 78, 71]);
  });

  it("rejects unsupported primitive modes", () => {
    expect(() =>
      extractFirstMeshPrimitive(
        {
          meshes: [{ primitives: [{ attributes: { POSITION: 0 }, mode: 1 }] }],
        },
        new Uint8Array(),
      ),
    ).toThrow("Only triangle");
  });
});
