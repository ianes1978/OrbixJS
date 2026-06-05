import { WebMercatorTilingScheme } from "../tiling/web-mercator-tiling";
import { CameraTileSelector } from "./tile-selector";
import { type QuadtreeTile } from "./quadtree-tile";
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
};

export type ImageryLayerStats = {
  level: number;
  activeTiles: number;
  loadedTiles: number;
  pendingTiles: number;
  cacheSize: number;
};

export class ImageryLayer {
  private readonly tiling = new WebMercatorTilingScheme();
  private readonly selector: CameraTileSelector;
  private readonly active = new Set<string>();
  private readonly loaded = new Set<string>();
  private readonly pending = new Set<string>();

  constructor(
    readonly provider: RasterTileProvider,
    readonly level = 2,
    private readonly options: ImageryLayerOptions = {},
  ) {
    this.selector = new CameraTileSelector(layerSelectorOptions(options));
  }

  update(lon: number, lat: number, cameraDistance: number): ImageryLayerStats {
    const selection = this.selector.select(lon, lat, cameraDistance);
    this.active.clear();

    for (const tile of selection.tiles) {
      this.active.add(tile.id);

      if (this.loaded.has(tile.id) || this.pending.has(tile.id)) {
        continue;
      }

      this.pending.add(tile.id);
      void this.provider
        .loadTile(tile)
        .then((image) => {
          this.pending.delete(tile.id);
          this.loaded.add(tile.id);
          this.options.onTileReady?.(tile, image);
        })
        .catch((error: unknown) => {
          this.pending.delete(tile.id);
          this.options.onTileError?.(tile, error);
        });
    }

    return {
      level: selection.level,
      activeTiles: selection.tiles.length,
      loadedTiles: selection.tiles.filter((tile) => this.loaded.has(tile.id)).length,
      pendingTiles: selection.tiles.filter((tile) => this.pending.has(tile.id)).length,
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

    const tiles = [];

    for (let y = 0; y < count; y += 1) {
      for (let x = 0; x < count; x += 1) {
        tiles.push({ x, y, z: this.level });
      }
    }

    const results = await Promise.allSettled(
      tiles.map(async (tile) => {
        const image = await this.provider.loadTile(tile);
        context.drawImage(image, tile.x * size, tile.y * size, size, size);
        return tile;
      }),
    );

    return {
      image: canvas,
      loadedTiles: results.filter((result) => result.status === "fulfilled").length,
      expectedTiles: tiles.length,
    };
  }
}

function layerSelectorOptions({ minLevel, maxLevel }: ImageryLayerOptions): CameraTileSelectorOptions {
  return { minLevel, maxLevel };
}
