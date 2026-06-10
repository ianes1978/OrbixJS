import { Ellipsoid } from "../../core/geodesy/ellipsoid";
import { type Ray } from "../../core/math/ray";
import { dot, length, type Vec3 } from "../../core/math/vec3";
import { createQuadtreeTile, type QuadtreeTile } from "../imagery/quadtree-tile";

export type ScreenBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

export type ScreenTileCandidate = {
  tile: QuadtreeTile;
  bounds: ScreenBounds;
  desiredLevel: number;
  priority: number;
};

export type RadianRectangle = {
  west: number;
  south: number;
  east: number;
  north: number;
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

export function screenBoundsDistanceToViewportCenter(bounds: ScreenBounds, width: number, height: number): number {
  const centerX = (bounds.minX + bounds.maxX) * 0.5;
  const centerY = (bounds.minY + bounds.maxY) * 0.5;
  const dx = centerX - width * 0.5;
  const dy = centerY - height * 0.5;

  return dx * dx + dy * dy;
}

export function bestCandidateIndex(candidates: readonly ScreenTileCandidate[]): number {
  let bestIndex = 0;
  let bestPriority = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < candidates.length; index += 1) {
    if (candidates[index].priority > bestPriority) {
      bestPriority = candidates[index].priority;
      bestIndex = index;
    }
  }

  return bestIndex;
}

export function distanceFromCartographicToRectangleMeters(lon: number, lat: number, rectangle: RadianRectangle): number {
  const closestLon = clampRadians(lon, rectangle.west, rectangle.east);
  const closestLat = clampRadians(lat, rectangle.south, rectangle.north);

  return haversineMeters(lon, lat, closestLon, closestLat);
}

function haversineMeters(lonA: number, latA: number, lonB: number, latB: number): number {
  const dLat = latB - latA;
  const dLon = lonB - lonA;
  const sinLat = Math.sin(dLat * 0.5);
  const sinLon = Math.sin(dLon * 0.5);
  const a = sinLat * sinLat + Math.cos(latA) * Math.cos(latB) * sinLon * sinLon;

  return 2 * Ellipsoid.WGS84.maximumRadius * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

function clampRadians(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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

export function mergePriorityCoverageTiles(
  priorityTiles: readonly QuadtreeTile[],
  secondaryTiles: readonly QuadtreeTile[],
  maxTiles: number,
): QuadtreeTile[] {
  const selected: QuadtreeTile[] = [];
  const visited = new Set<string>();
  const priorityMaxLevel = priorityTiles.reduce((level, tile) => Math.max(level, tile.z), 0);
  const addExact = (tile: QuadtreeTile): boolean => {
    if (visited.has(tile.id)) {
      return selected.length < maxTiles;
    }

    selected.push(tile);
    visited.add(tile.id);
    return selected.length < maxTiles;
  };
  const addSecondary = (tile: QuadtreeTile): boolean => {
    if (selected.length >= maxTiles || visited.has(tile.id)) {
      return selected.length < maxTiles;
    }

    const overlap = selected.find((selectedTile) => quadtreeTilesOverlap(tile, selectedTile));

    if (!overlap) {
      return addExact(tile);
    }

    if (tile.z >= overlap.z) {
      return selected.length < maxTiles;
    }

    if (tile.z >= priorityMaxLevel) {
      return selected.length < maxTiles;
    }

    for (const child of quadtreeChildren(tile)) {
      if (!addSecondary(child)) {
        return false;
      }
    }

    return selected.length < maxTiles;
  };

  for (const tile of priorityTiles) {
    if (!selected.some((selectedTile) => quadtreeTilesOverlap(tile, selectedTile)) && !addExact(tile)) {
      return selected;
    }
  }

  for (const tile of secondaryTiles) {
    if (!addSecondary(tile)) {
      return selected;
    }
  }

  return selected;
}

export function mergeOrderedCoverageTiles(tiles: readonly QuadtreeTile[], maxTiles: number): QuadtreeTile[] {
  const selected: QuadtreeTile[] = [];
  const visited = new Set<string>();
  const maxLevel = tiles.reduce((level, tile) => Math.max(level, tile.z), 0);
  const add = (tile: QuadtreeTile): boolean => {
    if (selected.length >= maxTiles || visited.has(tile.id)) {
      return selected.length < maxTiles;
    }

    const overlap = selected.find((selectedTile) => quadtreeTilesOverlap(tile, selectedTile));

    if (!overlap) {
      selected.push(tile);
      visited.add(tile.id);
      return selected.length < maxTiles;
    }

    if (tile.z >= overlap.z || tile.z >= maxLevel) {
      return selected.length < maxTiles;
    }

    for (const child of quadtreeChildren(tile)) {
      if (!add(child)) {
        return false;
      }
    }

    return selected.length < maxTiles;
  };

  for (const tile of tiles) {
    if (!add(tile)) {
      return selected;
    }
  }

  return selected;
}

export function quadtreeChildren(tile: QuadtreeTile): QuadtreeTile[] {
  const childX = tile.x * 2;
  const childY = tile.y * 2;
  const childLevel = tile.z + 1;

  return [
    createQuadtreeTile(childX, childY, childLevel),
    createQuadtreeTile(childX + 1, childY, childLevel),
    createQuadtreeTile(childX, childY + 1, childLevel),
    createQuadtreeTile(childX + 1, childY + 1, childLevel),
  ];
}

export function quadtreeTilesOverlap(a: QuadtreeTile, b: QuadtreeTile): boolean {
  if (a.z === b.z) {
    return a.x === b.x && a.y === b.y;
  }

  return a.z > b.z ? isQuadtreeDescendantOf(a, b) : isQuadtreeDescendantOf(b, a);
}

export function isQuadtreeDescendantOf(tile: QuadtreeTile, ancestor: QuadtreeTile): boolean {
  if (tile.z <= ancestor.z) {
    return false;
  }

  const factor = 2 ** (tile.z - ancestor.z);
  return Math.floor(tile.x / factor) === ancestor.x && Math.floor(tile.y / factor) === ancestor.y;
}

export function cartographicFromClosestRaySurfacePoint(ray: Ray): [number, number, number] | undefined {
  const t = -dot(ray.origin, ray.direction);

  if (!Number.isFinite(t) || t <= 0) {
    return undefined;
  }

  const closest: Vec3 = [
    ray.origin[0] + ray.direction[0] * t,
    ray.origin[1] + ray.direction[1] * t,
    ray.origin[2] + ray.direction[2] * t,
  ];

  if (!closest.every(Number.isFinite) || length(closest) <= 1e-6) {
    return undefined;
  }

  const cartographic = Ellipsoid.WGS84.unitCartesianToCartographic(closest);

  return Number.isFinite(cartographic.lon) && Number.isFinite(cartographic.lat)
    ? [cartographic.lon, cartographic.lat, 0]
    : undefined;
}

export function unwrapTileX(x: number, anchor: number, count: number): number {
  let unwrapped = x;

  while (unwrapped - anchor > count / 2) {
    unwrapped -= count;
  }

  while (anchor - unwrapped > count / 2) {
    unwrapped += count;
  }

  return unwrapped;
}

export function moduloTileX(x: number, count: number): number {
  return ((x % count) + count) % count;
}
