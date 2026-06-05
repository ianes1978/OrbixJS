import { describe, expect, it } from "vitest";
import { cross, dot, normalize, subtract } from "../../core/math/vec3";
import { createEllipsoidTileMesh } from "./create-ellipsoid-tile-mesh";

describe("createEllipsoidTileMesh", () => {
  it("creates a patch mesh for one imagery tile", () => {
    const mesh = createEllipsoidTileMesh({ x: 2, y: 2, z: 2 }, 4);

    expect(mesh.vertexStride).toBe(8);
    expect(mesh.vertices.length).toBe(5 * 5 * 8);
    expect(mesh.indices.length).toBe(4 * 4 * 6);
  });

  it("winds tile triangles toward the outside of the ellipsoid", () => {
    const mesh = createEllipsoidTileMesh({ x: 2, y: 2, z: 2 }, 4);
    const vertices = mesh.vertices;
    const stride = mesh.vertexStride;

    for (let index = 0; index < mesh.indices.length; index += 3) {
      const aIndex = mesh.indices[index] * stride;
      const bIndex = mesh.indices[index + 1] * stride;
      const cIndex = mesh.indices[index + 2] * stride;
      const a = [vertices[aIndex], vertices[aIndex + 1], vertices[aIndex + 2]] as const;
      const b = [vertices[bIndex], vertices[bIndex + 1], vertices[bIndex + 2]] as const;
      const c = [vertices[cIndex], vertices[cIndex + 1], vertices[cIndex + 2]] as const;
      const faceNormal = normalize(cross(subtract(b, a), subtract(c, a)));
      const facing = dot(faceNormal, a);

      if (Math.abs(facing) > 0.1) {
        expect(facing).toBeGreaterThan(0);
        return;
      }
    }

    throw new Error("No non-degenerate outward tile triangle found");
  });
});
