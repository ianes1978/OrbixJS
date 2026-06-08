import { createTerrainTileId, type TerrainTileKey } from "../../globe/terrain/terrain-provider";

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
