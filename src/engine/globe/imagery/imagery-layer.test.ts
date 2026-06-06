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
});
