import { describe, expect, it, vi } from "vitest";
import { createFlatTerrainTile, type TerrainProvider, type TerrainTileKey } from "./terrain-provider";
import { TerrainSurfaceRuntime } from "./terrain-surface-runtime";
import { TerrainTileSelector } from "./terrain-tile-selector";

describe("TerrainSurfaceRuntime", () => {
  it("loads selected heightmap tiles and exposes ready terrain meshes", async () => {
    const provider = fakeTerrainProvider();
    const runtime = new TerrainSurfaceRuntime({
      provider,
      selector: new TerrainTileSelector({ minLevel: 2, maxLevel: 2 }),
      maxPending: 64,
    });
    const initial = runtime.update(0, 0, 1.2, { targetLevel: 2 });

    expect(initial.level).toBe(2);
    expect(initial.activeTiles).toBeGreaterThan(0);
    expect(initial.loadedTiles).toBe(0);
    expect(initial.pendingTiles).toBeGreaterThan(0);

    await runtime.settle();
    const settled = runtime.update(0, 0, 1.2, { targetLevel: 2 });

    expect(settled.loadedTiles).toBe(settled.activeTiles);
    expect(runtime.readyMeshes()).toHaveLength(settled.activeTiles);
    expect(runtime.readyMeshes()[0].mesh.positions.length).toBeGreaterThan(0);
  });

  it("does not duplicate pending tile requests across repeated updates", async () => {
    const getTile = vi.fn<TerrainProvider["getTile"]>(async (key) => createFlatTerrainTile(key, { size: 2 }));
    const runtime = new TerrainSurfaceRuntime({
      provider: { getTile },
      selector: new TerrainTileSelector({ minLevel: 2, maxLevel: 2 }),
    });

    runtime.update(0, 0, 1.2, { targetLevel: 2 });
    runtime.update(0, 0, 1.2, { targetLevel: 2 });
    await runtime.settle();

    const requested = new Set(getTile.mock.calls.map(([key]) => `${key.level}/${key.x}/${key.y}`));
    expect(getTile).toHaveBeenCalledTimes(requested.size);
  });

  it("limits in-flight terrain tile requests", () => {
    const provider = {
      getTile: () => new Promise<never>(() => undefined),
    } satisfies TerrainProvider;
    const runtime = new TerrainSurfaceRuntime({
      provider,
      selector: new TerrainTileSelector({ minLevel: 6, maxLevel: 6 }),
      maxPending: 3,
    });
    const stats = runtime.update(0, 0, 1.05, { targetLevel: 6 });

    expect(stats.pendingTiles).toBe(3);
  });

  it("tracks terrain tile states for surface fallback decisions", async () => {
    const getTile = vi.fn<TerrainProvider["getTile"]>(async (key) => {
      if (key.x % 2 === 0) {
        throw new Error("missing terrain");
      }

      return createFlatTerrainTile(key, { size: 2 });
    });
    const runtime = new TerrainSurfaceRuntime({
      provider: { getTile },
      selector: new TerrainTileSelector({ minLevel: 2, maxLevel: 2 }),
      maxPending: 64,
    });

    runtime.update(0, 0, 1.2, { targetLevel: 2 });
    const loadingIds = runtime.loadingTileIds();

    expect(loadingIds.length).toBeGreaterThan(0);
    expect(runtime.terrainStateForTile(loadingIds[0])).toBe("loading");

    await runtime.settle();
    runtime.update(0, 0, 1.2, { targetLevel: 2 });

    const states = runtime.activeTiles().map((tile) => runtime.terrainStateForTile(`${tile.level}/${tile.x}/${tile.y}`));

    expect(states).toContain("ready");
    expect(states).toContain("error");
    expect(runtime.errorTileIds().length).toBeGreaterThan(0);
  });

  it("skips unavailable provider tiles", async () => {
    const getTile = vi.fn<TerrainProvider["getTile"]>(async (key) => createFlatTerrainTile(key, { size: 2 }));
    const provider = {
      isTileAvailable: (key: TerrainTileKey) => key.x % 2 === 0,
      getTile,
    } satisfies TerrainProvider;
    const runtime = new TerrainSurfaceRuntime({
      provider,
      selector: new TerrainTileSelector({ minLevel: 2, maxLevel: 2 }),
      maxPending: 64,
    });

    const stats = runtime.update(0, 0, 1.2, { targetLevel: 2 });
    await runtime.settle();

    expect(stats.activeTiles).toBeGreaterThan(0);
    expect(getTile).toHaveBeenCalled();
    expect(getTile.mock.calls.every(([key]) => key.x % 2 === 0)).toBe(true);
  });

  it("trims old terrain meshes while preserving active entries first", async () => {
    const runtime = new TerrainSurfaceRuntime({
      provider: fakeTerrainProvider(),
      selector: new TerrainTileSelector({ minLevel: 2, maxLevel: 2 }),
      maxMeshes: 4,
    });

    runtime.update(0, 0, 1.2, { targetLevel: 2 });
    await runtime.settle();
    runtime.update(1.2, 0.4, 1.2, { targetLevel: 2 });
    await runtime.settle();
    const stats = runtime.update(1.2, 0.4, 1.2, { targetLevel: 2 });

    expect(stats.meshCacheSize).toBeLessThanOrEqual(4);
    expect(runtime.readyMeshes().length).toBeLessThanOrEqual(4);
  });
});

function fakeTerrainProvider(): TerrainProvider {
  return {
    getTile: async (key: TerrainTileKey) => createFlatTerrainTile(key, { size: 3, height: key.level + key.x + key.y }),
  };
}
