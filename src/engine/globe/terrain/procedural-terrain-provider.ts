import { WebMercatorTilingScheme } from "../tiling/web-mercator-tiling";
import { type TerrainHeightmapTile, type TerrainProvider, type TerrainTileKey } from "./terrain-provider";
import { tileSampleToCartographic } from "./terrain-mesh";

export type ProceduralTerrainProviderOptions = {
  size?: number;
  maxHeight?: number;
};

export function createProceduralTerrainProvider(options: ProceduralTerrainProviderOptions = {}): TerrainProvider {
  const size = options.size ?? 33;
  const maxHeight = options.maxHeight ?? 4200;
  const tiling = new WebMercatorTilingScheme(22, size);

  return {
    attribution: "Synthetic debug relief",
    getTile: async (key) => createProceduralTerrainTile(key, { size, maxHeight, tiling }),
    sampleHeight: (lon, lat) => proceduralTerrainHeight(lon, lat, maxHeight),
  };
}

function createProceduralTerrainTile(
  key: TerrainTileKey,
  options: { size: number; maxHeight: number; tiling: WebMercatorTilingScheme },
): TerrainHeightmapTile {
  const heights = new Float32Array(options.size * options.size);
  let minHeight = Number.POSITIVE_INFINITY;
  let maxHeight = Number.NEGATIVE_INFINITY;

  for (let row = 0; row < options.size; row += 1) {
    const v = options.size === 1 ? 0 : row / (options.size - 1);

    for (let column = 0; column < options.size; column += 1) {
      const u = options.size === 1 ? 0 : column / (options.size - 1);
      const { lon, lat } = tileSampleToCartographic({ ...key, width: options.size, height: options.size, heights, minHeight: 0, maxHeight: 0 }, u, v, options.tiling);
      const height = proceduralTerrainHeight(lon, lat, options.maxHeight);
      const index = row * options.size + column;

      heights[index] = height;
      minHeight = Math.min(minHeight, height);
      maxHeight = Math.max(maxHeight, height);
    }
  }

  return {
    ...key,
    width: options.size,
    height: options.size,
    heights,
    minHeight,
    maxHeight,
  };
}

function proceduralTerrainHeight(lon: number, lat: number, maxHeight: number): number {
  const alps = ridge(lon, lat, 0.18, 0.82, 0.38, 0.09);
  const himalaya = ridge(lon, lat, 1.47, 0.5, 0.55, 0.1);
  const rockies = ridge(lon, lat, -1.9, 0.68, 0.5, 0.13);
  const andes = ridge(lon, lat, -1.2, -0.35, 0.18, 0.75);
  const height = maxHeight * Math.min(1, alps * 0.82 + himalaya + rockies * 0.72 + andes * 0.9);

  return Math.max(0, height);
}

function ridge(lon: number, lat: number, centerLon: number, centerLat: number, lonWidth: number, latWidth: number): number {
  const dLon = angularDelta(lon, centerLon) / lonWidth;
  const dLat = (lat - centerLat) / latWidth;

  return Math.exp(-(dLon * dLon + dLat * dLat));
}

function angularDelta(a: number, b: number): number {
  let delta = a - b;

  while (delta > Math.PI) {
    delta -= Math.PI * 2;
  }

  while (delta < -Math.PI) {
    delta += Math.PI * 2;
  }

  return delta;
}
