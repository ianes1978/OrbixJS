import { describe, expect, it } from "vitest";
import { Ellipsoid } from "../../core/geodesy/ellipsoid";
import { cross, dot, normalize, subtract } from "../../core/math/vec3";
import { WebMercatorTilingScheme, webMercatorYToLatitude } from "../tiling/web-mercator-tiling";
import { createEllipsoidTileMesh } from "./create-ellipsoid-tile-mesh";

describe("createEllipsoidTileMesh", () => {
  it("creates a patch mesh for one imagery tile", () => {
    const mesh = createEllipsoidTileMesh({ x: 2, y: 2, z: 2 }, 4);

    expect(mesh.vertexStride).toBe(8);
    expect(mesh.vertices.length).toBe(5 * 5 * 8);
    expect(mesh.indices.length).toBe(4 * 4 * 6);
  });

  it("maps local tile UVs from west to east", () => {
    const mesh = createEllipsoidTileMesh({ x: 2, y: 2, z: 2 }, 4);
    const stride = mesh.vertexStride;
    const westU = mesh.vertices[6];
    const eastU = mesh.vertices[stride * 4 + 6];

    expect(westU).toBeCloseTo(0);
    expect(eastU).toBeCloseTo(1);
  });

  it("places tile rows at Web Mercator latitudes", () => {
    const tile = { x: 2, y: 1, z: 2 };
    const mesh = createEllipsoidTileMesh(tile, 2);
    const stride = mesh.vertexStride;
    const centerRowOffset = stride * 3;
    const position = [mesh.vertices[centerRowOffset], mesh.vertices[centerRowOffset + 1], mesh.vertices[centerRowOffset + 2]];
    const count = new WebMercatorTilingScheme().tileCount(tile.z);
    const mercatorMidLat = webMercatorYToLatitude((tile.y + 0.5) / count);
    const rectangle = new WebMercatorTilingScheme().tileXYToRectangle(tile);
    const linearMidLat = (rectangle.north + rectangle.south) / 2;
    const expected = Ellipsoid.WGS84.cartographicToCartesian({
      lon: rectangle.west,
      lat: mercatorMidLat,
      height: 1500,
    });
    const maxRadius = Ellipsoid.WGS84.maximumRadius;

    expect(position[0]).toBeCloseTo(expected[0] / maxRadius, 5);
    expect(position[1]).toBeCloseTo(expected[1] / maxRadius, 5);
    expect(position[2]).toBeCloseTo(expected[2] / maxRadius, 5);
    expect(Math.abs(mercatorMidLat - linearMidLat)).toBeGreaterThan(0.01);
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
