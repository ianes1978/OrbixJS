import { type TileCoordinate } from "../tiling/web-mercator-tiling";

export type RasterTileProvider = {
  readonly tileSize: number;
  readonly cacheSize: number;
  loadTile(tile: TileCoordinate): Promise<HTMLImageElement>;
};
