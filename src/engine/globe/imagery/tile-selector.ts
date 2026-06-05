import { WebMercatorTilingScheme } from "../tiling/web-mercator-tiling";
import { createQuadtreeTile, type QuadtreeTile } from "./quadtree-tile";

export type TileSelection = {
  level: number;
  tiles: QuadtreeTile[];
};

export class CameraTileSelector {
  private readonly tiling = new WebMercatorTilingScheme();

  select(lon: number, lat: number, cameraDistance: number): TileSelection {
    const level = selectLevel(cameraDistance);
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

export function selectLevel(cameraDistance: number): number {
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
