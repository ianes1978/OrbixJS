import { describe, expect, it } from "vitest";
import { Ellipsoid } from "../../core/geodesy/ellipsoid";
import { computeTerrainNormalMap } from "./terrain-normal-map";
import { createFlatTerrainTile, type TerrainHeightmapTile } from "./terrain-provider";
import { tileSampleToCartographic } from "./terrain-mesh";

function decodeNormalAt(encoded: Uint8Array, index: number): [number, number, number] {
  return [
    (encoded[index * 3] / 255) * 2 - 1,
    (encoded[index * 3 + 1] / 255) * 2 - 1,
    (encoded[index * 3 + 2] / 255) * 2 - 1,
  ];
}

describe("computeTerrainNormalMap", () => {
  it("produces one RGB texel per heightmap sample", () => {
    const tile = createFlatTerrainTile({ level: 10, x: 530, y: 360 }, { size: 17 });
    const normals = computeTerrainNormalMap(tile);

    expect(normals.length).toBe(17 * 17 * 3);
  });

  it("matches the geodetic surface normal on flat terrain", () => {
    const tile = createFlatTerrainTile({ level: 10, x: 530, y: 360 }, { size: 17, height: 0 });
    const normals = computeTerrainNormalMap(tile);
    const centerIndex = 8 * 17 + 8;
    const decoded = decodeNormalAt(normals, centerIndex);
    const { lon, lat } = tileSampleToCartographic(tile, 8 / 16, 8 / 16);
    const geodetic = Ellipsoid.WGS84.geodeticSurfaceNormal(lon, lat);
    const dot = decoded[0] * geodetic[0] + decoded[1] * geodetic[1] + decoded[2] * geodetic[2];

    expect(dot).toBeGreaterThan(0.999);
  });

  it("tilts the normal against a height ramp", () => {
    const size = 17;
    const heights = new Float32Array(size * size);

    // Rampa che sale verso est: la normale deve inclinarsi verso ovest.
    for (let row = 0; row < size; row += 1) {
      for (let column = 0; column < size; column += 1) {
        heights[row * size + column] = column * 400;
      }
    }

    const tile: TerrainHeightmapTile = {
      level: 10,
      x: 530,
      y: 360,
      width: size,
      height: size,
      heights,
      minHeight: 0,
      maxHeight: (size - 1) * 400,
    };
    const normals = computeTerrainNormalMap(tile);
    const centerIndex = 8 * size + 8;
    const decoded = decodeNormalAt(normals, centerIndex);
    const { lon, lat } = tileSampleToCartographic(tile, 8 / 16, 8 / 16);
    const geodetic = Ellipsoid.WGS84.geodeticSurfaceNormal(lon, lat);
    const dot = decoded[0] * geodetic[0] + decoded[1] * geodetic[1] + decoded[2] * geodetic[2];

    // Inclinata rispetto alla verticale, ma sempre rivolta verso l'esterno.
    expect(dot).toBeGreaterThan(0.1);
    expect(dot).toBeLessThan(0.98);
  });

  it("falls back to the geodetic normal for non-finite heights", () => {
    const tile = createFlatTerrainTile({ level: 10, x: 530, y: 360 }, { size: 5 });
    tile.heights.fill(Number.NaN);
    const normals = computeTerrainNormalMap(tile);
    const decoded = decodeNormalAt(normals, 2 * 5 + 2);
    const { lon, lat } = tileSampleToCartographic(tile, 0.5, 0.5);
    const geodetic = Ellipsoid.WGS84.geodeticSurfaceNormal(lon, lat);
    const dot = decoded[0] * geodetic[0] + decoded[1] * geodetic[1] + decoded[2] * geodetic[2];

    expect(dot).toBeGreaterThan(0.999);
  });
});
