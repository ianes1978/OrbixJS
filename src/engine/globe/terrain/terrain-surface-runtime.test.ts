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
    expect(runtime.readyMeshes()[0]?.mesh?.positions.length).toBeGreaterThan(0);
  });

  it("can expose ready heightmaps without building CPU terrain meshes", async () => {
    const provider = fakeTerrainProvider();
    const runtime = new TerrainSurfaceRuntime({
      provider,
      selector: new TerrainTileSelector({ minLevel: 2, maxLevel: 2 }),
      createCpuMeshes: false,
      meshOptions: { skirtDepth: 80 },
      maxPending: 64,
    });

    runtime.update(0, 0, 1.2, { targetLevel: 2 });
    await runtime.settle();
    const settled = runtime.update(0, 0, 1.2, { targetLevel: 2 });
    const ready = runtime.readyMeshes()[0];

    expect(settled.loadedTiles).toBe(settled.activeTiles);
    expect(settled.gpuDisplacement).toBe(true);
    expect(settled.gpuSkirts).toBe(true);
    expect(ready?.heightmap.heights.length).toBeGreaterThan(0);
    expect(ready?.skirtDepth).toBe(80);
    expect(ready?.mesh).toBeUndefined();
  });

  it("renders a loaded parent terrain tile while requested children are still pending", async () => {
    const childRequests: TerrainTileKey[] = [];
    const provider = {
      getTile: vi.fn<TerrainProvider["getTile"]>((key) => {
        if (key.level >= 3) {
          childRequests.push(key);
          return new Promise(() => undefined);
        }

        return Promise.resolve(createFlatTerrainTile(key, { size: 3, height: key.level }));
      }),
    } satisfies TerrainProvider;
    const runtime = new TerrainSurfaceRuntime({
      provider,
      selector: new TerrainTileSelector({ minLevel: 2, maxLevel: 3 }),
      maxPending: 64,
    });

    runtime.update(0, 0, 1.2, {
      coverageTiles: [{ z: 2, x: 2, y: 2 }],
      maxTiles: 8,
    });
    await runtime.settle();
    runtime.update(0, 0, 1.2, {
      coverageTiles: [
        { z: 3, x: 4, y: 4 },
        { z: 3, x: 5, y: 4 },
      ],
      maxTiles: 8,
    });

    expect(childRequests.length).toBeGreaterThan(0);
    expect(runtime.readyMeshes().map((entry) => entry.id)).toContain("2/2/2");
    expect(runtime.stats().fallbackRenderTiles).toBe(1);
  });

  it("keeps exact terrain children over their loaded parent fallback", async () => {
    const deferred: Array<{ key: TerrainTileKey; resolve: (tile: ReturnType<typeof createFlatTerrainTile>) => void }> = [];
    const provider = {
      getTile: vi.fn<TerrainProvider["getTile"]>((key) => {
        if (key.level === 3 && key.x === 5) {
          return new Promise((resolve) => deferred.push({ key, resolve }));
        }

        return Promise.resolve(createFlatTerrainTile(key, { size: 3, height: key.level + key.x + key.y }));
      }),
    } satisfies TerrainProvider;
    const runtime = new TerrainSurfaceRuntime({
      provider,
      selector: new TerrainTileSelector({ minLevel: 2, maxLevel: 3 }),
      maxPending: 64,
    });

    runtime.update(0, 0, 1.2, {
      coverageTiles: [{ z: 2, x: 2, y: 2 }],
      maxTiles: 8,
    });
    await runtime.settle();
    runtime.update(0, 0, 1.2, {
      coverageTiles: [
        { z: 3, x: 4, y: 4 },
        { z: 3, x: 5, y: 4 },
      ],
      maxTiles: 8,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    runtime.update(0, 0, 1.2, {
      coverageTiles: [
        { z: 3, x: 4, y: 4 },
        { z: 3, x: 5, y: 4 },
      ],
      maxTiles: 8,
    });
    const renderIds = runtime.readyMeshes().map((entry) => entry.id);

    expect(renderIds).toContain("2/2/2");
    expect(renderIds).toContain("3/4/4");
    expect(runtime.stats().exactRenderTiles).toBe(1);
    expect(runtime.stats().fallbackRenderTiles).toBe(1);
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

  it("allows the frame LOD context to lower the in-flight request budget", () => {
    const provider = {
      getTile: () => new Promise<never>(() => undefined),
    } satisfies TerrainProvider;
    const runtime = new TerrainSurfaceRuntime({
      provider,
      selector: new TerrainTileSelector({ minLevel: 6, maxLevel: 6 }),
      maxPending: 8,
    });
    const stats = runtime.update(0, 0, 1.05, { targetLevel: 6, requestBudget: 2 });

    expect(stats.pendingTiles).toBe(2);
  });

  it("aborts stale pending terrain requests so newly visible tiles can use the request budget", () => {
    const aborted: TerrainTileKey[] = [];
    const requested: TerrainTileKey[] = [];
    const getTile = vi.fn<TerrainProvider["getTile"]>(
      (key, signal) =>
        new Promise((resolve, reject) => {
          requested.push(key);
          signal?.addEventListener("abort", () => {
            aborted.push(key);
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );
    const runtime = new TerrainSurfaceRuntime({
      provider: { getTile },
      selector: new TerrainTileSelector({ minLevel: 2, maxLevel: 2 }),
      maxPending: 1,
    });

    runtime.update(0, 0, 1.2, {
      coverageTiles: [{ z: 2, x: 1, y: 1 }],
      requestBudget: 1,
    });
    const stats = runtime.update(0, 0, 1.2, {
      coverageTiles: [{ z: 2, x: 2, y: 2 }],
      requestBudget: 1,
    });

    const requestedIds = requested.map((tile) => `${tile.level}/${tile.x}/${tile.y}`);

    expect(aborted.map((tile) => `${tile.level}/${tile.x}/${tile.y}`)).toEqual([requestedIds[0]]);
    expect(requestedIds).toHaveLength(2);
    expect(requestedIds[1]).not.toBe(requestedIds[0]);
    expect(stats.pendingTiles).toBe(1);
    expect(runtime.errorTileIds()).toEqual([]);
  });

  it("aborts pending terrain requests and prevents new loads after dispose", () => {
    const aborted: TerrainTileKey[] = [];
    const getTile = vi.fn<TerrainProvider["getTile"]>(
      (key, signal) =>
        new Promise((resolve, reject) => {
          signal?.addEventListener("abort", () => {
            aborted.push(key);
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );
    const runtime = new TerrainSurfaceRuntime({
      provider: { getTile },
      selector: new TerrainTileSelector({ minLevel: 2, maxLevel: 2 }),
      maxPending: 2,
    });

    runtime.update(0, 0, 1.2, {
      coverageTiles: [
        { z: 2, x: 1, y: 1 },
        { z: 2, x: 2, y: 2 },
      ],
      requestBudget: 2,
    });
    runtime.dispose();
    const stats = runtime.update(0, 0, 1.2, {
      coverageTiles: [{ z: 2, x: 3, y: 3 }],
      requestBudget: 2,
    });

    expect(aborted).toHaveLength(2);
    expect(getTile).toHaveBeenCalledTimes(2);
    expect(stats.pendingTiles).toBe(0);
    expect(runtime.readyMeshes()).toEqual([]);
    expect(runtime.loadingTileIds()).toEqual([]);
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

  it("uses the nearest available terrain ancestor when high-detail coverage is unavailable", async () => {
    const getTile = vi.fn<TerrainProvider["getTile"]>(async (key) => createFlatTerrainTile(key, { size: 2 }));
    const provider = {
      isTileAvailable: (key: TerrainTileKey) => key.level <= 2,
      getTile,
    } satisfies TerrainProvider;
    const runtime = new TerrainSurfaceRuntime({
      provider,
      selector: new TerrainTileSelector({ minLevel: 0, maxLevel: 4 }),
      maxPending: 64,
    });

    const stats = runtime.update(0, 0, 1.01, {
      coverageTiles: [
        { z: 4, x: 8, y: 8 },
        { z: 4, x: 9, y: 8 },
      ],
      maxTiles: 8,
    });
    await runtime.settle();
    runtime.update(0, 0, 1.01, {
      coverageTiles: [
        { z: 4, x: 8, y: 8 },
        { z: 4, x: 9, y: 8 },
      ],
      maxTiles: 8,
    });

    expect(stats.activeTiles).toBeGreaterThan(0);
    expect(getTile).toHaveBeenCalled();
    expect(getTile.mock.calls.every(([key]) => key.level <= 2)).toBe(true);
    expect(runtime.activeTiles().every((tile) => tile.level <= 2)).toBe(true);
    expect(runtime.readyMeshes().every((entry) => entry.tile.level <= 2)).toBe(true);
  });

  it("keeps the previous terrain coverage when a transient selection resolves to no available tiles", async () => {
    let tilesAvailable = true;
    const getTile = vi.fn<TerrainProvider["getTile"]>(async (key) => createFlatTerrainTile(key, { size: 2 }));
    const provider = {
      isTileAvailable: () => tilesAvailable,
      getTile,
    } satisfies TerrainProvider;
    const runtime = new TerrainSurfaceRuntime({
      provider,
      selector: new TerrainTileSelector({ minLevel: 2, maxLevel: 2 }),
      maxPending: 64,
    });

    runtime.update(0, 0, 1.2, {
      coverageTiles: [{ z: 2, x: 1, y: 1 }],
      maxTiles: 8,
    });
    await runtime.settle();
    const settled = runtime.update(0, 0, 1.2, {
      coverageTiles: [{ z: 2, x: 1, y: 1 }],
      maxTiles: 8,
    });
    const previousReadyIds = runtime.readyMeshes().map((entry) => entry.id);

    tilesAvailable = false;
    const retained = runtime.update(0, 0, 1.2, {
      coverageTiles: [{ z: 2, x: 3, y: 3 }],
      maxTiles: 8,
    });

    expect(settled.renderTiles).toBeGreaterThan(0);
    expect(retained.activeTiles).toBe(settled.activeTiles);
    expect(runtime.readyMeshes().map((entry) => entry.id)).toEqual(previousReadyIds);
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
