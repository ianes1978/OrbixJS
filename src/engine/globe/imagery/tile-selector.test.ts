import { describe, expect, it } from "vitest";
import { CameraTileSelector, clampLevel, selectCoveragePadding, selectLevel, selectRadius } from "./tile-selector";

describe("CameraTileSelector", () => {
  it("selects LOD from camera distance", () => {
    expect(selectLevel(4)).toBe(2);
    expect(selectLevel(2.2)).toBe(3);
    expect(selectLevel(1.5)).toBe(4);
    expect(selectLevel(1.25)).toBe(6);
    expect(selectLevel(1.16)).toBe(6);
    expect(selectLevel(1.09)).toBe(6);
  });

  it("selects catalog-driven high LOD levels from screen-space resolution", () => {
    expect(selectLevel(1.34, 10)).toBe(7);
    expect(selectLevel(1.14, 10)).toBe(8);
    expect(selectLevel(1.07, 10)).toBe(9);
    expect(selectLevel(1.03, 10)).toBe(10);
    expect(selectLevel(1.01, 15)).toBe(12);
    expect(selectLevel(1.002, 15, { viewportHeight: 1200 })).toBe(15);
  });

  it("uses projected screen-space target levels when provided", () => {
    expect(selectLevel(3.2, 15, { targetLevel: 11 })).toBe(11);
    expect(selectLevel(1.01, 9, { targetLevel: 15 })).toBe(9);
  });

  it("selects a stable neighborhood around the visible camera center", () => {
    const selector = new CameraTileSelector();
    const selection = selector.select(0, 0, 4);

    expect(selection.level).toBe(2);
    expect(selection.tiles).toHaveLength(16);
    expect(selection.tiles.some((tile) => tile.id === "2/2/2")).toBe(true);
  });

  it("keeps a bounded tile neighborhood at high LOD", () => {
    const selector = new CameraTileSelector();
    const selection = selector.select(0, 0, 1.09);

    expect(selection.level).toBe(6);
    expect(selection.tiles).toHaveLength(121);
  });

  it("covers the visible viewport samples instead of only the center tile", () => {
    const selector = new CameraTileSelector({ maxLevel: 6 });
    const selection = selector.select(0, 0, 1.09, {
      coveragePositions: [
        [-35, -25],
        [35, 25],
      ],
    });

    expect(selection.level).toBe(6);
    expect(selection.tiles.length).toBeGreaterThan(121);
    expect(selection.tiles.some((tile) => tile.id === "6/25/36")).toBe(true);
    expect(selection.tiles.some((tile) => tile.id === "6/38/27")).toBe(true);
  });

  it("keeps viewport coverage stable across the antimeridian", () => {
    const selector = new CameraTileSelector({ maxLevel: 6 });
    const selection = selector.select(179, 0, 1.09, {
      coveragePositions: [
        [178, 0],
        [-178, 0],
      ],
    });

    expect(selection.level).toBe(6);
    expect(selection.tiles.length).toBeLessThan(80);
    expect(selection.tiles.some((tile) => tile.id === "6/63/32")).toBe(true);
    expect(selection.tiles.some((tile) => tile.id === "6/0/32")).toBe(true);
  });

  it("clamps selected LOD to layer metadata", () => {
    const selector = new CameraTileSelector({ minLevel: 3, maxLevel: 4 });
    const deepSelector = new CameraTileSelector({ minLevel: 2, maxLevel: 15 });

    expect(selector.select(0, 0, 4).level).toBe(3);
    expect(selector.select(0, 0, 1.09).level).toBe(4);
    expect(deepSelector.select(0, 0, 1.002, { viewportHeight: 1200 }).level).toBe(15);
    expect(clampLevel(6, { maxLevel: 5 })).toBe(5);
  });

  it("selects larger coverage radii for visible LOD overlays", () => {
    expect(selectRadius(2)).toBe(3);
    expect(selectRadius(3)).toBe(4);
    expect(selectRadius(4)).toBe(5);
    expect(selectCoveragePadding(4)).toBe(2);
    expect(selectCoveragePadding(11)).toBe(4);
    expect(selectCoveragePadding(13)).toBe(6);
  });
});
