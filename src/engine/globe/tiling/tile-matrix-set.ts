import { type RectangleRadians } from "./web-mercator-tiling";

export type TileMatrixSetId = "WebMercatorQuad";

export type TileMatrixDescriptor = {
  level: number;
  matrixWidth: number;
  matrixHeight: number;
  tileWidth: number;
  tileHeight: number;
};

export type TileMatrixSetDescriptor = {
  id: TileMatrixSetId;
  crs: string;
  extent: RectangleRadians;
  matrices: TileMatrixDescriptor[];
};

const maxWebMercatorLatitude = 85.0511287798066 * (Math.PI / 180);

export function createWebMercatorQuadMatrixSet(maxLevel = 22, tileSize = 256): TileMatrixSetDescriptor {
  const matrices: TileMatrixDescriptor[] = [];

  for (let level = 0; level <= maxLevel; level += 1) {
    const count = 2 ** level;
    matrices.push({
      level,
      matrixWidth: count,
      matrixHeight: count,
      tileWidth: tileSize,
      tileHeight: tileSize,
    });
  }

  return {
    id: "WebMercatorQuad",
    crs: "EPSG:3857",
    extent: {
      west: -Math.PI,
      south: -maxWebMercatorLatitude,
      east: Math.PI,
      north: maxWebMercatorLatitude,
    },
    matrices,
  };
}

export function tileMatrixAtLevel(matrixSet: TileMatrixSetDescriptor, level: number): TileMatrixDescriptor | undefined {
  return matrixSet.matrices.find((matrix) => matrix.level === level);
}
