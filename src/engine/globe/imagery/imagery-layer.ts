import { WebMercatorTilingScheme } from "../tiling/web-mercator-tiling";
import { XYZTileProvider } from "./xyz-tile-provider";

export type ImageryTexture = {
  image: HTMLCanvasElement;
  loadedTiles: number;
  expectedTiles: number;
};

export class ImageryLayer {
  private readonly tiling = new WebMercatorTilingScheme();

  constructor(
    readonly provider: XYZTileProvider,
    readonly level = 2,
  ) {}

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
