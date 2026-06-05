import { describe, expect, it } from "vitest";
import {
  createTileMatrixSetDescriptor,
  createWebMercatorQuadMatrixSet,
  maxTileMatrixLevel,
  minTileMatrixLevel,
  tileMatrixAtLevel,
} from "./tile-matrix-set";

describe("TileMatrixSet", () => {
  it("creates a WebMercatorQuad matrix pyramid", () => {
    const matrixSet = createWebMercatorQuadMatrixSet(3, 512);

    expect(matrixSet.id).toBe("WebMercatorQuad");
    expect(matrixSet.crs).toBe("EPSG:3857");
    expect(matrixSet.matrices).toHaveLength(4);
    expect(tileMatrixAtLevel(matrixSet, 3)).toMatchObject({
      level: 3,
      matrixWidth: 8,
      matrixHeight: 8,
      tileWidth: 512,
      tileHeight: 512,
    });
    expect(minTileMatrixLevel(matrixSet)).toBe(0);
    expect(maxTileMatrixLevel(matrixSet)).toBe(3);
  });

  it("accepts a custom tile matrix set descriptor", () => {
    const matrixSet = createTileMatrixSetDescriptor({
      id: "EPSG_25832",
      crs: "EPSG:25832",
      extent: { west: 520000, south: 5100000, east: 820000, north: 5300000 },
      matrices: [
        { level: 1, matrixWidth: 2, matrixHeight: 1, tileWidth: 256, tileHeight: 256 },
        { level: 0, matrixWidth: 1, matrixHeight: 1, tileWidth: 256, tileHeight: 256 },
      ],
    });

    expect(matrixSet.id).toBe("EPSG_25832");
    expect(matrixSet.crs).toBe("EPSG:25832");
    expect(matrixSet.matrices.map((matrix) => matrix.level)).toEqual([0, 1]);
  });

  it("rejects duplicate matrix levels", () => {
    expect(() =>
      createTileMatrixSetDescriptor({
        id: "bad",
        crs: "EPSG:3857",
        extent: { west: -1, south: -1, east: 1, north: 1 },
        matrices: [
          { level: 0, matrixWidth: 1, matrixHeight: 1, tileWidth: 256, tileHeight: 256 },
          { level: 0, matrixWidth: 2, matrixHeight: 2, tileWidth: 256, tileHeight: 256 },
        ],
      }),
    ).toThrow("Duplicate TileMatrix level");
  });
});
