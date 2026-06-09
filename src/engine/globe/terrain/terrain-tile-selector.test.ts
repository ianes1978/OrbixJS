import { describe, expect, it } from "vitest";
import {
  TerrainTileSelector,
  clampTerrainLevel,
  selectTerrainLevel,
  terrainCoveragePadding,
  terrainSelectRadius,
} from "./terrain-tile-selector";

describe("TerrainTileSelector", () => {
  it("selects terrain LOD from camera distance and screen resolution", () => {
    expect(selectTerrainLevel(3.2, 15)).toBe(4);
    expect(selectTerrainLevel(1.2, 15)).toBeGreaterThan(3);
    expect(selectTerrainLevel(1.01, 15)).toBeGreaterThan(8);
    expect(selectTerrainLevel(1.0001, 15, { viewportHeight: 1200 })).toBe(15);
  });

  it("respects an explicit target level", () => {
    expect(selectTerrainLevel(3.2, 15, { targetLevel: 9 })).toBe(9);
    expect(selectTerrainLevel(1.0001, 6, { targetLevel: 12 })).toBe(6);
  });

  it("covers viewport samples at a selected terrain level", () => {
    const selector = new TerrainTileSelector({ minLevel: 2, maxLevel: 6 });
    const selection = selector.select(0, 0, 1.05, {
      targetLevel: 6,
      coveragePositions: [
        [-0.2, -0.2],
        [0.2, 0.2],
      ],
    });

    expect(selection.level).toBe(6);
    expect(selection.tiles.length).toBeGreaterThan(9);
    expect(selection.tiles.some((tile) => tile.id === "6/31/32")).toBe(true);
    expect(selection.tiles.some((tile) => tile.id === "6/32/31")).toBe(true);
  });

  it("backs off to coarser levels when tile budget is exceeded", () => {
    const selector = new TerrainTileSelector({ minLevel: 2, maxLevel: 12, maxTiles: 16 });
    const selection = selector.select(0, 0, 1.0001, {
      targetLevel: 12,
      coveragePositions: [
        [-0.5, -0.35],
        [0.5, 0.35],
      ],
    });

    expect(selection.level).toBeLessThan(12);
    expect(selection.tiles.length).toBeLessThanOrEqual(16);
  });

  it("allows the frame LOD context to lower the terrain tile budget", () => {
    const selector = new TerrainTileSelector({ minLevel: 2, maxLevel: 12, maxTiles: 128 });
    const selection = selector.select(0, 0, 1.0001, {
      targetLevel: 12,
      maxTiles: 8,
      coveragePositions: [
        [-0.5, -0.35],
        [0.5, 0.35],
      ],
    });

    expect(selection.tiles.length).toBeLessThanOrEqual(8);
  });

  it("uses explicit screen-space coverage tiles without filling their bounding box", () => {
    const selector = new TerrainTileSelector({ minLevel: 2, maxLevel: 8 });
    const selection = selector.select(0, 0, 1.01, {
      targetLevel: 8,
      coverageTiles: [
        { z: 8, x: 120, y: 90 },
        { z: 8, x: 170, y: 125 },
      ],
    });

    expect(selection.level).toBe(8);
    expect(selection.tiles.map((tile) => tile.id)).toEqual(["8/120/90", "8/170/125"]);
  });

  it("preserves mixed coverage LODs instead of normalizing every terrain tile to one level", () => {
    const selector = new TerrainTileSelector({ minLevel: 2, maxLevel: 14 });
    const selection = selector.select(0, 0, 1.01, {
      coverageTiles: [
        { z: 8, x: 120, y: 90 },
        { z: 12, x: 1930, y: 1440 },
        { z: 12, x: 1931, y: 1440 },
      ],
      maxTiles: 8,
    });

    expect(selection.level).toBe(12);
    expect(selection.tiles.some((tile) => tile.id === "8/120/90")).toBe(true);
    expect(selection.tiles.some((tile) => tile.level === 12)).toBe(true);
  });

  it("coalesces high-detail coverage tiles toward parents without flattening lower LOD coverage", () => {
    const selector = new TerrainTileSelector({ minLevel: 2, maxLevel: 14 });
    const selection = selector.select(0, 0, 1.01, {
      coverageTiles: [
        { z: 8, x: 120, y: 90 },
        { z: 12, x: 1930, y: 1440 },
        { z: 12, x: 1931, y: 1440 },
        { z: 12, x: 1932, y: 1440 },
        { z: 12, x: 1933, y: 1440 },
      ],
      maxTiles: 3,
    });

    expect(selection.tiles.length).toBeLessThanOrEqual(3);
    expect(selection.tiles.some((tile) => tile.id === "8/120/90")).toBe(true);
    expect(new Set(selection.tiles.map((tile) => tile.level)).size).toBeGreaterThan(1);
  });

  it("preserves earlier priority coverage tiles when terrain coverage is coalesced", () => {
    const selector = new TerrainTileSelector({ minLevel: 2, maxLevel: 14 });
    const selection = selector.select(0, 0, 1.01, {
      coverageTiles: [
        { z: 12, x: 4000, y: 4000 },
        { z: 12, x: 100, y: 100 },
        { z: 12, x: 101, y: 100 },
        { z: 12, x: 100, y: 101 },
        { z: 12, x: 101, y: 101 },
      ],
      maxTiles: 2,
    });

    expect(selection.tiles.length).toBeLessThanOrEqual(2);
    expect(selection.tiles.some((tile) => tile.id === "12/4000/4000")).toBe(true);
    expect(selection.tiles.some((tile) => tile.id === "11/50/50")).toBe(true);
  });

  it("removes child terrain tiles once their parent is selected for budget coalescing", () => {
    const selector = new TerrainTileSelector({ minLevel: 2, maxLevel: 6 });
    const selection = selector.select(0, 0, 1.01, {
      coverageTiles: [
        { z: 6, x: 20, y: 20 },
        { z: 6, x: 21, y: 20 },
        { z: 6, x: 20, y: 21 },
        { z: 6, x: 21, y: 21 },
      ],
      maxTiles: 3,
    });

    expect(selection.tiles.map((tile) => tile.id)).toEqual(["5/10/10"]);
  });

  it("backs explicit coverage tiles off instead of truncating terrain coverage", () => {
    const selector = new TerrainTileSelector({ minLevel: 2, maxLevel: 12 });
    const coverageTiles = Array.from({ length: 16 }, (_, index) => ({
      z: 10,
      x: 640 + index,
      y: 380,
    }));
    const selection = selector.select(0, 0, 1.01, {
      coverageTiles,
      maxTiles: 4,
    });

    expect(selection.level).toBeLessThan(10);
    expect(selection.tiles.length).toBeLessThanOrEqual(4);
    expect(selection.tiles.every((tile) => tile.level === selection.level)).toBe(true);
  });

  it("normalizes explicit coverage tiles to terrain level limits", () => {
    const selector = new TerrainTileSelector({ minLevel: 2, maxLevel: 6 });
    const selection = selector.select(0, 0, 1.01, {
      targetLevel: 8,
      coverageTiles: [{ z: 8, x: 120, y: 88 }],
    });

    expect(selection.level).toBe(6);
    expect(selection.tiles.map((tile) => tile.id)).toEqual(["6/30/22"]);
  });

  it("keeps terrain selection stable across the antimeridian", () => {
    const selector = new TerrainTileSelector({ minLevel: 4, maxLevel: 4 });
    const selection = selector.select(Math.PI - 0.01, 0, 1.05, {
      coveragePositions: [
        [Math.PI - 0.02, 0],
        [-Math.PI + 0.02, 0],
      ],
    });

    expect(selection.level).toBe(4);
    expect(selection.tiles.some((tile) => tile.id === "4/15/8")).toBe(true);
    expect(selection.tiles.some((tile) => tile.id === "4/0/8")).toBe(true);
    expect(selection.tiles.length).toBeLessThan(20);
  });

  it("clamps levels and exposes stable padding heuristics", () => {
    expect(clampTerrainLevel(1, { minLevel: 2, maxLevel: 8 })).toBe(2);
    expect(clampTerrainLevel(12, { minLevel: 2, maxLevel: 8 })).toBe(8);
    expect(terrainSelectRadius(2)).toBe(2);
    expect(terrainSelectRadius(5)).toBe(3);
    expect(terrainSelectRadius(8)).toBe(4);
    expect(terrainCoveragePadding(4)).toBe(1);
    expect(terrainCoveragePadding(10)).toBe(4);
    expect(terrainCoveragePadding(13)).toBe(6);
  });
});
