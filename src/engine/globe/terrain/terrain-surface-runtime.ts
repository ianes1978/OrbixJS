import { createTerrainMesh, type TerrainMesh, type TerrainMeshOptions } from "./terrain-mesh";
import { TerrainTileSelector, type TerrainTileSelectorContext, type TerrainTileSelectorOptions } from "./terrain-tile-selector";
import { createTerrainTileId, type TerrainProvider, type TerrainTileKey } from "./terrain-provider";

export type TerrainSurfaceMeshEntry = {
  tile: TerrainTileKey;
  id: string;
  mesh: TerrainMesh;
};

export type TerrainSurfaceTileState = "none" | "loading" | "ready" | "error";

export type TerrainSurfaceStats = {
  level: number;
  activeTiles: number;
  loadedTiles: number;
  pendingTiles: number;
  meshCacheSize: number;
};

export type TerrainSurfaceRuntimeOptions = {
  provider: TerrainProvider;
  selector?: TerrainTileSelector;
  selectorOptions?: TerrainTileSelectorOptions;
  meshOptions?: TerrainMeshOptions;
  maxMeshes?: number;
  maxPending?: number;
  onError?: (error: unknown) => void;
};

export class TerrainSurfaceRuntime {
  private readonly selector: TerrainTileSelector;
  private readonly maxMeshes: number;
  private readonly maxPending: number;
  private readonly meshCache = new Map<string, TerrainSurfaceMeshEntry>();
  private readonly pending = new Map<string, Promise<TerrainSurfaceMeshEntry>>();
  private readonly errors = new Set<string>();
  private activeTileIds = new Set<string>();
  private activeTilesById = new Map<string, TerrainTileKey>();
  private lastStats: TerrainSurfaceStats = {
    level: 0,
    activeTiles: 0,
    loadedTiles: 0,
    pendingTiles: 0,
    meshCacheSize: 0,
  };

  constructor(private readonly options: TerrainSurfaceRuntimeOptions) {
    this.selector = options.selector ?? new TerrainTileSelector(options.selectorOptions);
    this.maxMeshes = options.maxMeshes ?? 512;
    this.maxPending = options.maxPending ?? 16;
  }

  update(lon: number, lat: number, cameraDistance: number, context: TerrainTileSelectorContext = {}): TerrainSurfaceStats {
    const selection = this.selector.select(lon, lat, cameraDistance, context);
    const availableTiles = selection.tiles.filter((tile) => this.options.provider.isTileAvailable?.(tile) ?? true);
    const maxPending = Math.max(1, context.requestBudget ?? this.maxPending);
    this.activeTileIds = new Set(availableTiles.map((tile) => tile.id));
    this.activeTilesById = new Map(availableTiles.map((tile) => [tile.id, tile]));

    for (const tile of availableTiles) {
      if (this.pending.size >= maxPending) {
        break;
      }

      this.ensureMesh(tile);
    }

    this.trimMeshCache();
    this.lastStats = {
      level: selection.level,
      activeTiles: availableTiles.length,
      loadedTiles: this.readyMeshes().length,
      pendingTiles: countActivePending(this.pending, this.activeTileIds),
      meshCacheSize: this.meshCache.size,
    };

    return this.lastStats;
  }

  stats(): TerrainSurfaceStats {
    return { ...this.lastStats };
  }

  readyMeshes(): TerrainSurfaceMeshEntry[] {
    return [...this.activeTileIds]
      .map((id) => this.meshCache.get(id))
      .filter((entry): entry is TerrainSurfaceMeshEntry => entry !== undefined);
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
    await Promise.allSettled(this.pending.values());
  }

  private ensureMesh(tile: TerrainTileKey): void {
    const id = createTerrainTileId(tile);

    if (this.meshCache.has(id) || this.pending.has(id)) {
      return;
    }

    if (this.errors.has(id)) {
      return;
    }

    const request = this.options.provider
      .getTile(tile)
      .then((heightmap) => {
        const entry = {
          tile,
          id,
          mesh: createTerrainMesh(heightmap, this.options.meshOptions),
        };

        this.meshCache.set(id, entry);
        this.errors.delete(id);
        this.trimMeshCache();
        return entry;
      })
      .catch((error: unknown) => {
        this.errors.add(id);
        this.options.onError?.(error);
        throw error;
      })
      .finally(() => {
        this.pending.delete(id);
      });

    this.pending.set(id, request);
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
}

function countActivePending(pending: ReadonlyMap<string, Promise<TerrainSurfaceMeshEntry>>, activeTileIds: ReadonlySet<string>): number {
  let count = 0;

  for (const id of pending.keys()) {
    if (activeTileIds.has(id)) {
      count += 1;
    }
  }

  return count;
}
