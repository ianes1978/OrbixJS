import { describe, expect, it } from "vitest";
import { GlobeSurfaceTileProvider } from "./globe-surface-tile-provider";

describe("GlobeSurfaceTileProvider", () => {
  it("keeps the render set non-overlapping when a parent is used as fallback", () => {
    const provider = new GlobeSurfaceTileProvider({ minLevel: 2, maxLevel: 3, baseLevel: 2 });
    const selection = provider.select(0, 0, 1.2, new Set(["2/2/2", "3/4/4"]), { targetLevel: 3 });
    const renderIds = selection.renderTiles.map((tile) => tile.id);

    expect(selection.level).toBe(3);
    expect(renderIds).toContain("2/2/2");
    expect(renderIds).not.toContain("3/4/4");
  });

  it("renders exact child tiles when no loaded ancestor covers the same branch", () => {
    const provider = new GlobeSurfaceTileProvider({ minLevel: 2, maxLevel: 3, baseLevel: 2 });
    const selection = provider.select(0, 0, 1.2, new Set(["3/4/4"]), { targetLevel: 3 });
    const renderIds = selection.renderTiles.map((tile) => tile.id);

    expect(renderIds).toContain("3/4/4");
  });
});
