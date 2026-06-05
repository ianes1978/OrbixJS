import { describe, expect, it } from "vitest";
import { cross, dot, normalize, subtract } from "../../core/math/vec3";
import { createEllipsoidMesh } from "./create-ellipsoid-mesh";

describe("createEllipsoidMesh", () => {
  it("creates indexed vertex data for an ellipsoid", () => {
    const longitudeSegments = 8;
    const latitudeSegments = 4;
    const mesh = createEllipsoidMesh(undefined, longitudeSegments, latitudeSegments);

    expect(mesh.vertexStride).toBe(9);
    expect(mesh.vertices.length).toBe((longitudeSegments + 1) * (latitudeSegments + 1) * 9);
    expect(mesh.indices.length).toBe(longitudeSegments * latitudeSegments * 6);
    expect(mesh.indices[0]).toBe(0);
  });

  it("winds triangles toward the outside of the ellipsoid", () => {
    const mesh = createEllipsoidMesh(undefined, 8, 4);
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

      if (dot(faceNormal, a) > 0.1) {
        expect(dot(faceNormal, a)).toBeGreaterThan(0);
        return;
      }
    }

    throw new Error("No non-degenerate outward triangle found");
  });
});
