import { WebMercatorTilingScheme } from "../tiling/web-mercator-tiling";
import { type CameraTileSelectorContext } from "./tile-selector";
import { createQuadtreeTile, type QuadtreeTile } from "./quadtree-tile";
import { GlobeSurfaceTileProvider, type GlobeSurfaceTile } from "./globe-surface-tile-provider";
import { type RasterTileProvider } from "./tile-provider";
import { type CameraTileSelectorOptions } from "./tile-selector";

export type RasterTileImage = HTMLImageElement | HTMLCanvasElement;

export type ImageryTexture = {
  image: HTMLCanvasElement;
  loadedTiles: number;
  expectedTiles: number;
};

export type ImageryLayerOptions = {
  onTileReady?: (tile: QuadtreeTile, image: RasterTileImage) => void;
  onTileError?: (tile: QuadtreeTile, error: unknown) => void;
  minLevel?: number;
  maxLevel?: number;
  maxConcurrentTileLoads?: number;
};

export type ImageryLayerStats = {
  level: number;
  layerMinLevel?: number;
  layerMaxLevel?: number;
  activeTiles: number;
  loadedTiles: number;
  pendingTiles: number;
  errorTiles: number;
  renderTiles: number;
  exactRenderTiles: number;
  fallbackRenderTiles: number;
  requestLevels: TileLevelStats;
  renderLevels: TileLevelStats;
  exactRenderLevels: TileLevelStats;
  fallbackRenderLevels: TileLevelStats;
  errorLevels: TileLevelStats;
  compositeRenderTiles: number;
  compositeDescendants: number;
  compositeMaxLevel?: number;
  compositeCacheSize: number;
  vtFeedbackPages: number;
  vtResidentPages: number;
  vtMissingPages: number;
  vtUnavailablePages: number;
  vtFallbackPages: number;
  vtCompositePages: number;
  vtCompositeChildren: number;
  vtCompositeMaxLevel?: number;
  cacheSize: number;
};

export type TileLevelStats = {
  min?: number;
  max?: number;
  average?: number;
  histogram: Record<number, number>;
};

export type ImageryLayerUpdateContext = CameraTileSelectorContext & {
  requestBudget?: number;
};

export class ImageryLayer {
  private readonly tiling = new WebMercatorTilingScheme();
  private readonly surfaceTiles: GlobeSurfaceTileProvider;
  private readonly active = new Set<string>();
  private readonly loaded = new Set<string>();
  private readonly errors = new Set<string>();
  private readonly sourceImages = new Map<string, RasterTileImage>();
  private readonly compositeImages = new Map<
    string,
    { image: HTMLCanvasElement; descendantCount: number; maxLevel: number; signature: string }
  >();
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
    const selection = this.surfaceTiles.select(lon, lat, cameraDistance, this.loaded, this.errors, context);
    this.prioritizeTileLoads(selection.requestTiles);

    for (const tile of selection.requestTiles) {
      if (this.loaded.has(tile.id) || this.pending.has(tile.id)) {
        continue;
      }

      this.pending.add(tile.id);
      this.loadQueue.push(tile);
    }

    this.pumpTileLoadQueue();
    const renderTiles = this.materializeFallbackRenderTiles(selection.renderTiles);

    this.active.clear();

    for (const tile of renderTiles) {
      this.active.add(tile.id);
    }

    return {
      level: selection.level,
      layerMinLevel: this.options.minLevel,
      layerMaxLevel: this.options.maxLevel,
      activeTiles: selection.requestTiles.length,
      loadedTiles: selection.requestTiles.filter((tile) => this.loaded.has(tile.id)).length,
      pendingTiles: selection.requestTiles.filter((tile) => this.pending.has(tile.id)).length,
      errorTiles: selection.requestTiles.filter((tile) => this.errors.has(tile.id)).length,
      renderTiles: renderTiles.length,
      exactRenderTiles: renderTiles.filter((tile) => tile.state === "exact").length,
      fallbackRenderTiles: renderTiles.filter((tile) => tile.state === "fallback").length,
      requestLevels: summarizeTileLevels(selection.requestTiles),
      renderLevels: summarizeTileLevels(renderTiles),
      exactRenderLevels: summarizeTileLevels(renderTiles.filter((tile) => tile.state === "exact")),
      fallbackRenderLevels: summarizeTileLevels(renderTiles.filter((tile) => tile.state === "fallback")),
      errorLevels: summarizeTileLevels(selection.requestTiles.filter((tile) => this.errors.has(tile.id))),
      compositeRenderTiles: renderTiles.filter((tile) => tile.state === "fallback").length,
      compositeDescendants: renderTiles.reduce((count, tile) => count + fallbackDescendantFactor(tile), 0),
      compositeMaxLevel: maxTileLevel(renderTiles.filter((tile) => tile.state === "fallback")),
      compositeCacheSize: this.compositeImages.size,
      vtFeedbackPages: selection.requestTiles.length,
      vtResidentPages: selection.requestTiles.filter((tile) => this.sourceImages.has(tile.id)).length,
      vtMissingPages: selection.requestTiles.filter((tile) => !this.sourceImages.has(tile.id) && !this.errors.has(tile.id)).length,
      vtUnavailablePages: this.errors.size,
      vtFallbackPages: renderTiles.filter((tile) => tile.state === "fallback").length,
      vtCompositePages: renderTiles.filter((tile) => tile.state === "fallback").length,
      vtCompositeChildren: renderTiles.reduce((count, tile) => count + fallbackDescendantFactor(tile), 0),
      vtCompositeMaxLevel: maxTileLevel(renderTiles.filter((tile) => tile.state === "fallback")),
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
    context.fillStyle = "#ff1818";
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
        this.errors.delete(tile.id);
        this.sourceImages.set(tile.id, image);
        this.options.onTileReady?.(tile, image);
        return tile;
      }),
    );

    context.fillStyle = "rgba(255, 24, 24, 0.72)";
    context.fillRect(0, 0, canvas.width, canvas.height);

    return {
      image: canvas,
      loadedTiles: results.filter((result) => result.status === "fulfilled").length,
      expectedTiles: tiles.length,
    };
  }

  private materializeFallbackRenderTiles(renderTiles: readonly GlobeSurfaceTile[]): GlobeSurfaceTile[] {
    const materialized: GlobeSurfaceTile[] = [];

    for (const tile of renderTiles) {
      if (tile.state === "exact") {
        materialized.push(tile);
        continue;
      }

      const image = this.compositeFallbackImage(tile);

      if (!image) {
        continue;
      }

      this.options.onTileReady?.(tile, image);
      materialized.push(tile);
    }

    return materialized;
  }

  private compositeFallbackImage(tile: GlobeSurfaceTile): HTMLCanvasElement | undefined {
    const cached = this.compositeImages.get(tile.id);
    const signature = `${tile.id}<-${tile.sourceTile.id}`;

    if (cached?.signature === signature) {
      return cached.image;
    }

    const source = this.sourceImages.get(tile.sourceTile.id);

    if (!source || tile.z < tile.sourceTile.z) {
      return undefined;
    }

    const factor = 2 ** (tile.z - tile.sourceTile.z);
    const localX = tile.x - tile.sourceTile.x * factor;
    const localY = tile.y - tile.sourceTile.y * factor;

    if (localX < 0 || localY < 0 || localX >= factor || localY >= factor) {
      return undefined;
    }

    const size = this.provider.tileSize;
    const sourceWidth = source.width || size;
    const sourceHeight = source.height || size;
    const sourceTileWidth = sourceWidth / factor;
    const sourceTileHeight = sourceHeight / factor;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      return undefined;
    }

    canvas.width = size;
    canvas.height = size;
    context.drawImage(
      source,
      localX * sourceTileWidth,
      localY * sourceTileHeight,
      sourceTileWidth,
      sourceTileHeight,
      0,
      0,
      size,
      size,
    );
    this.compositeImages.set(tile.id, {
      image: canvas,
      descendantCount: factor * factor,
      maxLevel: tile.z,
      signature,
    });
    return canvas;
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

      if (this.loaded.has(tile.id) || this.errors.has(tile.id)) {
        this.pending.delete(tile.id);
        continue;
      }

      this.activeLoads += 1;
      void this.provider
        .loadTile(tile)
        .then((image) => {
          this.loaded.add(tile.id);
          this.errors.delete(tile.id);
          this.sourceImages.set(tile.id, image);
          this.options.onTileReady?.(tile, image);
        })
        .catch((error: unknown) => {
          this.errors.add(tile.id);
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

function summarizeTileLevels(tiles: readonly QuadtreeTile[]): TileLevelStats {
  const histogram: Record<number, number> = {};
  let min: number | undefined;
  let max: number | undefined;
  let total = 0;

  for (const tile of tiles) {
    histogram[tile.z] = (histogram[tile.z] ?? 0) + 1;
    min = min === undefined ? tile.z : Math.min(min, tile.z);
    max = max === undefined ? tile.z : Math.max(max, tile.z);
    total += tile.z;
  }

  return {
    min,
    max,
    average: tiles.length > 0 ? total / tiles.length : undefined,
    histogram,
  };
}

function fallbackDescendantFactor(tile: GlobeSurfaceTile): number {
  if (tile.state !== "fallback" || tile.z <= tile.sourceTile.z) {
    return 0;
  }

  return 2 ** (tile.z - tile.sourceTile.z);
}

function maxTileLevel(tiles: readonly QuadtreeTile[]): number | undefined {
  return tiles.reduce<number | undefined>((level, tile) => (level === undefined ? tile.z : Math.max(level, tile.z)), undefined);
}
