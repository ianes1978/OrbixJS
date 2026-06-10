import { type QuadtreeTile } from "../imagery/quadtree-tile";

export type ScreenBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

export function screenBoundsIntersectsViewport(bounds: ScreenBounds, width: number, height: number): boolean {
  const padding = Math.max(96, Math.min(width, height) * 0.18);

  return bounds.maxX >= -padding && bounds.minX <= width + padding && bounds.maxY >= -padding && bounds.minY <= height + padding;
}

export function conservativeViewportBounds(width: number, height: number): ScreenBounds {
  return {
    minX: -width,
    maxX: width * 2,
    minY: -height,
    maxY: height * 2,
  };
}

export function nonOverlappingQuadtreeTiles(tiles: readonly QuadtreeTile[]): QuadtreeTile[] {
  const selected: QuadtreeTile[] = [];
  const unique = new Map(tiles.map((tile) => [tile.id, tile]));

  for (const tile of [...unique.values()].sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x)) {
    if (selected.some((ancestor) => isQuadtreeDescendantOf(tile, ancestor))) {
      continue;
    }

    selected.push(tile);
  }

  return selected;
}

export function isQuadtreeDescendantOf(tile: QuadtreeTile, ancestor: QuadtreeTile): boolean {
  if (tile.z <= ancestor.z) {
    return false;
  }

  const factor = 2 ** (tile.z - ancestor.z);
  return Math.floor(tile.x / factor) === ancestor.x && Math.floor(tile.y / factor) === ancestor.y;
}
