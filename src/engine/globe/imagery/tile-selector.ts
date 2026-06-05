import { WebMercatorTilingScheme } from "../tiling/web-mercator-tiling";
import { createQuadtreeTile, type QuadtreeTile } from "./quadtree-tile";

export type TileSelection = {
  level: number;
  tiles: QuadtreeTile[];
};

export type CameraTileSelectorOptions = {
  minLevel?: number;
  maxLevel?: number;
};

export type CameraTileSelectorContext = {
  viewportHeight?: number;
  fov?: number;
  coveragePositions?: readonly (readonly [number, number])[];
  targetLevel?: number;
};

const earthEquatorMetersPerPixelAtLevelZero = 156543.03392804097;
const earthRadiusMeters = 6378137;

export class CameraTileSelector {
  private readonly tiling = new WebMercatorTilingScheme();

  constructor(private readonly options: CameraTileSelectorOptions = {}) {}

  select(lon: number, lat: number, cameraDistance: number, context: CameraTileSelectorContext = {}): TileSelection {
    const level = clampLevel(selectLevel(cameraDistance, this.options.maxLevel, context), this.options);
    const count = this.tiling.tileCount(level);
    const center = this.tiling.positionToTileXY(lon, lat, level);
    const tiles: QuadtreeTile[] = [];
    const visited = new Set<string>();

    const addTile = (x: number, y: number) => {
      const tile = createQuadtreeTile(modulo(x, count), clamp(y, 0, count - 1), level);

      if (!visited.has(tile.id)) {
        visited.add(tile.id);
        tiles.push(tile);
      }
    };

    if (context.coveragePositions && context.coveragePositions.length > 0) {
      const padding = selectCoveragePadding(level);
      const samples = [[lon, lat], ...context.coveragePositions] as const;
      const tileSamples = samples.map(([sampleLon, sampleLat]) => this.tiling.positionToTileXY(sampleLon, sampleLat, level));
      const anchorX = center.x;
      let minX = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;

      for (const sample of tileSamples) {
        const x = unwrapTileX(sample.x, anchorX, count);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, sample.y);
        maxY = Math.max(maxY, sample.y);
      }

      for (let y = minY - padding; y <= maxY + padding; y += 1) {
        for (let x = minX - padding; x <= maxX + padding; x += 1) {
          addTile(x, y);
        }
      }

      return { level, tiles };
    }

    const radius = selectRadius(level);

    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        addTile(center.x + dx, center.y + dy);
      }
    }

    return { level, tiles };
  }
}

export function clampLevel(level: number, { minLevel = 0, maxLevel = Number.POSITIVE_INFINITY }: CameraTileSelectorOptions = {}): number {
  return Math.min(maxLevel, Math.max(minLevel, level));
}

export function selectLevel(
  cameraDistance: number,
  maxLevel = 6,
  { viewportHeight = 900, fov = (45 * Math.PI) / 180, targetLevel }: CameraTileSelectorContext = {},
): number {
  if (targetLevel !== undefined && Number.isFinite(targetLevel)) {
    return Math.min(maxLevel, Math.max(2, Math.round(targetLevel)));
  }

  if (cameraDistance >= 3) {
    return Math.min(maxLevel, 2);
  }

  if (cameraDistance >= 1.8) {
    return Math.min(maxLevel, 3);
  }

  if (cameraDistance >= 1.35) {
    return Math.min(maxLevel, 4);
  }

  const altitudeMeters = Math.max(cameraDistance - 1, 0.0005) * earthRadiusMeters;
  const visibleMetersPerPixel = (2 * altitudeMeters * Math.tan(fov / 2)) / Math.max(1, viewportHeight);
  const screenSpaceLevel = Math.ceil(Math.log2(earthEquatorMetersPerPixelAtLevelZero / visibleMetersPerPixel));

  return Math.min(maxLevel, Math.max(5, screenSpaceLevel));
}

export function selectRadius(level: number): number {
  if (level <= 2) {
    return 3;
  }

  if (level === 3) {
    return 4;
  }

  return 5;
}

export function selectCoveragePadding(level: number): number {
  if (level <= 3) {
    return 1;
  }

  if (level >= 13) {
    return 6;
  }

  if (level >= 11) {
    return 4;
  }

  return 2;
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function unwrapTileX(x: number, anchor: number, count: number): number {
  let unwrapped = x;

  while (unwrapped - anchor > count / 2) {
    unwrapped -= count;
  }

  while (anchor - unwrapped > count / 2) {
    unwrapped += count;
  }

  return unwrapped;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
