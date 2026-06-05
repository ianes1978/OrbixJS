import { TileCache } from "./tile-cache";
import { type TileCoordinate } from "../tiling/web-mercator-tiling";

export type XYZTileProviderOptions = {
  url: string;
  tileSize?: number;
  subdomains?: readonly string[];
  crossOrigin?: "" | "anonymous" | "use-credentials";
};

export class XYZTileProvider {
  readonly tileSize: number;
  private readonly cache = new TileCache<Promise<HTMLImageElement>>(256);

  constructor(private readonly options: XYZTileProviderOptions) {
    this.tileSize = options.tileSize ?? 256;
  }

  buildTileUrl({ x, y, z }: TileCoordinate): string {
    const subdomain = this.options.subdomains?.length
      ? this.options.subdomains[Math.abs(x + y + z) % this.options.subdomains.length]
      : "";

    return this.options.url
      .replaceAll("{s}", subdomain)
      .replaceAll("{x}", String(x))
      .replaceAll("{y}", String(y))
      .replaceAll("{z}", String(z));
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
      image.onerror = () => reject(new Error(`Unable to load tile ${key}`));
      image.src = this.buildTileUrl(tile);
    });

    this.cache.set(key, promise);
    return promise;
  }
}
