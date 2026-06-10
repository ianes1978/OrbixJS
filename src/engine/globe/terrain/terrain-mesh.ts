import { Ellipsoid } from "../../core/geodesy/ellipsoid";
import { cross, dot, normalize, subtract, type MutableVec3, type Vec3 } from "../../core/math/vec3";
import { WebMercatorTilingScheme, webMercatorYToLatitude } from "../tiling/web-mercator-tiling";
import { type TerrainHeightmapTile } from "./terrain-provider";

export type TerrainMesh = {
  positions: Float32Array;
  normals: Float32Array;
  texcoords: Float32Array;
  indices: Uint16Array | Uint32Array;
  minHeight: number;
  maxHeight: number;
  hasSkirt: boolean;
};

export type TerrainMeshOptions = {
  ellipsoid?: Ellipsoid;
  tiling?: WebMercatorTilingScheme;
  exaggeration?: number;
  skirtDepth?: number;
  gridSize?: number;
  gridSizeByLevel?: readonly number[];
};

export function createTerrainMesh(tile: TerrainHeightmapTile, options: TerrainMeshOptions = {}): TerrainMesh {
  if (tile.width < 2 || tile.height < 2) {
    throw new Error("Terrain mesh requires at least a 2x2 heightmap tile");
  }

  const ellipsoid = options.ellipsoid ?? Ellipsoid.WGS84;
  const tiling = options.tiling ?? new WebMercatorTilingScheme(tile.level, tile.width);
  const exaggeration = options.exaggeration ?? 1;
  const skirtDepth = Math.max(0, options.skirtDepth ?? 0);
  const gridSize = terrainGridSizeForLevel(tile.level, options);
  const meshWidth = gridSize === undefined ? tile.width : gridSize + 1;
  const meshHeight = gridSize === undefined ? tile.height : gridSize + 1;
  const baseVertexCount = meshWidth * meshHeight;
  const skirtVertexCount = skirtDepth > 0 ? boundaryVertexCount(meshWidth, meshHeight) : 0;
  const vertexCount = baseVertexCount + skirtVertexCount;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const texcoords = new Float32Array(vertexCount * 2);
  const cartographicSamples = new Array<{ lon: number; lat: number; height: number }>(baseVertexCount);
  let minHeight = Number.isFinite(tile.minHeight) ? tile.minHeight : Number.POSITIVE_INFINITY;
  let maxHeight = Number.isFinite(tile.maxHeight) ? tile.maxHeight : Number.NEGATIVE_INFINITY;

  for (let row = 0; row < meshHeight; row += 1) {
    const v = meshHeight === 1 ? 0 : row / (meshHeight - 1);

    for (let column = 0; column < meshWidth; column += 1) {
      const u = meshWidth === 1 ? 0 : column / (meshWidth - 1);
      const vertexIndex = row * meshWidth + column;
      const height = sampleHeightmap(tile, u, v);
      const { lon, lat } = tileSampleToCartographic(tile, u, v, tiling);
      cartographicSamples[vertexIndex] = { lon, lat, height };
      const normal = ellipsoid.geodeticSurfaceNormal(lon, lat);
      const position = ellipsoid.cartographicToCartesian({
        lon,
        lat,
        height: height * exaggeration,
      });
      const normalizedPosition = [
        position[0] / ellipsoid.maximumRadius,
        position[1] / ellipsoid.maximumRadius,
        position[2] / ellipsoid.maximumRadius,
      ] as const;

      positions.set(normalizedPosition, vertexIndex * 3);
      normals.set(normal, vertexIndex * 3);
      texcoords.set([u, v], vertexIndex * 2);
      minHeight = Math.min(minHeight, height);
      maxHeight = Math.max(maxHeight, height);
    }
  }

  const skirtIndexByBaseVertex = skirtDepth > 0
    ? appendSkirtVertices({
        ellipsoid,
        exaggeration,
        skirtDepth,
        baseVertexCount,
        meshWidth,
        meshHeight,
        cartographicSamples,
        positions,
        normals,
        texcoords,
      })
    : undefined;
  const indices = createTileIndices(meshWidth, meshHeight, vertexCount, skirtIndexByBaseVertex);

  return {
    positions,
    normals,
    texcoords,
    indices: orientIndicesOutward(indices, positions),
    minHeight,
    maxHeight,
    hasSkirt: skirtDepth > 0,
  };
}

export function tileSampleToCartographic(
  tile: TerrainHeightmapTile,
  u: number,
  v: number,
  tiling = new WebMercatorTilingScheme(tile.level, tile.width),
): { lon: number; lat: number } {
  const count = tiling.tileCount(tile.level);
  const globalX = (tile.x + clamp(u, 0, 1)) / count;
  const globalY = (tile.y + clamp(v, 0, 1)) / count;

  return {
    lon: globalX * Math.PI * 2 - Math.PI,
    lat: webMercatorYToLatitude(globalY),
  };
}

function createTileIndices(
  width: number,
  height: number,
  vertexCount: number,
  skirtIndexByBaseVertex: Map<number, number> | undefined,
): Uint16Array | Uint32Array {
  const gridIndexCount = (width - 1) * (height - 1) * 6;
  const skirtIndexCount = skirtIndexByBaseVertex ? ((width - 1) * 2 + (height - 1) * 2) * 6 : 0;
  const IndexArray = vertexCount > 65_535 ? Uint32Array : Uint16Array;
  const indices = new IndexArray(gridIndexCount + skirtIndexCount);
  let offset = writeGridIndices(indices, width, height, 0);

  if (skirtIndexByBaseVertex) {
    offset = writeSkirtEdge(indices, offset, topEdge(width), skirtIndexByBaseVertex);
    offset = writeSkirtEdge(indices, offset, rightEdge(width, height), skirtIndexByBaseVertex);
    offset = writeSkirtEdge(indices, offset, bottomEdge(width, height), skirtIndexByBaseVertex);
    writeSkirtEdge(indices, offset, leftEdge(width, height), skirtIndexByBaseVertex);
  }

  return indices;
}

function writeGridIndices<T extends Uint16Array | Uint32Array>(indices: T, width: number, height: number, offset: number): number {
  for (let row = 0; row < height - 1; row += 1) {
    for (let column = 0; column < width - 1; column += 1) {
      const topLeft = row * width + column;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + width;
      const bottomRight = bottomLeft + 1;

      indices[offset] = topLeft;
      indices[offset + 1] = bottomLeft;
      indices[offset + 2] = topRight;
      indices[offset + 3] = topRight;
      indices[offset + 4] = bottomLeft;
      indices[offset + 5] = bottomRight;
      offset += 6;
    }
  }

  return offset;
}

function appendSkirtVertices({
  ellipsoid,
  exaggeration,
  skirtDepth,
  baseVertexCount,
  meshWidth,
  meshHeight,
  cartographicSamples,
  positions,
  normals,
  texcoords,
}: {
  ellipsoid: Ellipsoid;
  exaggeration: number;
  skirtDepth: number;
  baseVertexCount: number;
  meshWidth: number;
  meshHeight: number;
  cartographicSamples: readonly { lon: number; lat: number; height: number }[];
  positions: Float32Array;
  normals: Float32Array;
  texcoords: Float32Array;
}): Map<number, number> {
  const skirtIndexByBaseVertex = new Map<number, number>();
  let nextVertexIndex = baseVertexCount;

  for (const baseVertexIndex of boundaryBaseVertexIndices(meshWidth, meshHeight)) {
    const sample = cartographicSamples[baseVertexIndex];
    const normal = ellipsoid.geodeticSurfaceNormal(sample.lon, sample.lat);
    const position = ellipsoid.cartographicToCartesian({
      lon: sample.lon,
      lat: sample.lat,
      height: sample.height * exaggeration - skirtDepth,
    });
    const normalizedPosition = [
      position[0] / ellipsoid.maximumRadius,
      position[1] / ellipsoid.maximumRadius,
      position[2] / ellipsoid.maximumRadius,
    ] as const;

    positions.set(normalizedPosition, nextVertexIndex * 3);
    normals.set(normal, nextVertexIndex * 3);
    texcoords.set([texcoords[baseVertexIndex * 2], texcoords[baseVertexIndex * 2 + 1]], nextVertexIndex * 2);
    skirtIndexByBaseVertex.set(baseVertexIndex, nextVertexIndex);
    nextVertexIndex += 1;
  }

  return skirtIndexByBaseVertex;
}

function writeSkirtEdge<T extends Uint16Array | Uint32Array>(
  indices: T,
  offset: number,
  edge: readonly number[],
  skirtIndexByBaseVertex: ReadonlyMap<number, number>,
): number {
  for (let index = 0; index < edge.length - 1; index += 1) {
    const a = edge[index];
    const b = edge[index + 1];
    const skirtA = skirtIndexByBaseVertex.get(a);
    const skirtB = skirtIndexByBaseVertex.get(b);

    if (skirtA === undefined || skirtB === undefined) {
      continue;
    }

    indices[offset] = a;
    indices[offset + 1] = b;
    indices[offset + 2] = skirtA;
    indices[offset + 3] = skirtA;
    indices[offset + 4] = b;
    indices[offset + 5] = skirtB;
    offset += 6;
  }

  return offset;
}

function boundaryVertexCount(width: number, height: number): number {
  return width * 2 + Math.max(0, height - 2) * 2;
}

function boundaryBaseVertexIndices(width: number, height: number): number[] {
  return [
    ...topEdge(width),
    ...rightEdge(width, height).slice(1, -1),
    ...bottomEdge(width, height),
    ...leftEdge(width, height).slice(1, -1),
  ];
}

function topEdge(width: number): number[] {
  return Array.from({ length: width }, (_, column) => column);
}

function rightEdge(width: number, height: number): number[] {
  return Array.from({ length: height }, (_, row) => row * width + width - 1);
}

function bottomEdge(width: number, height: number): number[] {
  return Array.from({ length: width }, (_, column) => (height - 1) * width + (width - 1 - column));
}

function leftEdge(width: number, height: number): number[] {
  return Array.from({ length: height }, (_, row) => (height - 1 - row) * width);
}

function orientIndicesOutward<T extends Uint16Array | Uint32Array>(indices: T, positions: Float32Array): T {
  if (indices.length < 3 || facePointsOutward(indices, positions)) {
    return indices;
  }

  const oriented = new (indices.constructor as { new (length: number): T })(indices.length);

  for (let index = 0; index < indices.length; index += 3) {
    oriented[index] = indices[index];
    oriented[index + 1] = indices[index + 2];
    oriented[index + 2] = indices[index + 1];
  }

  return oriented;
}

function facePointsOutward(indices: Uint16Array | Uint32Array, positions: Float32Array): boolean {
  const a = vertexAt(positions, indices[0]);
  const b = vertexAt(positions, indices[1]);
  const c = vertexAt(positions, indices[2]);
  const faceNormal = normalize(cross(subtract(b, a), subtract(c, a)));
  const center = normalize([
    (a[0] + b[0] + c[0]) / 3,
    (a[1] + b[1] + c[1]) / 3,
    (a[2] + b[2] + c[2]) / 3,
  ]);

  return dot(faceNormal, center) >= 0;
}

export function terrainGridSizeForLevel(
  level: number,
  { gridSize, gridSizeByLevel }: Pick<TerrainMeshOptions, "gridSize" | "gridSizeByLevel"> = {},
): number | undefined {
  const selected = gridSize ?? gridSizeByLevel?.[Math.max(0, Math.round(level))];

  if (selected === undefined) {
    return undefined;
  }

  return Math.min(512, Math.max(1, Math.round(selected)));
}

function sampleHeightmap(tile: TerrainHeightmapTile, u: number, v: number): number {
  const x = clamp(u, 0, 1) * (tile.width - 1);
  const y = clamp(v, 0, 1) * (tile.height - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(tile.width - 1, x0 + 1);
  const y1 = Math.min(tile.height - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const h00 = finiteOr(tile.heights[y0 * tile.width + x0], 0);
  const h10 = finiteOr(tile.heights[y0 * tile.width + x1], h00);
  const h01 = finiteOr(tile.heights[y1 * tile.width + x0], h00);
  const h11 = finiteOr(tile.heights[y1 * tile.width + x1], h10);
  const top = h00 * (1 - tx) + h10 * tx;
  const bottom = h01 * (1 - tx) + h11 * tx;

  return top * (1 - ty) + bottom * ty;
}

function vertexAt(positions: Float32Array, index: number): MutableVec3 {
  return [positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]];
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
