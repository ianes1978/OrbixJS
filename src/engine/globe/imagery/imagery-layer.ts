import { WebMercatorTilingScheme } from "../tiling/web-mercator-tiling";
import { type CameraTileSelectorContext } from "./tile-selector";
import { createQuadtreeTile, type QuadtreeTile } from "./quadtree-tile";
import { GlobeSurfaceTileProvider } from "./globe-surface-tile-provider";
import { type RasterTileProvider } from "./tile-provider";
import { type CameraTileSelectorOptions } from "./tile-selector";

export type ImageryTexture = {
  image: HTMLCanvasElement;
  loadedTiles: number;
  expectedTiles: number;
};

export type ImageryLayerOptions = {
  onTileReady?: (tile: QuadtreeTile, image: HTMLImageElement) => void;
  onTileError?: (tile: QuadtreeTile, error: unknown) => void;
  minLevel?: number;
  maxLevel?: number;
  maxConcurrentTileLoads?: number;
};

export type ImageryLayerStats = {
  level: number;
  activeTiles: number;
  loadedTiles: number;
  pendingTiles: number;
  renderTiles: number;
  exactRenderTiles: number;
  fallbackRenderTiles: number;
  cacheSize: number;
};

export type ImageryLayerUpdateContext = CameraTileSelectorContext & {
  requestBudget?: number;
};

export class ImageryLayer {
  private readonly tiling = new WebMercatorTilingScheme();
  private readonly surfaceTiles: GlobeSurfaceTileProvider;
  private readonly active = new Set<string>();
  private readonly loaded = new Set<string>();
  private readonly pending = new Set<string>();
  private readonly loadQueue: QuadtreeTile[] = [];
  private activeLoads = 0;
  private currentRequestBudget: number | undefined;

  constructor(
    readonly provider: RasterTileProvider,
    readonly level = 2,
    private readonly options: ImageryLayerOptions = {},
  ) {
    this.surfaceTiles = new GlobeSurfaceTileProvider({ ...layerSelectorOptions(options), baseLevel: level });
  }

  update(lon: number, lat: number, cameraDistance: number, context: ImageryLayerUpdateContext = {}): ImageryLayerStats {
    this.currentRequestBudget = context.requestBudget;
    const selection = this.surfaceTiles.select(lon, lat, cameraDistance, this.loaded, context);
    this.prioritizeTileLoads(selection.requestTiles);

    for (const tile of selection.requestTiles) {
      if (this.loaded.has(tile.id) || this.pending.has(tile.id)) {
        continue;
      }

      this.pending.add(tile.id);
      this.loadQueue.push(tile);
    }

    this.pumpTileLoadQueue();

    if (selection.renderTiles.length > 0) {
      this.active.clear();

      for (const tile of selection.renderTiles) {
        this.active.add(tile.id);
      }
    }

    return {
      level: selection.level,
      activeTiles: selection.requestTiles.length,
      loadedTiles: selection.requestTiles.filter((tile) => this.loaded.has(tile.id)).length,
      pendingTiles: selection.requestTiles.filter((tile) => this.pending.has(tile.id)).length,
      renderTiles: selection.renderTiles.length,
      exactRenderTiles: selection.renderTiles.filter((tile) => tile.state === "exact").length,
      fallbackRenderTiles: selection.renderTiles.filter((tile) => tile.state === "fallback").length,
      cacheSize: this.provider.cacheSize,
    };
  }

  get activeTileIds(): string[] {
    return [...this.active];
  }

  findActiveTile(id: string): QuadtreeTile | undefined {
    const selection = [...this.active];

    if (!selection.includes(id)) {
      return undefined;
    }

    const [z, x, y] = id.split("/").map(Number);

    if ([z, x, y].some((value) => !Number.isFinite(value))) {
      return undefined;
    }

    return { z, x, y, id };
  }

  async createTexture(): Promise<ImageryTexture> {
    const count = this.tiling.tileCount(this.level);
    const size = this.provider.tileSize;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Unable to create imagery canvas");
    }

    canvas.width = count * size;
    canvas.height = count * size;
    context.fillStyle = "#16303a";
    context.fillRect(0, 0, canvas.width, canvas.height);

    const tiles: QuadtreeTile[] = [];

    for (let y = 0; y < count; y += 1) {
      for (let x = 0; x < count; x += 1) {
        tiles.push(createQuadtreeTile(x, y, this.level));
      }
    }

    const results = await Promise.allSettled(
      tiles.map(async (tile) => {
        const image = await this.provider.loadTile(tile);
        context.drawImage(image, tile.x * size, tile.y * size, size, size);
        this.loaded.add(tile.id);
        this.options.onTileReady?.(tile, image);
        return tile;
      }),
    );

    return {
      image: canvas,
      loadedTiles: results.filter((result) => result.status === "fulfilled").length,
      expectedTiles: tiles.length,
    };
  }

  private prioritizeTileLoads(requestTiles: readonly QuadtreeTile[]): void {
    if (this.loadQueue.length === 0) {
      return;
    }

    const requestedIds = new Set(selectionIds(requestTiles));
    const queued = new Map(this.loadQueue.filter((tile) => requestedIds.has(tile.id)).map((tile) => [tile.id, tile]));
    const prioritized: QuadtreeTile[] = [];

    for (const tile of requestTiles) {
      const queuedTile = queued.get(tile.id);

      if (!queuedTile) {
        continue;
      }

      prioritized.push(queuedTile);
      queued.delete(tile.id);
    }

    this.loadQueue.length = 0;
    this.loadQueue.push(...prioritized);
  }

  private pumpTileLoadQueue(): void {
    const configuredMaxConcurrent = this.options.maxConcurrentTileLoads ?? 16;
    const maxConcurrent =
      this.currentRequestBudget === undefined
        ? configuredMaxConcurrent
        : Math.max(1, Math.min(configuredMaxConcurrent, this.currentRequestBudget));

    while (this.activeLoads < maxConcurrent && this.loadQueue.length > 0) {
      const tile = this.loadQueue.shift();

      if (!tile) {
        return;
      }

      if (this.loaded.has(tile.id)) {
        this.pending.delete(tile.id);
        continue;
      }

      this.activeLoads += 1;
      void this.provider
        .loadTile(tile)
        .then((image) => {
          this.loaded.add(tile.id);
          this.options.onTileReady?.(tile, image);
        })
        .catch((error: unknown) => {
          this.options.onTileError?.(tile, error);
        })
        .finally(() => {
          this.pending.delete(tile.id);
          this.activeLoads = Math.max(0, this.activeLoads - 1);
          this.pumpTileLoadQueue();
        });
    }
  }
}

function layerSelectorOptions({ minLevel, maxLevel }: ImageryLayerOptions): CameraTileSelectorOptions {
  return { minLevel, maxLevel };
}

function selectionIds(tiles: readonly QuadtreeTile[]): string[] {
  return tiles.map((tile) => tile.id);
}
