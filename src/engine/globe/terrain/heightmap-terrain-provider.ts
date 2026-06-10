import { WebMercatorTilingScheme, lonLatToWebMercatorUv } from "../tiling/web-mercator-tiling";
import { createFlatTerrainTile, createTerrainTileId, type TerrainHeightmapTile, type TerrainProvider, type TerrainTileKey } from "./terrain-provider";

export const HEIGHTMAP_TERRAIN_MANIFEST_SCHEMA_VERSION = "0.1";

export type HeightmapEncoding = "float32";
export type HeightmapTileMatrixSet = "WebMercatorQuad";

export type HeightmapTerrainManifest = {
  schemaVersion: typeof HEIGHTMAP_TERRAIN_MANIFEST_SCHEMA_VERSION;
  tileUrlTemplate: string;
  tileSize: number;
  minLevel: number;
  maxLevel: number;
  encoding: HeightmapEncoding;
  tileMatrixSet: HeightmapTileMatrixSet;
  noData?: number | null;
  heightReference?: "ellipsoid" | "orthometric";
  attribution?: string;
};

export type HeightmapTerrainProviderOptions = {
  baseUrl?: string;
  fetch?: typeof fetch;
  cacheSize?: number;
};

type RawHeightmapTerrainManifest = {
  schemaVersion?: unknown;
  tileUrlTemplate?: unknown;
  tileSize?: unknown;
  minLevel?: unknown;
  maxLevel?: unknown;
  encoding?: unknown;
  tileMatrixSet?: unknown;
  noData?: unknown;
  heightReference?: unknown;
  attribution?: unknown;
};

export function parseHeightmapTerrainManifest(json: unknown): HeightmapTerrainManifest {
  const manifest = expectObject<RawHeightmapTerrainManifest>(json, "heightmapTerrainManifest");
  const schemaVersion = expectString(manifest.schemaVersion, "heightmapTerrainManifest.schemaVersion");
  const minLevel = expectNonNegativeInteger(manifest.minLevel, "heightmapTerrainManifest.minLevel");
  const maxLevel = expectNonNegativeInteger(manifest.maxLevel, "heightmapTerrainManifest.maxLevel");

  if (schemaVersion !== HEIGHTMAP_TERRAIN_MANIFEST_SCHEMA_VERSION) {
    throw new Error(`Unsupported HeightmapTerrainManifest schema version: ${schemaVersion}`);
  }

  if (maxLevel < minLevel) {
    throw new Error("Invalid HeightmapTerrainManifest level range");
  }

  return {
    schemaVersion,
    tileUrlTemplate: expectString(manifest.tileUrlTemplate, "heightmapTerrainManifest.tileUrlTemplate"),
    tileSize: expectPositiveInteger(manifest.tileSize, "heightmapTerrainManifest.tileSize"),
    minLevel,
    maxLevel,
    encoding: expectHeightmapEncoding(manifest.encoding, "heightmapTerrainManifest.encoding"),
    tileMatrixSet: expectTileMatrixSet(manifest.tileMatrixSet, "heightmapTerrainManifest.tileMatrixSet"),
    noData: optionalNoData(manifest.noData, "heightmapTerrainManifest.noData"),
    heightReference: optionalHeightReference(manifest.heightReference, "heightmapTerrainManifest.heightReference"),
    attribution: optionalString(manifest.attribution, "heightmapTerrainManifest.attribution"),
  };
}

export async function loadHeightmapTerrainManifest(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<HeightmapTerrainManifest> {
  const response = await fetchImpl(url);

  if (!response.ok) {
    throw new Error(`Unable to load HeightmapTerrainManifest: ${response.status}`);
  }

  return parseHeightmapTerrainManifest(await response.json());
}

export function createHeightmapTerrainProvider(
  manifest: HeightmapTerrainManifest,
  options: HeightmapTerrainProviderOptions = {},
): TerrainProvider {
  return new HeightmapTerrainProvider(manifest, options);
}

class HeightmapTerrainProvider implements TerrainProvider {
  readonly attribution: string | undefined;
  readonly minLevel: number;
  readonly maxNativeLevel: number;
  private readonly tiling: WebMercatorTilingScheme;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string | undefined;
  private readonly cacheSize: number;
  private readonly tileCache = new Map<string, TerrainHeightmapTile>();
  private readonly pendingTiles = new Map<string, Promise<TerrainHeightmapTile>>();

  constructor(
    private readonly manifest: HeightmapTerrainManifest,
    options: HeightmapTerrainProviderOptions,
  ) {
    this.attribution = manifest.attribution;
    this.minLevel = manifest.minLevel;
    this.maxNativeLevel = manifest.maxLevel;
    this.tiling = new WebMercatorTilingScheme(manifest.maxLevel, manifest.tileSize);
    this.fetchImpl = options.fetch ?? fetch;
    this.baseUrl = options.baseUrl;
    this.cacheSize = options.cacheSize ?? 256;
  }

  async getTile(key: TerrainTileKey, signal?: AbortSignal): Promise<TerrainHeightmapTile> {
    this.validateKey(key);

    const id = createTerrainTileId(key);
    const cached = this.tileCache.get(id);

    if (cached) {
      return cached;
    }

    const pending = this.pendingTiles.get(id);

    if (pending) {
      return pending;
    }

    const request = this.fetchTile(key, signal).finally(() => {
      this.pendingTiles.delete(id);
    });

    this.pendingTiles.set(id, request);
    return request;
  }

  isTileAvailable(key: TerrainTileKey): boolean {
    try {
      this.validateKey(key);
      return true;
    } catch {
      return false;
    }
  }

  sampleHeight(lon: number, lat: number): number | undefined {
    const sortedTiles = [...this.tileCache.values()].sort((a, b) => b.level - a.level);

    for (const tile of sortedTiles) {
      const sample = sampleCachedTile(this.tiling, tile, lon, lat, this.manifest.noData);

      if (sample !== undefined) {
        return sample;
      }
    }

    return undefined;
  }

  private async fetchTile(key: TerrainTileKey, signal?: AbortSignal): Promise<TerrainHeightmapTile> {
    const response = await this.fetchImpl(this.tileUrl(key), { signal });

    if (!response.ok) {
      throw new Error(`Unable to load terrain heightmap tile ${createTerrainTileId(key)}: ${response.status}`);
    }

    const tile = decodeFloat32Tile(key, this.manifest.tileSize, await response.arrayBuffer(), this.manifest.noData);

    this.tileCache.set(createTerrainTileId(key), tile);
    this.trimCache();
    return tile;
  }

  private validateKey(key: TerrainTileKey): void {
    if (key.level < this.manifest.minLevel || key.level > this.manifest.maxLevel) {
      throw new Error(`Terrain tile level out of range: ${key.level}`);
    }

    const count = this.tiling.tileCount(key.level);

    if (key.x < 0 || key.y < 0 || key.x >= count || key.y >= count) {
      throw new Error(`Terrain tile coordinates out of range: ${createTerrainTileId(key)}`);
    }
  }

  private tileUrl(key: TerrainTileKey): string {
    const relative = this.manifest.tileUrlTemplate
      .replaceAll("{z}", String(key.level))
      .replaceAll("{x}", String(key.x))
      .replaceAll("{y}", String(key.y));

    return this.baseUrl ? new URL(relative, this.baseUrl).toString() : relative;
  }

  private trimCache(): void {
    while (this.tileCache.size > this.cacheSize) {
      const first = this.tileCache.keys().next().value;

      if (!first) {
        return;
      }

      this.tileCache.delete(first);
    }
  }
}

function decodeFloat32Tile(
  key: TerrainTileKey,
  size: number,
  buffer: ArrayBuffer,
  noData: number | null | undefined,
): TerrainHeightmapTile {
  const expectedBytes = size * size * 4;

  if (buffer.byteLength < expectedBytes) {
    throw new Error(`Invalid terrain heightmap tile byte length: ${buffer.byteLength}`);
  }

  const view = new DataView(buffer);
  const heights = new Float32Array(size * size);
  let minHeight = Number.POSITIVE_INFINITY;
  let maxHeight = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < heights.length; index += 1) {
    const height = view.getFloat32(index * 4, true);

    heights[index] = height;

    if (isUsableHeight(height, noData)) {
      minHeight = Math.min(minHeight, height);
      maxHeight = Math.max(maxHeight, height);
    }
  }

  if (!Number.isFinite(minHeight) || !Number.isFinite(maxHeight)) {
    return createFlatTerrainTile(key, { size, height: 0 });
  }

  return {
    ...key,
    width: size,
    height: size,
    heights,
    minHeight,
    maxHeight,
  };
}

function sampleCachedTile(
  tiling: WebMercatorTilingScheme,
  tile: TerrainHeightmapTile,
  lon: number,
  lat: number,
  noData: number | null | undefined,
): number | undefined {
  const count = tiling.tileCount(tile.level);
  const [globalU, globalV] = lonLatToWebMercatorUv(lon, lat);
  const tileU = globalU * count - tile.x;
  const tileV = globalV * count - tile.y;

  if (tileU < 0 || tileU > 1 || tileV < 0 || tileV > 1) {
    return undefined;
  }

  return bilinearSample(tile, tileU * (tile.width - 1), tileV * (tile.height - 1), noData);
}

function bilinearSample(
  tile: TerrainHeightmapTile,
  x: number,
  y: number,
  noData: number | null | undefined,
): number | undefined {
  const x0 = clamp(Math.floor(x), 0, tile.width - 1);
  const y0 = clamp(Math.floor(y), 0, tile.height - 1);
  const x1 = clamp(x0 + 1, 0, tile.width - 1);
  const y1 = clamp(y0 + 1, 0, tile.height - 1);
  const tx = x - x0;
  const ty = y - y0;
  const samples = [
    { value: tile.heights[y0 * tile.width + x0], weight: (1 - tx) * (1 - ty) },
    { value: tile.heights[y0 * tile.width + x1], weight: tx * (1 - ty) },
    { value: tile.heights[y1 * tile.width + x0], weight: (1 - tx) * ty },
    { value: tile.heights[y1 * tile.width + x1], weight: tx * ty },
  ];
  let weighted = 0;
  let weightTotal = 0;

  for (const sample of samples) {
    if (!isUsableHeight(sample.value, noData) || sample.weight <= 0) {
      continue;
    }

    weighted += sample.value * sample.weight;
    weightTotal += sample.weight;
  }

  return weightTotal > 0 ? weighted / weightTotal : undefined;
}

function isUsableHeight(value: number, noData: number | null | undefined): boolean {
  return Number.isFinite(value) && (noData === undefined || noData === null || value !== noData);
}

function expectHeightmapEncoding(value: unknown, path: string): HeightmapEncoding {
  const encoding = expectString(value, path);

  if (encoding !== "float32") {
    throw new Error(`Unsupported heightmap encoding: ${encoding}`);
  }

  return encoding;
}

function expectTileMatrixSet(value: unknown, path: string): HeightmapTileMatrixSet {
  const matrixSet = expectString(value, path);

  if (matrixSet !== "WebMercatorQuad") {
    throw new Error(`Unsupported heightmap tile matrix set: ${matrixSet}`);
  }

  return matrixSet;
}

function optionalHeightReference(value: unknown, path: string): HeightmapTerrainManifest["heightReference"] {
  if (value === undefined) {
    return undefined;
  }

  const reference = expectString(value, path);

  if (reference !== "ellipsoid" && reference !== "orthometric") {
    throw new Error(`Unsupported height reference: ${reference}`);
  }

  return reference;
}

function optionalNoData(value: unknown, path: string): number | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  return expectNumber(value, path);
}

function expectObject<T extends object>(value: unknown, path: string): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid object at ${path}`);
  }

  return value as T;
}

function expectString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid string at ${path}`);
  }

  return value;
}

function optionalString(value: unknown, path: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return expectString(value, path);
}

function expectNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid number at ${path}`);
  }

  return value;
}

function expectNonNegativeInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid non-negative integer at ${path}`);
  }

  return value;
}

function expectPositiveInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid positive integer at ${path}`);
  }

  return value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
