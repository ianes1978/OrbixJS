import { describe, expect, it } from "vitest";
import { CameraTileSelector, clampLevel, selectLevel, selectRadius } from "./tile-selector";

describe("CameraTileSelector", () => {
  it("selects LOD from camera distance", () => {
    expect(selectLevel(4)).toBe(2);
    expect(selectLevel(2.2)).toBe(3);
    expect(selectLevel(1.5)).toBe(4);
    expect(selectLevel(1.25)).toBe(5);
    expect(selectLevel(1.16)).toBe(6);
    expect(selectLevel(1.14)).toBe(7);
    expect(selectLevel(1.12)).toBe(8);
    expect(selectLevel(1.09)).toBe(9);
    expect(selectLevel(1.09, 15)).toBe(15);
    expect(selectLevel(1.08, 15)).toBe(15);
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

    expect(selection.level).toBe(9);
    expect(selection.tiles).toHaveLength(121);
  });

  it("clamps selected LOD to layer metadata", () => {
    const selector = new CameraTileSelector({ minLevel: 3, maxLevel: 4 });
    const deepSelector = new CameraTileSelector({ minLevel: 2, maxLevel: 15 });

    expect(selector.select(0, 0, 4).level).toBe(3);
    expect(selector.select(0, 0, 1.09).level).toBe(4);
    expect(deepSelector.select(0, 0, 1.08).level).toBe(15);
    expect(clampLevel(6, { maxLevel: 5 })).toBe(5);
  });

  it("selects larger coverage radii for visible LOD overlays", () => {
    expect(selectRadius(2)).toBe(3);
    expect(selectRadius(3)).toBe(4);
    expect(selectRadius(4)).toBe(5);
  });
});
