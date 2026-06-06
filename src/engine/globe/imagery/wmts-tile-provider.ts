import { type TileCoordinate } from "../tiling/web-mercator-tiling";
import { TileCache } from "./tile-cache";
import { type RasterTileProvider } from "./tile-provider";

export type WMTSTileProviderOptions = {
  url: string;
  layer: string;
  style?: string;
  tileMatrixSet: string;
  format?: string;
  tileSize?: number;
  cacheSize?: number;
  tileMatrixPrefix?: string;
  crossOrigin?: "" | "anonymous" | "use-credentials";
  extraDimensions?: Record<string, string>;
};

export class WMTSTileProvider implements RasterTileProvider {
  readonly tileSize: number;
  private readonly cache: TileCache<Promise<HTMLImageElement>>;

  constructor(private readonly options: WMTSTileProviderOptions) {
    this.tileSize = options.tileSize ?? 256;
    this.cache = new TileCache<Promise<HTMLImageElement>>(options.cacheSize ?? 4096);
  }

  buildTileUrl(tile: TileCoordinate): string {
    const params: Record<string, string> = {
      Service: "WMTS",
      Request: "GetTile",
      Version: "1.0.0",
      Layer: this.options.layer,
      Style: this.options.style ?? "default",
      Format: this.options.format ?? "image/png",
      TileMatrixSet: this.options.tileMatrixSet,
      TileMatrix: `${this.options.tileMatrixPrefix ?? ""}${tile.z}`,
      TileCol: String(tile.x),
      TileRow: String(tile.y),
      ...this.options.extraDimensions,
    };

    if (this.options.url.includes("{")) {
      return this.options.url.replace(/\{([A-Za-z]+)\}/g, (_, key: string) => {
        const value = params[key];
        return value ? encodeURIComponent(value) : "";
      });
    }

    const separator = this.options.url.includes("?") ? "&" : "?";
    const query = new URLSearchParams(params);
    return `${this.options.url}${separator}${query.toString()}`;
  }

  loadTile(tile: TileCoordinate): Promise<HTMLImageElement> {
    const key = `${tile.z}/${tile.x}/${tile.y}`;
    const cached = this.cache.get(key);

    if (cached) {
      return cached;
    }

    const promise = new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = this.options.crossOrigin ?? "anonymous";
      image.decoding = "async";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Unable to load WMTS tile ${key}`));
      image.src = this.buildTileUrl(tile);
    });

    this.cache.set(key, promise);
    return promise;
  }

  get cacheSize(): number {
    return this.cache.size;
  }
}
