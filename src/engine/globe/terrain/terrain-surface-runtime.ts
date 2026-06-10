import { createTerrainMesh, type TerrainMesh, type TerrainMeshOptions } from "./terrain-mesh";
import { TerrainTileSelector, type TerrainTileSelectorContext, type TerrainTileSelectorOptions } from "./terrain-tile-selector";
import { createTerrainTileId, type TerrainHeightmapTile, type TerrainProvider, type TerrainTileKey } from "./terrain-provider";

export type TerrainSurfaceMeshEntry = {
  tile: TerrainTileKey;
  id: string;
  heightmap: TerrainHeightmapTile;
  exaggeration: number;
  skirtDepth: number;
  mesh?: TerrainMesh;
};

export type TerrainSurfaceTileState = "none" | "loading" | "ready" | "error";

export type TerrainSurfaceStats = {
  level: number;
  providerMinLevel?: number;
  providerMaxNativeLevel?: number;
  activeTiles: number;
  loadedTiles: number;
  pendingTiles: number;
  renderTiles: number;
  exactRenderTiles: number;
  fallbackRenderTiles: number;
  requestLevels: TerrainLevelStats;
  renderLevels: TerrainLevelStats;
  exactRenderLevels: TerrainLevelStats;
  fallbackRenderLevels: TerrainLevelStats;
  meshCacheSize: number;
  cpuMeshes: number;
  gpuDisplacement: boolean;
  gpuSkirts: boolean;
};

type TerrainPendingRequest = {
  id: string;
  tile: TerrainTileKey;
  promise: Promise<TerrainSurfaceMeshEntry>;
  controller: AbortController;
};

export type TerrainLevelStats = {
  min?: number;
  max?: number;
  average?: number;
  histogram: Record<number, number>;
};

export type TerrainSurfaceRuntimeOptions = {
  provider: TerrainProvider;
  selector?: TerrainTileSelector;
  selectorOptions?: TerrainTileSelectorOptions;
  meshOptions?: TerrainMeshOptions;
  createCpuMeshes?: boolean;
  maxMeshes?: number;
  maxPending?: number;
  onError?: (error: unknown) => void;
};

export class TerrainSurfaceRuntime {
  private readonly selector: TerrainTileSelector;
  private readonly maxMeshes: number;
  private readonly maxPending: number;
  private readonly meshCache = new Map<string, TerrainSurfaceMeshEntry>();
  private readonly pending = new Map<string, TerrainPendingRequest>();
  private readonly errors = new Set<string>();
  private activeTileIds = new Set<string>();
  private activeTilesById = new Map<string, TerrainTileKey>();
  private disposed = false;
  private lastStats: TerrainSurfaceStats = {
    level: 0,
    activeTiles: 0,
    loadedTiles: 0,
    pendingTiles: 0,
    renderTiles: 0,
    exactRenderTiles: 0,
    fallbackRenderTiles: 0,
    requestLevels: { histogram: {} },
    renderLevels: { histogram: {} },
    exactRenderLevels: { histogram: {} },
    fallbackRenderLevels: { histogram: {} },
    meshCacheSize: 0,
    cpuMeshes: 0,
    gpuDisplacement: false,
    gpuSkirts: false,
  };

  constructor(private readonly options: TerrainSurfaceRuntimeOptions) {
    this.selector = options.selector ?? new TerrainTileSelector(options.selectorOptions);
    this.maxMeshes = options.maxMeshes ?? 512;
    this.maxPending = options.maxPending ?? 16;
  }

  update(lon: number, lat: number, cameraDistance: number, context: TerrainTileSelectorContext = {}): TerrainSurfaceStats {
    if (this.disposed) {
      return this.lastStats;
    }

    const selection = this.selector.select(lon, lat, cameraDistance, context);
    const resolvedAvailableTiles = resolveAvailableTerrainTiles(selection.tiles, this.options.provider);
    const availableTiles =
      resolvedAvailableTiles.length > 0 || this.activeTilesById.size === 0
        ? resolvedAvailableTiles
        : [...this.activeTilesById.values()];
    const maxPending = Math.max(1, context.requestBudget ?? this.maxPending);
    this.activeTileIds = new Set(availableTiles.map((tile) => createTerrainTileId(tile)));
    this.activeTilesById = new Map(availableTiles.map((tile) => [createTerrainTileId(tile), tile]));
    const requestTiles = prioritizeTerrainRequests(availableTiles, this.meshCache, this.pending, this.errors);
    this.cancelStalePendingRequests(new Set(requestTiles.map((tile) => createTerrainTileId(tile))));

    for (const tile of requestTiles) {
      if (this.pending.size >= maxPending) {
        break;
      }

      this.ensureMesh(tile);
    }

    this.trimMeshCache();
    const renderEntries = this.readyMeshes();
    const exactEntries = renderEntries.filter((entry) => this.activeTileIds.has(entry.id));
    const fallbackEntries = renderEntries.filter((entry) => !this.activeTileIds.has(entry.id));
    const exactRenderTiles = countExactRenderTiles(renderEntries, this.activeTileIds);
    this.lastStats = {
      level: selection.level,
      providerMinLevel: this.options.provider.minLevel,
      providerMaxNativeLevel: this.options.provider.maxNativeLevel,
      activeTiles: availableTiles.length,
      loadedTiles: availableTiles.filter((tile) => this.meshCache.has(createTerrainTileId(tile))).length,
      pendingTiles: this.pending.size,
      renderTiles: renderEntries.length,
      exactRenderTiles,
      fallbackRenderTiles: renderEntries.length - exactRenderTiles,
      requestLevels: summarizeTerrainLevels(availableTiles),
      renderLevels: summarizeTerrainLevels(renderEntries.map((entry) => entry.tile)),
      exactRenderLevels: summarizeTerrainLevels(exactEntries.map((entry) => entry.tile)),
      fallbackRenderLevels: summarizeTerrainLevels(fallbackEntries.map((entry) => entry.tile)),
      meshCacheSize: this.meshCache.size,
      cpuMeshes: countCpuMeshes(this.meshCache),
      gpuDisplacement: !(this.options.createCpuMeshes ?? true),
      gpuSkirts: (this.options.meshOptions?.skirtDepth ?? 0) > 0,
    };

    return this.lastStats;
  }

  stats(): TerrainSurfaceStats {
    return { ...this.lastStats };
  }

  readyMeshes(): TerrainSurfaceMeshEntry[] {
    const resolved = new Map<string, TerrainSurfaceMeshEntry>();

    for (const tile of this.activeTilesById.values()) {
      const entry = this.deepestReadyTerrain(tile);

      if (entry) {
        resolved.set(entry.id, entry);
      }
    }

    return pruneOverlappingTerrainEntries([...resolved.values()]).sort(
      (a, b) => a.tile.level - b.tile.level || a.tile.y - b.tile.y || a.tile.x - b.tile.x,
    );
  }

  activeTiles(): TerrainTileKey[] {
    return [...this.activeTilesById.values()];
  }

  loadingTileIds(): string[] {
    return [...this.activeTileIds].filter((id) => this.pending.has(id));
  }

  errorTileIds(): string[] {
    return [...this.activeTileIds].filter((id) => this.errors.has(id));
  }

  terrainStateForTile(id: string): TerrainSurfaceTileState {
    if (this.meshCache.has(id)) {
      return "ready";
    }

    if (this.pending.has(id)) {
      return "loading";
    }

    if (this.errors.has(id)) {
      return "error";
    }

    return "none";
  }

  meshForTile(tile: TerrainTileKey): TerrainSurfaceMeshEntry | undefined {
    return this.meshCache.get(createTerrainTileId(tile));
  }

  async settle(): Promise<void> {
    await Promise.allSettled([...this.pending.values()].map((request) => request.promise));
  }

  dispose(): void {
    this.disposed = true;
    this.cancelAllPendingRequests();
    this.activeTileIds.clear();
    this.activeTilesById.clear();
    this.meshCache.clear();
    this.errors.clear();
    this.lastStats = {
      ...this.lastStats,
      activeTiles: 0,
      loadedTiles: 0,
      pendingTiles: 0,
      renderTiles: 0,
      exactRenderTiles: 0,
      fallbackRenderTiles: 0,
      requestLevels: { histogram: {} },
      renderLevels: { histogram: {} },
      exactRenderLevels: { histogram: {} },
      fallbackRenderLevels: { histogram: {} },
      meshCacheSize: 0,
      cpuMeshes: 0,
    };
  }

  private ensureMesh(tile: TerrainTileKey): void {
    const id = createTerrainTileId(tile);

    if (this.meshCache.has(id) || this.pending.has(id)) {
      return;
    }

    if (this.options.provider.isTileAvailable?.(tile) === false) {
      this.errors.add(id);
      return;
    }

    if (this.errors.has(id)) {
      return;
    }

    const controller = new AbortController();
    let pendingRequest: TerrainPendingRequest;
    const request = this.options.provider
      .getTile(tile, controller.signal)
      .then((heightmap) => {
        const mesh = (this.options.createCpuMeshes ?? true) ? createTerrainMesh(heightmap, this.options.meshOptions) : undefined;
        const entry = {
          tile,
          id,
          heightmap,
          exaggeration: this.options.meshOptions?.exaggeration ?? 1,
          skirtDepth: Math.max(0, this.options.meshOptions?.skirtDepth ?? 0),
          mesh,
        };

        this.meshCache.set(id, entry);
        this.errors.delete(id);
        this.trimMeshCache();
        return entry;
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || isAbortError(error)) {
          throw error;
        }

        this.errors.add(id);
        this.options.onError?.(error);
        throw error;
      })
      .finally(() => {
        if (this.pending.get(id) === pendingRequest) {
          this.pending.delete(id);
        }
      });

    pendingRequest = { id, tile, promise: request, controller };
    this.pending.set(id, pendingRequest);
    void request.catch(() => undefined);
  }

  private cancelStalePendingRequests(keepIds: ReadonlySet<string>): void {
    for (const [id, request] of this.pending) {
      if (keepIds.has(id)) {
        continue;
      }

      request.controller.abort();
      this.pending.delete(id);
    }
  }

  private cancelAllPendingRequests(): void {
    for (const [id, request] of this.pending) {
      request.controller.abort();
      this.pending.delete(id);
    }
  }

  private trimMeshCache(): void {
    while (this.meshCache.size > this.maxMeshes) {
      const disposable = this.firstDisposableMeshId();
      const first = disposable ?? this.meshCache.keys().next().value;

      if (!first) {
        return;
      }

      this.meshCache.delete(first);
    }
  }

  private firstDisposableMeshId(): string | undefined {
    for (const id of this.meshCache.keys()) {
      if (!this.activeTileIds.has(id)) {
        return id;
      }
    }

    return undefined;
  }

  private deepestReadyTerrain(tile: TerrainTileKey): TerrainSurfaceMeshEntry | undefined {
    let current = terrainTileWithId(tile);

    while (current.level >= 0) {
      const entry = this.meshCache.get(current.id);

      if (entry) {
        return entry;
      }

      if (current.level === 0) {
        return undefined;
      }

      current = parentTerrainTile(current);
    }

    return undefined;
  }
}

function prioritizeTerrainRequests(
  tiles: readonly TerrainTileKey[],
  loaded: ReadonlyMap<string, TerrainSurfaceMeshEntry>,
  pending: ReadonlyMap<string, TerrainPendingRequest>,
  errors: ReadonlySet<string>,
): TerrainTileKey[] {
  const prioritized = new Map<string, TerrainTileKey>();

  for (const tile of tiles) {
    const fallback = nearestNeededFallbackAncestor(tile, loaded, pending, errors);

    if (fallback) {
      prioritized.set(createTerrainTileId(fallback), fallback);
    }
  }

  for (const tile of tiles) {
    prioritized.set(createTerrainTileId(tile), tile);
  }

  return [...prioritized.values()];
}

function resolveAvailableTerrainTiles(
  tiles: readonly TerrainTileKey[],
  provider: TerrainProvider,
): TerrainTileKey[] {
  if (!provider.isTileAvailable) {
    return [...tiles];
  }

  const resolved = new Map<string, TerrainTileKey>();

  for (const tile of tiles) {
    const available = nearestAvailableTerrainAncestor(tile, provider);

    if (available) {
      resolved.set(createTerrainTileId(available), available);
    }
  }

  return [...resolved.values()].sort((a, b) => a.level - b.level || a.y - b.y || a.x - b.x);
}

function nearestAvailableTerrainAncestor(tile: TerrainTileKey, provider: TerrainProvider): TerrainTileKey | undefined {
  let current = terrainTileWithId(tile);

  while (current.level >= 0) {
    if (provider.isTileAvailable?.(current) ?? true) {
      return current;
    }

    if (current.level === 0) {
      return undefined;
    }

    current = parentTerrainTile(current);
  }

  return undefined;
}

function nearestNeededFallbackAncestor(
  tile: TerrainTileKey,
  loaded: ReadonlyMap<string, TerrainSurfaceMeshEntry>,
  pending: ReadonlyMap<string, TerrainPendingRequest>,
  errors: ReadonlySet<string>,
): TerrainTileKey | undefined {
  const exactId = createTerrainTileId(tile);

  if (loaded.has(exactId) || pending.has(exactId) || tile.level <= 0) {
    return undefined;
  }

  let current = parentTerrainTile(tile);

  while (current.level >= 0) {
    if (loaded.has(current.id) || pending.has(current.id)) {
      return undefined;
    }

    if (!errors.has(current.id)) {
      return current;
    }

    if (current.level === 0) {
      return undefined;
    }
    current = parentTerrainTile(current);
  }

  return undefined;
}

function isAbortError(error: unknown): boolean {
  return typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "AbortError";
}

function parentTerrainTile(tile: TerrainTileKey): TerrainTileKey & { id: string } {
  return terrainTileWithId({
    level: tile.level - 1,
    x: Math.floor(tile.x / 2),
    y: Math.floor(tile.y / 2),
  });
}

function terrainTileWithId(tile: TerrainTileKey): TerrainTileKey & { id: string } {
  return {
    ...tile,
    id: createTerrainTileId(tile),
  };
}

function countExactRenderTiles(renderEntries: readonly TerrainSurfaceMeshEntry[], activeTileIds: ReadonlySet<string>): number {
  return renderEntries.filter((entry) => activeTileIds.has(entry.id)).length;
}

function countCpuMeshes(meshes: ReadonlyMap<string, TerrainSurfaceMeshEntry>): number {
  let count = 0;

  for (const entry of meshes.values()) {
    if (entry.mesh) {
      count += 1;
    }
  }

  return count;
}

function summarizeTerrainLevels(tiles: readonly TerrainTileKey[]): TerrainLevelStats {
  const histogram: Record<number, number> = {};
  let min: number | undefined;
  let max: number | undefined;
  let total = 0;

  for (const tile of tiles) {
    histogram[tile.level] = (histogram[tile.level] ?? 0) + 1;
    min = min === undefined ? tile.level : Math.min(min, tile.level);
    max = max === undefined ? tile.level : Math.max(max, tile.level);
    total += tile.level;
  }

  return {
    min,
    max,
    average: tiles.length > 0 ? total / tiles.length : undefined,
    histogram,
  };
}

function pruneOverlappingTerrainEntries(entries: TerrainSurfaceMeshEntry[]): TerrainSurfaceMeshEntry[] {
  const selected: TerrainSurfaceMeshEntry[] = [];

  for (const entry of entries.sort((a, b) => a.tile.level - b.tile.level || a.tile.y - b.tile.y || a.tile.x - b.tile.x)) {
    if (selected.some((selectedEntry) => isTerrainDescendantOf(entry.tile, selectedEntry.tile))) {
      continue;
    }

    selected.push(entry);
  }

  return selected;
}

function isTerrainDescendantOf(tile: TerrainTileKey, parent: TerrainTileKey): boolean {
  if (tile.level <= parent.level) {
    return false;
  }

  const factor = 2 ** (tile.level - parent.level);
  return Math.floor(tile.x / factor) === parent.x && Math.floor(tile.y / factor) === parent.y;
}
