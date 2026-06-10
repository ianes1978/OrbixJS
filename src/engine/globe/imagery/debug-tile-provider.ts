import { type TileCoordinate } from "../tiling/web-mercator-tiling";
import { type RasterTileProvider } from "./tile-provider";

export type DebugTileProviderOptions = {
  tileSize?: number;
  cacheSize?: number;
  missingModulo?: number;
};

export class DebugTileProvider implements RasterTileProvider {
  readonly tileSize: number;
  private readonly cache = new Map<string, Promise<HTMLImageElement>>();
  private readonly maxCacheSize: number;
  private readonly missingModulo: number | undefined;

  constructor(options: DebugTileProviderOptions = {}) {
    this.tileSize = options.tileSize ?? 256;
    this.maxCacheSize = options.cacheSize ?? 4096;
    this.missingModulo = options.missingModulo;
  }

  loadTile(tile: TileCoordinate): Promise<HTMLImageElement> {
    const key = `${tile.z}/${tile.x}/${tile.y}`;
    const cached = this.cache.get(key);

    if (cached) {
      return cached;
    }

    const promise = this.shouldSimulateMissing(tile)
      ? Promise.reject(new Error(`Debug missing tile ${key}`))
      : Promise.resolve().then(() => this.createTileCanvas(tile) as unknown as HTMLImageElement);

    this.cache.set(key, promise);
    this.trimCache();
    return promise;
  }

  get cacheSize(): number {
    return this.cache.size;
  }

  private shouldSimulateMissing(tile: TileCoordinate): boolean {
    if (!this.missingModulo || this.missingModulo <= 0 || tile.z <= 2) {
      return false;
    }

    return Math.abs(tile.x * 73_856_093 + tile.y * 19_349_663 + tile.z * 83_492_791) % this.missingModulo === 0;
  }

  private createTileCanvas(tile: TileCoordinate): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    const size = this.tileSize;

    canvas.width = size;
    canvas.height = size;

    if (!context) {
      throw new Error("Unable to create debug tile canvas");
    }

    const hue = Math.abs(tile.x * 37 + tile.y * 71 + tile.z * 19) % 360;
    context.fillStyle = `hsl(${hue}, 76%, 46%)`;
    context.fillRect(0, 0, size, size);
    context.fillStyle = `hsl(${(hue + 44) % 360}, 82%, 58%)`;
    context.fillRect(0, 0, size / 2, size / 2);
    context.fillStyle = `hsl(${(hue + 118) % 360}, 78%, 38%)`;
    context.fillRect(size / 2, size / 2, size / 2, size / 2);

    drawChecker(context, size);
    drawTileFrame(context, size);
    drawTileDiagonals(context, size);
    drawCornerMarkers(context, size);
    drawTileLabel(context, tile, size);

    return canvas;
  }

  private trimCache(): void {
    while (this.cache.size > this.maxCacheSize) {
      const oldest = this.cache.keys().next().value;

      if (!oldest) {
        return;
      }

      this.cache.delete(oldest);
    }
  }
}

function drawChecker(context: CanvasRenderingContext2D, size: number): void {
  const cells = 8;
  const cellSize = size / cells;

  for (let y = 0; y < cells; y += 1) {
    for (let x = 0; x < cells; x += 1) {
      if ((x + y) % 2 === 0) {
        continue;
      }

      context.fillStyle = "rgba(255,255,255,0.18)";
      context.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
    }
  }
}

function drawTileFrame(context: CanvasRenderingContext2D, size: number): void {
  context.lineWidth = Math.max(4, size / 48);
  context.strokeStyle = "#ffffff";
  context.strokeRect(2, 2, size - 4, size - 4);
  context.lineWidth = Math.max(2, size / 96);
  context.strokeStyle = "#000000";
  context.strokeRect(8, 8, size - 16, size - 16);
}

function drawTileDiagonals(context: CanvasRenderingContext2D, size: number): void {
  context.lineWidth = Math.max(2, size / 90);
  context.strokeStyle = "rgba(0,0,0,0.72)";
  context.beginPath();
  context.moveTo(0, 0);
  context.lineTo(size, size);
  context.moveTo(size, 0);
  context.lineTo(0, size);
  context.stroke();
}

function drawCornerMarkers(context: CanvasRenderingContext2D, size: number): void {
  const marker = Math.max(16, size / 8);

  context.fillStyle = "#ff00ff";
  context.fillRect(0, 0, marker, marker);
  context.fillStyle = "#00ffff";
  context.fillRect(size - marker, 0, marker, marker);
  context.fillStyle = "#ffff00";
  context.fillRect(0, size - marker, marker, marker);
  context.fillStyle = "#111111";
  context.fillRect(size - marker, size - marker, marker, marker);
}

function drawTileLabel(context: CanvasRenderingContext2D, tile: TileCoordinate, size: number): void {
  const id = `${tile.z}/${tile.x}/${tile.y}`;
  const fontSize = Math.max(18, Math.round(size / 9));
  const smallFontSize = Math.max(11, Math.round(size / 18));

  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "rgba(0,0,0,0.74)";
  context.fillRect(size * 0.08, size * 0.34, size * 0.84, size * 0.32);
  context.strokeStyle = "rgba(255,255,255,0.9)";
  context.lineWidth = 2;
  context.strokeRect(size * 0.08, size * 0.34, size * 0.84, size * 0.32);
  context.font = `700 ${fontSize}px ui-monospace, SFMono-Regular, Consolas, monospace`;
  context.fillStyle = "#ffffff";
  context.fillText(id, size / 2, size * 0.47);
  context.font = `700 ${smallFontSize}px ui-monospace, SFMono-Regular, Consolas, monospace`;
  context.fillStyle = "#d8fff3";
  context.fillText(`x ${tile.x}   y ${tile.y}   z ${tile.z}`, size / 2, size * 0.59);
}
