import { normalize, type Vec3 } from "../../core/math/vec3";
import { WebMercatorTilingScheme } from "../tiling/web-mercator-tiling";
import { createQuadtreeTile, type QuadtreeTile } from "./quadtree-tile";

export type TileSelection = {
  level: number;
  tiles: QuadtreeTile[];
};

export class CameraTileSelector {
  private readonly tiling = new WebMercatorTilingScheme();

  select(cameraPosition: Vec3, cameraDistance: number): TileSelection {
    const level = selectLevel(cameraDistance);
    const count = this.tiling.tileCount(level);
    const viewDirection = normalize(cameraPosition);
    const lon = Math.atan2(viewDirection[2], viewDirection[0]);
    const lat = Math.asin(viewDirection[1]);
    const center = this.tiling.positionToTileXY(lon, lat, level);
    const radius = level >= 4 ? 2 : 1;
    const tiles: QuadtreeTile[] = [];

    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const x = modulo(center.x + dx, count);
        const y = clamp(center.y + dy, 0, count - 1);
        tiles.push(createQuadtreeTile(x, y, level));
      }
    }

    return { level, tiles };
  }
}

export function selectLevel(cameraDistance: number): number {
  if (cameraDistance < 1.8) {
    return 4;
  }

  if (cameraDistance < 3) {
    return 3;
  }

  return 2;
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
