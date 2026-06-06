import { WebMercatorTilingScheme } from "../tiling/web-mercator-tiling";
import { createTerrainTileId, type TerrainTileKey } from "./terrain-provider";

export type TerrainQuadtreeTile = TerrainTileKey & {
  id: string;
};

export type TerrainTileSelection = {
  level: number;
  tiles: TerrainQuadtreeTile[];
};

export type TerrainTileSelectorOptions = {
  minLevel?: number;
  maxLevel?: number;
  maxTiles?: number;
};

export type TerrainTileSelectorContext = {
  viewportHeight?: number;
  fov?: number;
  coveragePositions?: readonly (readonly [number, number])[];
  targetLevel?: number;
};

const earthEquatorMetersPerPixelAtLevelZero = 156543.03392804097;
const earthRadiusMeters = 6378137;

export class TerrainTileSelector {
  private readonly tiling = new WebMercatorTilingScheme();

  constructor(private readonly options: TerrainTileSelectorOptions = {}) {}

  select(lon: number, lat: number, cameraDistance: number, context: TerrainTileSelectorContext = {}): TerrainTileSelection {
    const maxTiles = Math.max(1, this.options.maxTiles ?? 512);
    const preferredLevel = clampTerrainLevel(selectTerrainLevel(cameraDistance, this.options.maxLevel, context), this.options);

    for (let level = preferredLevel; level >= (this.options.minLevel ?? 0); level -= 1) {
      const tiles = this.selectAtLevel(lon, lat, level, context);

      if (tiles.length <= maxTiles || level === (this.options.minLevel ?? 0)) {
        return { level, tiles: tiles.slice(0, maxTiles) };
      }
    }

    const fallbackLevel = this.options.minLevel ?? 0;
    return { level: fallbackLevel, tiles: this.selectAtLevel(lon, lat, fallbackLevel, context).slice(0, maxTiles) };
  }

  private selectAtLevel(
    lon: number,
    lat: number,
    level: number,
    context: TerrainTileSelectorContext,
  ): TerrainQuadtreeTile[] {
    const count = this.tiling.tileCount(level);
    const center = this.tiling.positionToTileXY(lon, lat, level);
    const samples = [[lon, lat], ...(context.coveragePositions ?? [])].filter(([sampleLon, sampleLat]) =>
      Number.isFinite(sampleLon) && Number.isFinite(sampleLat),
    );

    if (samples.length === 0) {
      return this.neighborhood(center.x, center.y, level, terrainSelectRadius(level));
    }

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const [sampleLon, sampleLat] of samples) {
      const tile = this.tiling.positionToTileXY(sampleLon, sampleLat, level);
      const unwrappedX = unwrapTileX(tile.x, center.x, count);

      minX = Math.min(minX, unwrappedX);
      maxX = Math.max(maxX, unwrappedX);
      minY = Math.min(minY, tile.y);
      maxY = Math.max(maxY, tile.y);
    }

    if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
      return this.neighborhood(center.x, center.y, level, terrainSelectRadius(level));
    }

    const padding = terrainCoveragePadding(level);
    const tiles: TerrainQuadtreeTile[] = [];
    const visited = new Set<string>();

    for (let y = minY - padding; y <= maxY + padding; y += 1) {
      if (y < 0 || y >= count) {
        continue;
      }

      for (let x = minX - padding; x <= maxX + padding; x += 1) {
        const normalized = createTerrainQuadtreeTile(modulo(x, count), y, level);

        if (!visited.has(normalized.id)) {
          visited.add(normalized.id);
          tiles.push(normalized);
        }
      }
    }

    return tiles;
  }

  private neighborhood(x: number, y: number, level: number, radius: number): TerrainQuadtreeTile[] {
    const count = this.tiling.tileCount(level);
    const tiles: TerrainQuadtreeTile[] = [];

    for (let dy = -radius; dy <= radius; dy += 1) {
      const tileY = y + dy;

      if (tileY < 0 || tileY >= count) {
        continue;
      }

      for (let dx = -radius; dx <= radius; dx += 1) {
        tiles.push(createTerrainQuadtreeTile(modulo(x + dx, count), tileY, level));
      }
    }

    return tiles;
  }
}

export function createTerrainQuadtreeTile(x: number, y: number, level: number): TerrainQuadtreeTile {
  const tile = { level, x, y };

  return {
    ...tile,
    id: createTerrainTileId(tile),
  };
}

export function selectTerrainLevel(
  cameraDistance: number,
  maxLevel = 10,
  { viewportHeight = 900, fov = (45 * Math.PI) / 180, targetLevel }: TerrainTileSelectorContext = {},
): number {
  if (targetLevel !== undefined && Number.isFinite(targetLevel)) {
    return Math.min(maxLevel, Math.max(0, Math.round(targetLevel)));
  }

  const altitudeMeters = Math.max(cameraDistance - 1, 0.5 / earthRadiusMeters) * earthRadiusMeters;
  const visibleMetersPerPixel = (2 * altitudeMeters * Math.tan(fov / 2)) / Math.max(1, viewportHeight);
  const screenSpaceLevel = Math.ceil(Math.log2(earthEquatorMetersPerPixelAtLevelZero / visibleMetersPerPixel));

  return Math.min(maxLevel, Math.max(0, screenSpaceLevel));
}

export function clampTerrainLevel(
  level: number,
  { minLevel = 0, maxLevel = Number.POSITIVE_INFINITY }: TerrainTileSelectorOptions = {},
): number {
  return Math.min(maxLevel, Math.max(minLevel, level));
}

export function terrainSelectRadius(level: number): number {
  if (level <= 2) {
    return 2;
  }

  if (level <= 5) {
    return 3;
  }

  return 4;
}

export function terrainCoveragePadding(level: number): number {
  if (level <= 4) {
    return 1;
  }

  if (level >= 13) {
    return 6;
  }

  if (level >= 10) {
    return 4;
  }

  return 2;
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

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
