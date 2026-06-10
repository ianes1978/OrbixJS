export type TerrainTileKey = {
  level: number;
  x: number;
  y: number;
};

export type TerrainHeightmapTile = TerrainTileKey & {
  width: number;
  height: number;
  heights: Float32Array;
  minHeight: number;
  maxHeight: number;
};

export interface TerrainProvider {
  readonly attribution?: string;
  readonly minLevel?: number;
  readonly maxNativeLevel?: number;
  isTileAvailable?(key: TerrainTileKey): boolean;
  getTile(key: TerrainTileKey, signal?: AbortSignal): Promise<TerrainHeightmapTile>;
  sampleHeight?(lon: number, lat: number): number | undefined;
}

export function createTerrainTileId({ level, x, y }: TerrainTileKey): string {
  return `${level}/${x}/${y}`;
}

export function createFlatTerrainTile(key: TerrainTileKey, options: { size?: number; height?: number } = {}): TerrainHeightmapTile {
  const size = options.size ?? 2;
  const height = options.height ?? 0;

  return {
    ...key,
    width: size,
    height: size,
    heights: new Float32Array(size * size).fill(height),
    minHeight: height,
    maxHeight: height,
  };
}

export function createFlatTerrainProvider(height = 0): TerrainProvider {
  return {
    attribution: "Flat terrain",
    minLevel: 0,
    maxNativeLevel: 0,
    getTile: async (key) => createFlatTerrainTile(key, { height }),
    sampleHeight: () => height,
  };
}
