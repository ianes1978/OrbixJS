import { describe, expect, it } from "vitest";
import { GlobeSurfaceTileProvider } from "./globe-surface-tile-provider";

describe("GlobeSurfaceTileProvider", () => {
  it("renders the nearest loaded ancestor fallback for a missing requested tile", () => {
    const provider = new GlobeSurfaceTileProvider({ minLevel: 2, maxLevel: 3, baseLevel: 2 });
    const selection = provider.select(0, 0, 1.2, new Set(["2/2/2"]), {
      coverageTiles: [{ id: "3/4/4", x: 4, y: 4, z: 3 }],
    });

    expect(selection.level).toBe(3);
    expect(
      selection.renderTiles.map((tile) => ({ id: tile.id, sourceId: tile.sourceTile.id, state: tile.state, requestedId: tile.requestedId })),
    ).toEqual([
      { id: "3/4/4", sourceId: "2/2/2", state: "fallback", requestedId: "3/4/4" },
    ]);
  });

  it("renders exact child tiles when no loaded ancestor covers the same branch", () => {
    const provider = new GlobeSurfaceTileProvider({ minLevel: 2, maxLevel: 3, baseLevel: 2 });
    const selection = provider.select(0, 0, 1.2, new Set(["3/4/4"]), { targetLevel: 3 });
    const renderIds = selection.renderTiles.map((tile) => tile.id);

    expect(renderIds).toContain("3/4/4");
  });

  it("backs unavailable child requests off to the nearest available ancestor", () => {
    const provider = new GlobeSurfaceTileProvider({ minLevel: 2, maxLevel: 4, baseLevel: 2 });
    const unavailable = new Set(["4/8/8"]);
    const selection = provider.select(0, 0, 1.2, new Set(), unavailable, {
      coverageTiles: [{ id: "4/8/8", x: 8, y: 8, z: 4 }],
    });

    expect(selection.requestTiles.map((tile) => tile.id)).toEqual(["3/4/4"]);
    expect(selection.level).toBe(3);
  });

  it("uses requested tile geometry when a loaded parent supplies fallback imagery", () => {
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
    const renderTiles = selection.renderTiles.map((tile) => ({
      id: tile.id,
      sourceId: tile.sourceTile.id,
      state: tile.state,
    }));

    expect(renderTiles).toEqual([
      { id: "3/4/4", sourceId: "3/4/4", state: "exact" },
      { id: "3/5/4", sourceId: "3/5/4", state: "exact" },
      { id: "3/4/5", sourceId: "2/2/2", state: "fallback" },
      { id: "3/5/5", sourceId: "2/2/2", state: "fallback" },
    ]);
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
