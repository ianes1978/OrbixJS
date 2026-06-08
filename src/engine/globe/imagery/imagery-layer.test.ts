import { describe, expect, it, vi } from "vitest";
import { ImageryLayer } from "./imagery-layer";
import { type RasterTileProvider } from "./tile-provider";

describe("ImageryLayer", () => {
  it("limits concurrent dynamic tile loads", () => {
    const loadTile = vi.fn(() => new Promise<HTMLImageElement>(() => undefined));
    const provider: RasterTileProvider = {
      tileSize: 256,
      cacheSize: 0,
      loadTile,
    };
    const layer = new ImageryLayer(provider, 2, { maxLevel: 6, maxConcurrentTileLoads: 3 });

    layer.update(0, 0, 1.1, {
      coverageTiles: [
        { id: "6/30/30", x: 30, y: 30, z: 6 },
        { id: "6/31/30", x: 31, y: 30, z: 6 },
        { id: "6/32/30", x: 32, y: 30, z: 6 },
        { id: "6/33/30", x: 33, y: 30, z: 6 },
      ],
    });

    expect(loadTile).toHaveBeenCalledTimes(3);
  });

  it("does not let request budget raise concurrency above the layer limit", () => {
    const loadTile = vi.fn(() => new Promise<HTMLImageElement>(() => undefined));
    const provider: RasterTileProvider = {
      tileSize: 256,
      cacheSize: 0,
      loadTile,
    };
    const layer = new ImageryLayer(provider, 2, { maxLevel: 6, maxConcurrentTileLoads: 2 });

    layer.update(0, 0, 1.1, {
      requestBudget: 20,
      coverageTiles: [
        { id: "6/30/30", x: 30, y: 30, z: 6 },
        { id: "6/31/30", x: 31, y: 30, z: 6 },
        { id: "6/32/30", x: 32, y: 30, z: 6 },
        { id: "6/33/30", x: 33, y: 30, z: 6 },
      ],
    });

    expect(loadTile).toHaveBeenCalledTimes(2);
  });

  it("prioritizes newly visible tiles ahead of stale queued loads", async () => {
    const resolvers: Array<(image: HTMLImageElement) => void> = [];
    const loadTile = vi.fn(
      () =>
        new Promise<HTMLImageElement>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const provider: RasterTileProvider = {
      tileSize: 256,
      cacheSize: 0,
      loadTile,
    };
    const layer = new ImageryLayer(provider, 2, { maxLevel: 6, maxConcurrentTileLoads: 1 });

    layer.update(0, 0, 1.1, {
      coverageTiles: [
        { id: "6/30/30", x: 30, y: 30, z: 6 },
        { id: "6/31/30", x: 31, y: 30, z: 6 },
        { id: "6/32/30", x: 32, y: 30, z: 6 },
      ],
    });
    layer.update(0, 0, 1.1, {
      coverageTiles: [{ id: "6/32/30", x: 32, y: 30, z: 6 }],
    });

    resolvers[0]({} as HTMLImageElement);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(loadTile).toHaveBeenNthCalledWith(2, { id: "6/32/30", x: 32, y: 30, z: 6 });
  });

  it("drops stale queued loads when the visible request set changes", async () => {
    const resolvers: Array<(image: HTMLImageElement) => void> = [];
    const loadTile = vi.fn(
      () =>
        new Promise<HTMLImageElement>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const provider: RasterTileProvider = {
      tileSize: 256,
      cacheSize: 0,
      loadTile,
    };
    const layer = new ImageryLayer(provider, 2, { maxLevel: 6, maxConcurrentTileLoads: 1 });

    layer.update(0, 0, 1.1, {
      coverageTiles: [
        { id: "6/30/30", x: 30, y: 30, z: 6 },
        { id: "6/31/30", x: 31, y: 30, z: 6 },
        { id: "6/32/30", x: 32, y: 30, z: 6 },
      ],
    });
    layer.update(0, 0, 1.1, {
      coverageTiles: [{ id: "6/40/40", x: 40, y: 40, z: 6 }],
    });

    resolvers[0]({} as HTMLImageElement);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(loadTile).toHaveBeenNthCalledWith(2, { id: "6/40/40", x: 40, y: 40, z: 6 });
  });

  it("backs off unavailable high LOD tiles to their parent on later updates", async () => {
    const loadTile = vi
      .fn<() => Promise<HTMLImageElement>>()
      .mockRejectedValueOnce(new Error("missing high LOD"))
      .mockReturnValue(new Promise<HTMLImageElement>(() => undefined));
    const provider: RasterTileProvider = {
      tileSize: 256,
      cacheSize: 0,
      loadTile,
    };
    const layer = new ImageryLayer(provider, 2, { maxLevel: 6, maxConcurrentTileLoads: 1 });

    layer.update(0, 0, 1.1, {
      coverageTiles: [{ id: "6/32/30", x: 32, y: 30, z: 6 }],
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const stats = layer.update(0, 0, 1.1, {
      coverageTiles: [{ id: "6/32/30", x: 32, y: 30, z: 6 }],
    });

    expect(loadTile).toHaveBeenNthCalledWith(1, { id: "6/32/30", x: 32, y: 30, z: 6 });
    expect(loadTile).toHaveBeenNthCalledWith(2, { id: "5/16/15", x: 16, y: 15, z: 5 });
    expect(stats.level).toBe(5);
    expect(stats.vtUnavailablePages).toBe(1);
  });

  it("keeps the last renderable active set while newly requested tiles are still unavailable", () => {
    const provider: RasterTileProvider = {
      tileSize: 256,
      cacheSize: 0,
      loadTile: vi.fn(() => new Promise<HTMLImageElement>(() => undefined)),
    };
    const layer = new ImageryLayer(provider, 2, { maxLevel: 6, maxConcurrentTileLoads: 1 });
    const internals = layer as unknown as { loaded: Set<string> };

    internals.loaded.add("6/30/30");
    layer.update(0, 0, 1.1, {
      coverageTiles: [{ id: "6/30/30", x: 30, y: 30, z: 6 }],
    });

    layer.update(0, 0, 1.1, {
      coverageTiles: [{ id: "6/40/40", x: 40, y: 40, z: 6 }],
    });

    expect(layer.activeTileIds).toEqual(["6/30/30"]);
  });
});
