import { describe, expect, it } from "vitest";
import { WebMercatorTilingScheme, lonLatToWebMercatorUv } from "./web-mercator-tiling";

describe("WebMercatorTilingScheme", () => {
  it("computes tile counts by zoom level", () => {
    const tiling = new WebMercatorTilingScheme();

    expect(tiling.tileCount(0)).toBe(1);
    expect(tiling.tileCount(3)).toBe(8);
    expect(tiling.matrixSet.id).toBe("WebMercatorQuad");
  });

  it("maps lon/lat to tile coordinates", () => {
    const tiling = new WebMercatorTilingScheme();

    expect(tiling.positionToTileXY(0, 0, 2)).toEqual({ x: 2, y: 2, z: 2 });
  });

  it("maps lon/lat to normalized Web Mercator texture coordinates", () => {
    expect(lonLatToWebMercatorUv(0, 0)).toEqual([0.5, 0.5]);
  });
});
