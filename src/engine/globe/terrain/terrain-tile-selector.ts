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
  coverageTiles?: readonly TerrainCoverageTile[];
  maxTiles?: number;
  requestBudget?: number;
  targetLevel?: number;
};

const earthEquatorMetersPerPixelAtLevelZero = 156543.03392804097;
const earthRadiusMeters = 6378137;

type TerrainCoverageTile = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

export class TerrainTileSelector {
  private readonly tiling = new WebMercatorTilingScheme();

  constructor(private readonly options: TerrainTileSelectorOptions = {}) {}

  select(lon: number, lat: number, cameraDistance: number, context: TerrainTileSelectorContext = {}): TerrainTileSelection {
    const maxTiles = Math.max(1, context.maxTiles ?? this.options.maxTiles ?? 512);
    const preferredLevel = clampTerrainLevel(selectTerrainLevel(cameraDistance, this.options.maxLevel, context), this.options);

    if (context.coverageTiles && context.coverageTiles.length > 0) {
      return this.selectionFromCoverageTiles(context.coverageTiles, maxTiles);
    }

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

  private selectionFromCoverageTiles(
    coverageTiles: readonly TerrainCoverageTile[],
    maxTiles: number,
  ): TerrainTileSelection {
    const minLevel = this.options.minLevel ?? 0;
    const normalized = this.normalizeCoverageTilesToLimits(coverageTiles);
    const tiles = coalesceTilesToBudget(normalized, maxTiles, minLevel);

    return {
      level: maxTerrainTileLevel(tiles, minLevel),
      tiles,
    };
  }

  private normalizeCoverageTilesToLimits(coverageTiles: readonly TerrainCoverageTile[]): TerrainQuadtreeTile[] {
    const tiles: TerrainQuadtreeTile[] = [];
    const visited = new Set<string>();

    for (const tile of coverageTiles) {
      for (const normalized of this.normalizeCoverageTileToLimits(tile)) {
        if (visited.has(normalized.id)) {
          continue;
        }

        visited.add(normalized.id);
        tiles.push(normalized);
      }
    }

    return tiles;
  }

  private normalizeCoverageTileToLimits(tile: TerrainCoverageTile): TerrainQuadtreeTile[] {
    if (![tile.x, tile.y, tile.z].every(Number.isFinite)) {
      return [];
    }

    const level = clampTerrainLevel(tile.z, this.options);

    if (level === tile.z) {
      return [createTerrainQuadtreeTile(tile.x, tile.y, level)];
    }

    if (level < tile.z) {
      const factor = 2 ** (tile.z - level);
      return [createTerrainQuadtreeTile(Math.floor(tile.x / factor), Math.floor(tile.y / factor), level)];
    }

    const factor = 2 ** (level - tile.z);
    const startX = tile.x * factor;
    const startY = tile.y * factor;
    const children: TerrainQuadtreeTile[] = [];

    for (let y = startY; y < startY + factor; y += 1) {
      for (let x = startX; x < startX + factor; x += 1) {
        children.push(createTerrainQuadtreeTile(x, y, level));
      }
    }

    return children;
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

function coalesceTilesToBudget(
  inputTiles: readonly TerrainQuadtreeTile[],
  maxTiles: number,
  minLevel: number,
): TerrainQuadtreeTile[] {
  const tiles = new Map(inputTiles.map((tile) => [tile.id, tile]));

  while (tiles.size > maxTiles) {
    const candidate = highestLevelTile(tiles.values());

    if (!candidate || candidate.level <= minLevel) {
      break;
    }

    const parent = createTerrainQuadtreeTile(Math.floor(candidate.x / 2), Math.floor(candidate.y / 2), candidate.level - 1);
    removeTerrainDescendants(tiles, parent);
    tiles.set(parent.id, parent);
  }

  return [...tiles.values()]
    .sort((a, b) => a.level - b.level || a.y - b.y || a.x - b.x)
    .slice(0, maxTiles);
}

function removeTerrainDescendants(tiles: Map<string, TerrainQuadtreeTile>, parent: TerrainQuadtreeTile): void {
  for (const [id, tile] of tiles) {
    if (isTerrainDescendantOf(tile, parent)) {
      tiles.delete(id);
    }
  }
}

function isTerrainDescendantOf(tile: TerrainQuadtreeTile, parent: TerrainQuadtreeTile): boolean {
  if (tile.level <= parent.level) {
    return false;
  }

  const factor = 2 ** (tile.level - parent.level);
  return Math.floor(tile.x / factor) === parent.x && Math.floor(tile.y / factor) === parent.y;
}

function highestLevelTile(tiles: Iterable<TerrainQuadtreeTile>): TerrainQuadtreeTile | undefined {
  let best: TerrainQuadtreeTile | undefined;

  for (const tile of tiles) {
    if (
      !best ||
      tile.level > best.level ||
      (tile.level === best.level && (tile.y > best.y || (tile.y === best.y && tile.x > best.x)))
    ) {
      best = tile;
    }
  }

  return best;
}

function maxTerrainTileLevel(tiles: readonly TerrainQuadtreeTile[], fallbackLevel: number): number {
  return tiles.reduce((level, tile) => Math.max(level, tile.level), tiles.length > 0 ? 0 : fallbackLevel);
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
