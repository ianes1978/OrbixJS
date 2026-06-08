import { describe, expect, it } from "vitest";
import {
  parseTerrainImageryTileId,
  resolveTerrainImageryFallback,
  terrainImageryTilesOverlap,
  terrainTileCanReplaceImageryTile,
} from "../terrain-imagery-fallback";

describe("resolveTerrainImageryFallback", () => {
  it("uses exact imagery when the terrain tile texture is resident", () => {
    const resolved = resolveTerrainImageryFallback({ level: 6, x: 34, y: 22 }, (id) => id === "6/34/22");

    expect(resolved).toEqual({
      imageryId: "6/34/22",
      uvScale: [1, 1],
      uvOffset: [0, 0],
    });
  });

  it("maps terrain UVs into the nearest resident imagery ancestor", () => {
    const resolved = resolveTerrainImageryFallback({ level: 6, x: 34, y: 22 }, (id) => id === "4/8/5");

    expect(resolved).toEqual({
      imageryId: "4/8/5",
      uvScale: [0.25, 0.25],
      uvOffset: [0.5, 0.5],
    });
  });

  it("returns undefined when neither exact nor ancestor imagery is resident", () => {
    expect(resolveTerrainImageryFallback({ level: 6, x: 34, y: 22 }, () => false)).toBeUndefined();
  });
});

describe("terrain imagery tile overlap", () => {
  it("matches exact terrain and imagery tiles", () => {
    expect(terrainImageryTilesOverlap({ level: 14, x: 8721, y: 6042 }, { level: 14, x: 8721, y: 6042 })).toBe(true);
    expect(terrainImageryTilesOverlap({ level: 14, x: 8721, y: 6042 }, { level: 14, x: 8722, y: 6042 })).toBe(false);
  });

  it("treats a terrain ancestor as covering imagery descendants", () => {
    expect(terrainImageryTilesOverlap({ level: 4, x: 8, y: 5 }, { level: 6, x: 34, y: 22 })).toBe(true);
    expect(terrainImageryTilesOverlap({ level: 4, x: 8, y: 5 }, { level: 6, x: 35, y: 22 })).toBe(true);
    expect(terrainImageryTilesOverlap({ level: 4, x: 8, y: 5 }, { level: 6, x: 36, y: 22 })).toBe(false);
  });

  it("treats an imagery ancestor as overlapping terrain descendants", () => {
    expect(terrainImageryTilesOverlap({ level: 6, x: 34, y: 22 }, { level: 4, x: 8, y: 5 })).toBe(true);
    expect(terrainImageryTilesOverlap({ level: 6, x: 36, y: 22 }, { level: 4, x: 8, y: 5 })).toBe(false);
  });

  it("parses slash separated tile ids", () => {
    expect(parseTerrainImageryTileId("14/8721/6042")).toEqual({ level: 14, x: 8721, y: 6042 });
    expect(parseTerrainImageryTileId("14/nope/6042")).toBeUndefined();
  });
});

describe("terrain imagery replacement", () => {
  it("keeps descendant imagery under a coarser terrain tile", () => {
    expect(terrainTileCanReplaceImageryTile({ level: 4, x: 8, y: 5 }, { level: 6, x: 34, y: 22 })).toBe(false);
  });

  it("allows only same-level terrain to replace imagery", () => {
    expect(terrainTileCanReplaceImageryTile({ level: 6, x: 34, y: 22 }, { level: 6, x: 34, y: 22 })).toBe(true);
    expect(terrainTileCanReplaceImageryTile({ level: 6, x: 34, y: 22 }, { level: 4, x: 8, y: 5 })).toBe(false);
  });
});
