import { type TileCoordinate } from "../tiling/web-mercator-tiling";

export type QuadtreeTile = TileCoordinate & {
  id: string;
};

export function createQuadtreeTile(x: number, y: number, z: number): QuadtreeTile {
  return {
    x,
    y,
    z,
    id: tileId({ x, y, z }),
  };
}

export function tileId({ x, y, z }: TileCoordinate): string {
  return `${z}/${x}/${y}`;
}
