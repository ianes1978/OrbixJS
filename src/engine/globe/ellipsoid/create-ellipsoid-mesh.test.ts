import { describe, expect, it } from "vitest";
import { cross, dot, normalize, subtract } from "../../core/math/vec3";
import { createEllipsoidMesh } from "./create-ellipsoid-mesh";

describe("createEllipsoidMesh", () => {
  it("creates indexed vertex data for an ellipsoid", () => {
    const longitudeSegments = 8;
    const latitudeSegments = 4;
    const mesh = createEllipsoidMesh(undefined, longitudeSegments, latitudeSegments);
    const expectedLatitudeRings = latitudeSegments + 1;

    expect(mesh.vertexStride).toBe(11);
    expect(mesh.vertices.length).toBe((longitudeSegments + 1) * expectedLatitudeRings * 11);
    expect(mesh.indices.length).toBe(longitudeSegments * (expectedLatitudeRings - 1) * 6);
    expect(mesh.indices[0]).toBe(0);
  });

  it("maps global imagery UVs without mirroring the longitude axis", () => {
    const mesh = createEllipsoidMesh(undefined, 4, 2);
    const stride = mesh.vertexStride;
    const equatorRowOffset = (4 + 1) * stride;
    const westDateLineU = mesh.vertices[equatorRowOffset + 9];
    const primeMeridianU = mesh.vertices[equatorRowOffset + stride * 2 + 9];
    const eastQuarterU = mesh.vertices[equatorRowOffset + stride * 3 + 9];
    const eastDateLineU = mesh.vertices[equatorRowOffset + stride * 4 + 9];

    expect(westDateLineU).toBeCloseTo(0);
    expect(primeMeridianU).toBeCloseTo(0.5);
    expect(eastQuarterU).toBeCloseTo(0.75);
    expect(eastDateLineU).toBeCloseTo(1);
  });

  it("keeps polar UVs clamped inside the Web Mercator imagery range", () => {
    const mesh = createEllipsoidMesh(undefined, 8, 6);
    const stride = mesh.vertexStride;
    const northPoleV = mesh.vertices[10];
    const southPoleOffset = mesh.vertices.length - stride;
    const southPoleV = mesh.vertices[southPoleOffset + 10];

    expect(northPoleV).toBeGreaterThanOrEqual(0);
    expect(northPoleV).toBeLessThanOrEqual(0.001);
    expect(southPoleV).toBeGreaterThanOrEqual(0.999);
    expect(southPoleV).toBeLessThanOrEqual(1);
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
