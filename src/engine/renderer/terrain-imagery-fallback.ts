import { createTerrainTileId, type TerrainTileKey } from "../globe/terrain/terrain-provider";

export type TerrainImageryFallback = {
  imageryId: string;
  uvScale: readonly [number, number];
  uvOffset: readonly [number, number];
};

export function resolveTerrainImageryFallback(
  terrainTile: TerrainTileKey,
  hasImageryTile: (id: string) => boolean,
): TerrainImageryFallback | undefined {
  for (let level = terrainTile.level; level >= 0; level -= 1) {
    const factor = 2 ** (terrainTile.level - level);
    const imageryTile = {
      level,
      x: Math.floor(terrainTile.x / factor),
      y: Math.floor(terrainTile.y / factor),
    };
    const imageryId = createTerrainTileId(imageryTile);

    if (!hasImageryTile(imageryId)) {
      continue;
    }

    const localX = terrainTile.x - imageryTile.x * factor;
    const localY = terrainTile.y - imageryTile.y * factor;
    const scale = 1 / factor;

    return {
      imageryId,
      uvScale: [scale, scale],
      uvOffset: [localX * scale, localY * scale],
    };
  }

  return undefined;
}

export function parseTerrainImageryTileId(id: string): TerrainTileKey | undefined {
  const [level, x, y] = id.split("/").map(Number);

  if (![level, x, y].every(Number.isFinite)) {
    return undefined;
  }

  return { level, x, y };
}

export function terrainImageryTilesOverlap(terrainTile: TerrainTileKey, imageryTile: TerrainTileKey): boolean {
  if (terrainTile.level === imageryTile.level) {
    return terrainTile.x === imageryTile.x && terrainTile.y === imageryTile.y;
  }

  if (terrainTile.level < imageryTile.level) {
    const factor = 2 ** (imageryTile.level - terrainTile.level);
    return Math.floor(imageryTile.x / factor) === terrainTile.x && Math.floor(imageryTile.y / factor) === terrainTile.y;
  }

  const factor = 2 ** (terrainTile.level - imageryTile.level);
  return Math.floor(terrainTile.x / factor) === imageryTile.x && Math.floor(terrainTile.y / factor) === imageryTile.y;
}

export function terrainTileCanReplaceImageryTile(terrainTile: TerrainTileKey, imageryTile: TerrainTileKey): boolean {
  return terrainTile.level >= imageryTile.level && terrainImageryTilesOverlap(terrainTile, imageryTile);
}
