import { type RectangleRadians } from "./web-mercator-tiling";

export type TileMatrixSetId = string;

export type TileMatrixSetExtent = RectangleRadians;

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
  extent: TileMatrixSetExtent;
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

  return createTileMatrixSetDescriptor({
    id: "WebMercatorQuad",
    crs: "EPSG:3857",
    extent: {
      west: -Math.PI,
      south: -maxWebMercatorLatitude,
      east: Math.PI,
      north: maxWebMercatorLatitude,
    },
    matrices,
  });
}

export function createTileMatrixSetDescriptor(descriptor: TileMatrixSetDescriptor): TileMatrixSetDescriptor {
  validateTileMatrixSet(descriptor);

  return {
    ...descriptor,
    extent: { ...descriptor.extent },
    matrices: descriptor.matrices.map((matrix) => ({ ...matrix })).sort((a, b) => a.level - b.level),
  };
}

export function tileMatrixAtLevel(matrixSet: TileMatrixSetDescriptor, level: number): TileMatrixDescriptor | undefined {
  return matrixSet.matrices.find((matrix) => matrix.level === level);
}

export function minTileMatrixLevel(matrixSet: TileMatrixSetDescriptor): number | undefined {
  return matrixSet.matrices.reduce<number | undefined>(
    (minimum, matrix) => (minimum === undefined ? matrix.level : Math.min(minimum, matrix.level)),
    undefined,
  );
}

export function maxTileMatrixLevel(matrixSet: TileMatrixSetDescriptor): number | undefined {
  return matrixSet.matrices.reduce<number | undefined>(
    (maximum, matrix) => (maximum === undefined ? matrix.level : Math.max(maximum, matrix.level)),
    undefined,
  );
}

function validateTileMatrixSet(matrixSet: TileMatrixSetDescriptor): void {
  if (!matrixSet.id) {
    throw new Error("Invalid TileMatrixSet id");
  }

  if (!matrixSet.crs) {
    throw new Error("Invalid TileMatrixSet CRS");
  }

  if (matrixSet.matrices.length === 0) {
    throw new Error("Invalid TileMatrixSet matrices");
  }

  const levels = new Set<number>();

  for (const matrix of matrixSet.matrices) {
    if (!Number.isInteger(matrix.level) || matrix.level < 0) {
      throw new Error("Invalid TileMatrix level");
    }

    if (levels.has(matrix.level)) {
      throw new Error(`Duplicate TileMatrix level: ${matrix.level}`);
    }

    if (
      !Number.isInteger(matrix.matrixWidth) ||
      !Number.isInteger(matrix.matrixHeight) ||
      !Number.isInteger(matrix.tileWidth) ||
      !Number.isInteger(matrix.tileHeight) ||
      matrix.matrixWidth <= 0 ||
      matrix.matrixHeight <= 0 ||
      matrix.tileWidth <= 0 ||
      matrix.tileHeight <= 0
    ) {
      throw new Error(`Invalid TileMatrix dimensions at level ${matrix.level}`);
    }

    levels.add(matrix.level);
  }
}
