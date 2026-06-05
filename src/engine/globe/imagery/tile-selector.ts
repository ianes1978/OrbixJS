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

export class CameraTileSelector {
  private readonly tiling = new WebMercatorTilingScheme();

  constructor(private readonly options: CameraTileSelectorOptions = {}) {}

  select(lon: number, lat: number, cameraDistance: number): TileSelection {
    const level = clampLevel(selectLevel(cameraDistance, this.options.maxLevel), this.options);
    const count = this.tiling.tileCount(level);
    const center = this.tiling.positionToTileXY(lon, lat, level);
    const radius = selectRadius(level);
    const tiles: QuadtreeTile[] = [];
    const visited = new Set<string>();

    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const x = modulo(center.x + dx, count);
        const y = clamp(center.y + dy, 0, count - 1);
        const tile = createQuadtreeTile(x, y, level);

        if (!visited.has(tile.id)) {
          visited.add(tile.id);
          tiles.push(tile);
        }
      }
    }

    return { level, tiles };
  }
}

export function clampLevel(level: number, { minLevel = 0, maxLevel = Number.POSITIVE_INFINITY }: CameraTileSelectorOptions = {}): number {
  return Math.min(maxLevel, Math.max(minLevel, level));
}

export function selectLevel(cameraDistance: number, maxLevel = 6): number {
  if (cameraDistance < 1.35 && maxLevel > 6) {
    const highLodStartDistance = 1.35;
    const minimumCameraDistance = 1.08;
    const step = (highLodStartDistance - minimumCameraDistance) / Math.max(1, maxLevel - 5);
    const clampedDistance = Math.max(cameraDistance, minimumCameraDistance);
    const extraLevels = Math.floor((highLodStartDistance - clampedDistance) / step + 1e-9);
    return Math.min(maxLevel, 6 + Math.max(0, extraLevels));
  }

  if (cameraDistance < 1.18) {
    return 6;
  }

  if (cameraDistance < 1.35) {
    return 5;
  }

  if (cameraDistance < 1.8) {
    return 4;
  }

  if (cameraDistance < 3) {
    return 3;
  }

  return 2;
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

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
