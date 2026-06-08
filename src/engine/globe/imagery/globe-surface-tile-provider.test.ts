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

  it("keeps the loaded parent when requested child tiles are missing", () => {
    const provider = new GlobeSurfaceTileProvider({ minLevel: 2, maxLevel: 3, baseLevel: 2 });
    const selection = provider.select(
      0,
      0,
      1.2,
      new Set(["2/2/2", "3/4/4", "3/5/4"]),
      {
        coverageTiles: [
          { id: "3/4/4", x: 4, y: 4, z: 3 },
          { id: "3/5/4", x: 5, y: 4, z: 3 },
          { id: "3/4/5", x: 4, y: 5, z: 3 },
          { id: "3/5/5", x: 5, y: 5, z: 3 },
        ],
      },
    );
    const renderIds = selection.renderTiles.map((tile) => tile.id);

    expect(renderIds).toContain("2/2/2");
    expect(renderIds).not.toContain("3/4/4");
    expect(renderIds).not.toContain("3/5/4");
  });

  it("does not collapse loaded edge children just because off-screen siblings are absent", () => {
    const provider = new GlobeSurfaceTileProvider({ minLevel: 2, maxLevel: 3, baseLevel: 2 });
    const loaded = new Set(["2/2/2", "3/4/4", "3/5/4"]);
    const selection = provider.select(0, 0, 1.2, loaded, {
      coverageTiles: [
        { id: "3/4/4", x: 4, y: 4, z: 3 },
        { id: "3/5/4", x: 5, y: 4, z: 3 },
      ],
    });
    const renderIds = selection.renderTiles.map((tile) => tile.id);

    expect(renderIds).toEqual(["3/4/4", "3/5/4"]);
  });
});
