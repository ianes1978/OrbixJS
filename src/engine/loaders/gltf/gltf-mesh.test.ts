import { describe, expect, it } from "vitest";
import { extractFirstMeshPrimitive } from "./gltf-mesh";

describe("extractFirstMeshPrimitive", () => {
  it("extracts positions and uint16 indices", () => {
    const binary = new Uint8Array(42);
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

    const primitive = extractFirstMeshPrimitive(
      {
        asset: { version: "2.0" },
        bufferViews: [
          { buffer: 0, byteOffset: 0, byteLength: 36 },
          { buffer: 0, byteOffset: 36, byteLength: 6 },
        ],
        accessors: [
          { bufferView: 0, componentType: 5126, count: 3, type: "VEC3" },
          { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" },
        ],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
      },
      binary,
    );

    expect([...primitive.positions]).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    expect([...(primitive.indices ?? [])]).toEqual([0, 1, 2]);
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
