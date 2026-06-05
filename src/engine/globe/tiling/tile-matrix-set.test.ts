import { describe, expect, it } from "vitest";
import { createWebMercatorQuadMatrixSet, tileMatrixAtLevel } from "./tile-matrix-set";

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
  });
});
