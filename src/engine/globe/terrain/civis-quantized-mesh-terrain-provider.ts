import { WebMercatorTilingScheme, type RectangleRadians } from "../tiling/web-mercator-tiling";
import { tileSampleToCartographic } from "./terrain-mesh";
import { createTerrainTileId, type TerrainHeightmapTile, type TerrainProvider, type TerrainTileKey } from "./terrain-provider";

export type CivisQuantizedMeshLayer = {
  format: "quantized-mesh-1.0";
  projection: "EPSG:4326";
  scheme: "tms";
  version: string;
  tiles: string[];
  bounds: [number, number, number, number];
  available: CivisAvailabilityLevel[];
  attribution?: string;
};

export type CivisAvailabilityLevel = {
  startX: number;
  endX: number;
  startY: number;
  endY: number;
}[];

export type CivisQuantizedMeshTerrainProviderOptions = {
  baseUrl?: string;
  fetch?: typeof fetch;
  heightmapSize?: number;
  cacheSize?: number;
  sourceLevelOffset?: number;
};

type DecodedQuantizedMeshTile = {
  minHeight: number;
  maxHeight: number;
  u: Uint16Array;
  v: Uint16Array;
  heights: Float32Array;
  indices: Uint32Array;
};

type RawCivisLayer = {
  format?: unknown;
  projection?: unknown;
  scheme?: unknown;
  version?: unknown;
  tiles?: unknown;
  bounds?: unknown;
  available?: unknown;
  attribution?: unknown;
};

const quantizedMeshMax = 32767;
const defaultFetch: typeof fetch = (input, init) => fetch(input, init);

export async function loadCivisQuantizedMeshLayer(
  url: string,
  fetchImpl: typeof fetch = defaultFetch,
): Promise<CivisQuantizedMeshLayer> {
  const response = await fetchImpl(url);

  if (!response.ok) {
    throw new Error(`Unable to load CIVIS quantized mesh layer: ${response.status}`);
  }

  return parseCivisQuantizedMeshLayer(await response.json());
}

export function parseCivisQuantizedMeshLayer(json: unknown): CivisQuantizedMeshLayer {
  const layer = expectObject<RawCivisLayer>(json, "civisQuantizedMeshLayer");
  const format = expectString(layer.format, "civisQuantizedMeshLayer.format");
  const projection = expectString(layer.projection, "civisQuantizedMeshLayer.projection");
  const scheme = expectString(layer.scheme, "civisQuantizedMeshLayer.scheme");

  if (format !== "quantized-mesh-1.0") {
    throw new Error(`Unsupported CIVIS terrain format: ${format}`);
  }

  if (projection !== "EPSG:4326") {
    throw new Error(`Unsupported CIVIS terrain projection: ${projection}`);
  }

  if (scheme !== "tms") {
    throw new Error(`Unsupported CIVIS terrain scheme: ${scheme}`);
  }

  return {
    format,
    projection,
    scheme,
    version: expectString(layer.version, "civisQuantizedMeshLayer.version"),
    tiles: parseTiles(layer.tiles),
    bounds: parseBounds(layer.bounds),
    available: parseAvailable(layer.available),
    attribution: optionalString(layer.attribution, "civisQuantizedMeshLayer.attribution"),
  };
}

export function createCivisQuantizedMeshTerrainProvider(
  layer: CivisQuantizedMeshLayer,
  options: CivisQuantizedMeshTerrainProviderOptions = {},
): TerrainProvider {
  return new CivisQuantizedMeshTerrainProvider(layer, options);
}

class CivisQuantizedMeshTerrainProvider implements TerrainProvider {
  readonly attribution: string | undefined;
  readonly minLevel = 0;
  readonly maxNativeLevel: number;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string | undefined;
  private readonly heightmapSize: number;
  private readonly cacheSize: number;
  private readonly sourceLevelOffset: number;
  private readonly tiling = new WebMercatorTilingScheme();
  private readonly sourceCache = new Map<string, DecodedQuantizedMeshTile>();
  private readonly pendingSourceTiles = new Map<string, Promise<DecodedQuantizedMeshTile | undefined>>();

  constructor(
    private readonly layer: CivisQuantizedMeshLayer,
    options: CivisQuantizedMeshTerrainProviderOptions,
  ) {
    this.attribution = layer.attribution;
    this.fetchImpl = options.fetch ?? defaultFetch;
    this.baseUrl = options.baseUrl;
    this.heightmapSize = options.heightmapSize ?? 33;
    this.cacheSize = options.cacheSize ?? 512;
    this.sourceLevelOffset = options.sourceLevelOffset ?? 0;
    this.maxNativeLevel = Math.max(0, layer.available.length - 1 - this.sourceLevelOffset);
  }

  isTileAvailable(key: TerrainTileKey): boolean {
    const rectangle = this.tiling.tileXYToRectangle({ z: key.level, x: key.x, y: key.y });

    return rectangleIntersectsLayerBounds(rectangle, this.layer.bounds) && this.tileHasAvailableSamples(key, rectangle);
  }

  async getTile(key: TerrainTileKey, signal?: AbortSignal): Promise<TerrainHeightmapTile> {
    const heights = new Float32Array(this.heightmapSize * this.heightmapSize);
    let minHeight = Number.POSITIVE_INFINITY;
    let maxHeight = Number.NEGATIVE_INFINITY;
    const samples = await this.collectSamples(key, signal);

    if (samples.length === 0) {
      throw new Error(`No available CIVIS terrain source samples for tile ${createTerrainTileId(key)}`);
    }

    for (let row = 0; row < this.heightmapSize; row += 1) {
      const v = this.heightmapSize === 1 ? 0 : row / (this.heightmapSize - 1);

      for (let column = 0; column < this.heightmapSize; column += 1) {
        const u = this.heightmapSize === 1 ? 0 : column / (this.heightmapSize - 1);
        const index = row * this.heightmapSize + column;
        const { lon, lat } = tileSampleToCartographic(
          { ...key, width: this.heightmapSize, height: this.heightmapSize, heights, minHeight: 0, maxHeight: 0 },
          u,
          v,
        );
        const height = sampleCollectedHeight(samples, lon, lat);

        heights[index] = height;
        minHeight = Math.min(minHeight, height);
        maxHeight = Math.max(maxHeight, height);
      }
    }

    return {
      ...key,
      width: this.heightmapSize,
      height: this.heightmapSize,
      heights,
      minHeight,
      maxHeight,
    };
  }

  private tileHasAvailableSamples(key: TerrainTileKey, rectangle: RectangleRadians): boolean {
    const sourceLevel = clamp(key.level + this.sourceLevelOffset, 0, this.layer.available.length - 1);
    const samples: [number, number][] = [
      [rectangle.west, rectangle.south],
      [(rectangle.west + rectangle.east) * 0.5, rectangle.south],
      [rectangle.east, rectangle.south],
      [rectangle.west, (rectangle.south + rectangle.north) * 0.5],
      [(rectangle.west + rectangle.east) * 0.5, (rectangle.south + rectangle.north) * 0.5],
      [rectangle.east, (rectangle.south + rectangle.north) * 0.5],
      [rectangle.west, rectangle.north],
      [(rectangle.west + rectangle.east) * 0.5, rectangle.north],
      [rectangle.east, rectangle.north],
    ];

    return samples.some(([lon, lat]) => this.availableSourceTileFor(lon, lat, sourceLevel) !== undefined);
  }

  sampleHeight(lon: number, lat: number): number | undefined {
    const candidates = [...this.sourceCache.entries()]
      .map(([id, mesh]) => {
        const key = parseGeographicTileId(id);

        return key ? { key, mesh, rectangle: geographicTileRectangle(key) } : undefined;
      })
      .filter((sample): sample is SourceSampleTile => sample !== undefined)
      .filter((sample) => lon >= sample.rectangle.west && lon <= sample.rectangle.east && lat >= sample.rectangle.south && lat <= sample.rectangle.north)
      .sort((a, b) => b.key.level - a.key.level);

    const sample = candidates[0];

    if (!sample) {
      return undefined;
    }

    return sampleQuantizedMeshHeight(
      sample.mesh,
      normalizedInRange(lon, sample.rectangle.west, sample.rectangle.east),
      normalizedInRange(lat, sample.rectangle.south, sample.rectangle.north),
    );
  }

  private async collectSamples(key: TerrainTileKey, signal?: AbortSignal): Promise<SourceSampleTile[]> {
    const level = clamp(key.level + this.sourceLevelOffset, 0, this.layer.available.length - 1);
    const sourceKeys = new Map<string, GeographicTileKey>();

    for (let row = 0; row < this.heightmapSize; row += 1) {
      const v = this.heightmapSize === 1 ? 0 : row / (this.heightmapSize - 1);

      for (let column = 0; column < this.heightmapSize; column += 1) {
        const u = this.heightmapSize === 1 ? 0 : column / (this.heightmapSize - 1);
        const { lon, lat } = tileSampleToCartographic(
          { ...key, width: this.heightmapSize, height: this.heightmapSize, heights: new Float32Array(0), minHeight: 0, maxHeight: 0 },
          u,
          v,
        );
        const sourceKey = this.availableSourceTileFor(lon, lat, level);

        if (sourceKey) {
          sourceKeys.set(geographicTileId(sourceKey), sourceKey);
        }
      }
    }

    const tiles = await Promise.all([...sourceKeys.values()].map((sourceKey) => this.fetchSourceTile(sourceKey, signal)));

    return tiles.filter((tile): tile is SourceSampleTile => tile !== undefined);
  }

  private availableSourceTileFor(lon: number, lat: number, preferredLevel: number): GeographicTileKey | undefined {
    if (!withinBounds(this.layer.bounds, lon, lat)) {
      return undefined;
    }

    for (let level = preferredLevel; level >= 0; level -= 1) {
      const key = geographicTileForPosition(lon, lat, level);

      if (isAvailable(this.layer.available[level], key)) {
        return key;
      }
    }

    return undefined;
  }

  private async fetchSourceTile(key: GeographicTileKey, signal?: AbortSignal): Promise<SourceSampleTile | undefined> {
    const id = geographicTileId(key);
    const cached = this.sourceCache.get(id);

    if (cached) {
      return { key, mesh: cached, rectangle: geographicTileRectangle(key) };
    }

    const pending = this.pendingSourceTiles.get(id);

    if (pending) {
      const mesh = await pending;
      return mesh ? { key, mesh, rectangle: geographicTileRectangle(key) } : undefined;
    }

    const request = this.fetchSourceTileMesh(key, signal).finally(() => {
      this.pendingSourceTiles.delete(id);
    });

    this.pendingSourceTiles.set(id, request);
    const mesh = await request;

    return mesh ? { key, mesh, rectangle: geographicTileRectangle(key) } : undefined;
  }

  private async fetchSourceTileMesh(key: GeographicTileKey, signal?: AbortSignal): Promise<DecodedQuantizedMeshTile | undefined> {
    const response = await this.fetchImpl(this.tileUrl(key), { signal });

    if (!response.ok) {
      return undefined;
    }

    const mesh = decodeQuantizedMesh(await response.arrayBuffer());

    this.sourceCache.set(geographicTileId(key), mesh);
    this.trimCache();
    return mesh;
  }

  private tileUrl(key: GeographicTileKey): string {
    const template = this.layer.tiles[0] ?? "{z}/{x}/{y}.terrain?v={version}";
    const relative = template
      .replaceAll("{z}", String(key.level))
      .replaceAll("{x}", String(key.x))
      .replaceAll("{y}", String(key.y))
      .replaceAll("{version}", this.layer.version);

    return this.baseUrl ? new URL(relative, this.baseUrl).toString() : relative;
  }

  private trimCache(): void {
    while (this.sourceCache.size > this.cacheSize) {
      const first = this.sourceCache.keys().next().value;

      if (!first) {
        return;
      }

      this.sourceCache.delete(first);
    }
  }
}

type GeographicTileKey = {
  level: number;
  x: number;
  y: number;
};

type SourceSampleTile = {
  key: GeographicTileKey;
  mesh: DecodedQuantizedMeshTile;
  rectangle: GeographicRectangle;
};

type GeographicRectangle = {
  west: number;
  south: number;
  east: number;
  north: number;
};

function decodeQuantizedMesh(buffer: ArrayBuffer): DecodedQuantizedMeshTile {
  const view = new DataView(buffer);
  let offset = 0;

  offset += 24;
  const minHeight = view.getFloat32(offset, true);
  offset += 4;
  const maxHeight = view.getFloat32(offset, true);
  offset += 4;
  offset += 56;

  const vertexCount = view.getUint32(offset, true);
  offset += 4;
  const u = decodeVertexBuffer(view, offset, vertexCount);
  offset += vertexCount * 2;
  const v = decodeVertexBuffer(view, offset, vertexCount);
  offset += vertexCount * 2;
  const quantizedHeights = decodeVertexBuffer(view, offset, vertexCount);
  offset += vertexCount * 2;
  const indices = decodeTriangleIndices(view, offset, vertexCount);
  const heights = new Float32Array(vertexCount);

  for (let index = 0; index < vertexCount; index += 1) {
    heights[index] = minHeight + (quantizedHeights[index] / quantizedMeshMax) * (maxHeight - minHeight);
  }

  return { minHeight, maxHeight, u, v, heights, indices };
}

function decodeVertexBuffer(view: DataView, offset: number, count: number): Uint16Array {
  const values = new Uint16Array(count);
  let accumulator = 0;

  for (let index = 0; index < count; index += 1) {
    accumulator += zigZagDecode(view.getUint16(offset + index * 2, true));
    values[index] = clamp(accumulator, 0, quantizedMeshMax);
  }

  return values;
}

function sampleCollectedHeight(samples: readonly SourceSampleTile[], lon: number, lat: number): number {
  for (const sample of samples) {
    if (lon < sample.rectangle.west || lon > sample.rectangle.east || lat < sample.rectangle.south || lat > sample.rectangle.north) {
      continue;
    }

    return sampleQuantizedMeshHeight(
      sample.mesh,
      normalizedInRange(lon, sample.rectangle.west, sample.rectangle.east),
      normalizedInRange(lat, sample.rectangle.south, sample.rectangle.north),
    );
  }

  return 0;
}

function sampleQuantizedMeshHeight(mesh: DecodedQuantizedMeshTile, u: number, v: number): number {
  const triangulatedHeight = sampleTriangleHeight(mesh, u, v);

  if (triangulatedHeight !== undefined) {
    return triangulatedHeight;
  }

  let weightedHeight = 0;
  let weightTotal = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  let nearestHeight = 0;

  for (let index = 0; index < mesh.heights.length; index += 1) {
    const du = mesh.u[index] / quantizedMeshMax - u;
    const dv = mesh.v[index] / quantizedMeshMax - v;
    const distanceSquared = du * du + dv * dv;

    if (distanceSquared < nearestDistance) {
      nearestDistance = distanceSquared;
      nearestHeight = mesh.heights[index];
    }

    if (distanceSquared > 0.015) {
      continue;
    }

    const weight = 1 / Math.max(distanceSquared, 0.000001);
    weightedHeight += mesh.heights[index] * weight;
    weightTotal += weight;
  }

  return weightTotal > 0 ? weightedHeight / weightTotal : nearestHeight;
}

function sampleTriangleHeight(mesh: DecodedQuantizedMeshTile, u: number, v: number): number | undefined {
  for (let index = 0; index < mesh.indices.length; index += 3) {
    const a = mesh.indices[index];
    const b = mesh.indices[index + 1];
    const c = mesh.indices[index + 2];

    if (a >= mesh.heights.length || b >= mesh.heights.length || c >= mesh.heights.length) {
      continue;
    }

    const weights = barycentricWeights(
      u,
      v,
      mesh.u[a] / quantizedMeshMax,
      mesh.v[a] / quantizedMeshMax,
      mesh.u[b] / quantizedMeshMax,
      mesh.v[b] / quantizedMeshMax,
      mesh.u[c] / quantizedMeshMax,
      mesh.v[c] / quantizedMeshMax,
    );

    if (!weights) {
      continue;
    }

    return mesh.heights[a] * weights[0] + mesh.heights[b] * weights[1] + mesh.heights[c] * weights[2];
  }

  return undefined;
}

function decodeTriangleIndices(
  view: DataView,
  offset: number,
  vertexCount: number,
): Uint32Array {
  const indexBytes = vertexCount > 65_536 ? 4 : 2;
  const alignedOffset = alignOffset(offset, indexBytes);

  if (alignedOffset + 4 > view.byteLength) {
    return new Uint32Array(0);
  }

  const triangleCount = view.getUint32(alignedOffset, true);
  const indexCount = triangleCount * 3;
  const indicesOffset = alignedOffset + 4;

  if (indicesOffset + indexCount * indexBytes > view.byteLength) {
    return new Uint32Array(0);
  }

  const indices = new Uint32Array(indexCount);
  let highest = 0;

  for (let index = 0; index < indexCount; index += 1) {
    const code =
      indexBytes === 4
        ? view.getUint32(indicesOffset + index * 4, true)
        : view.getUint16(indicesOffset + index * 2, true);

    indices[index] = highest - code;

    if (code === 0) {
      highest += 1;
    }
  }

  return indices;
}

function barycentricWeights(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): [number, number, number] | undefined {
  const v0x = bx - ax;
  const v0y = by - ay;
  const v1x = cx - ax;
  const v1y = cy - ay;
  const v2x = px - ax;
  const v2y = py - ay;
  const denominator = v0x * v1y - v1x * v0y;

  if (Math.abs(denominator) < 1e-12) {
    return undefined;
  }

  const b = (v2x * v1y - v1x * v2y) / denominator;
  const c = (v0x * v2y - v2x * v0y) / denominator;
  const a = 1 - b - c;
  const epsilon = 1e-5;

  return a >= -epsilon && b >= -epsilon && c >= -epsilon ? [a, b, c] : undefined;
}

function alignOffset(offset: number, bytes: number): number {
  const remainder = offset % bytes;

  return remainder === 0 ? offset : offset + bytes - remainder;
}

function geographicTileForPosition(lon: number, lat: number, level: number): GeographicTileKey {
  const xCount = 2 ** (level + 1);
  const yCount = 2 ** level;

  return {
    level,
    x: clamp(Math.floor(((lon + Math.PI) / (Math.PI * 2)) * xCount), 0, xCount - 1),
    y: clamp(Math.floor(((lat + Math.PI / 2) / Math.PI) * yCount), 0, yCount - 1),
  };
}

function geographicTileRectangle(key: GeographicTileKey): GeographicRectangle {
  const xCount = 2 ** (key.level + 1);
  const yCount = 2 ** key.level;

  return {
    west: (key.x / xCount) * Math.PI * 2 - Math.PI,
    east: ((key.x + 1) / xCount) * Math.PI * 2 - Math.PI,
    south: (key.y / yCount) * Math.PI - Math.PI / 2,
    north: ((key.y + 1) / yCount) * Math.PI - Math.PI / 2,
  };
}

function isAvailable(level: CivisAvailabilityLevel | undefined, key: GeographicTileKey): boolean {
  return Boolean(
    level?.some((range) => key.x >= range.startX && key.x < range.endX && key.y >= range.startY && key.y < range.endY),
  );
}

function withinBounds(bounds: CivisQuantizedMeshLayer["bounds"], lon: number, lat: number): boolean {
  const lonDegrees = lon * (180 / Math.PI);
  const latDegrees = lat * (180 / Math.PI);

  return lonDegrees >= bounds[0] && lonDegrees <= bounds[2] && latDegrees >= bounds[1] && latDegrees <= bounds[3];
}

function rectangleIntersectsLayerBounds(rectangle: RectangleRadians, bounds: CivisQuantizedMeshLayer["bounds"]): boolean {
  const west = bounds[0] * (Math.PI / 180);
  const south = bounds[1] * (Math.PI / 180);
  const east = bounds[2] * (Math.PI / 180);
  const north = bounds[3] * (Math.PI / 180);

  return rectangle.east >= west && rectangle.west <= east && rectangle.north >= south && rectangle.south <= north;
}

function normalizedInRange(value: number, min: number, max: number): number {
  return clamp((value - min) / (max - min), 0, 1);
}

function geographicTileId({ level, x, y }: GeographicTileKey): string {
  return `${level}/${x}/${y}`;
}

function parseGeographicTileId(id: string): GeographicTileKey | undefined {
  const [level, x, y] = id.split("/").map(Number);

  if (![level, x, y].every(Number.isInteger)) {
    return undefined;
  }

  return { level, x, y };
}

function zigZagDecode(value: number): number {
  return (value >> 1) ^ -(value & 1);
}

function parseTiles(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== "string")) {
    throw new Error("Invalid CIVIS terrain tiles");
  }

  return value as string[];
}

function parseBounds(value: unknown): CivisQuantizedMeshLayer["bounds"] {
  if (!Array.isArray(value) || value.length !== 4 || value.some((entry) => typeof entry !== "number" || !Number.isFinite(entry))) {
    throw new Error("Invalid CIVIS terrain bounds");
  }

  return value as CivisQuantizedMeshLayer["bounds"];
}

function parseAvailable(value: unknown): CivisAvailabilityLevel[] {
  if (!Array.isArray(value)) {
    throw new Error("Invalid CIVIS terrain availability");
  }

  return value.map((level, levelIndex) => {
    if (!Array.isArray(level)) {
      throw new Error(`Invalid CIVIS terrain availability level ${levelIndex}`);
    }

    return level.map((range, rangeIndex) => {
      const parsed = expectObject<Record<string, unknown>>(range, `civisQuantizedMeshLayer.available[${levelIndex}][${rangeIndex}]`);

      return {
        startX: expectInteger(parsed.startX, "startX"),
        endX: expectInteger(parsed.endX, "endX"),
        startY: expectInteger(parsed.startY, "startY"),
        endY: expectInteger(parsed.endY, "endY"),
      };
    });
  });
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

function expectInteger(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`Invalid integer at ${path}`);
  }

  return value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
