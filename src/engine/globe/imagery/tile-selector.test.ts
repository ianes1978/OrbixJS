import { describe, expect, it } from "vitest";
import { CameraTileSelector, selectLevel } from "./tile-selector";

describe("CameraTileSelector", () => {
  it("selects LOD from camera distance", () => {
    expect(selectLevel(4)).toBe(2);
    expect(selectLevel(2.2)).toBe(3);
    expect(selectLevel(1.5)).toBe(4);
  });

  it("selects a stable neighborhood around the visible camera center", () => {
    const selector = new CameraTileSelector();
    const selection = selector.select([1, 0, 0], 4);

    expect(selection.level).toBe(2);
    expect(selection.tiles).toHaveLength(9);
    expect(selection.tiles.some((tile) => tile.id === "2/2/2")).toBe(true);
  });
});
