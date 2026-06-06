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
};

export type TerrainMeshOptions = {
  ellipsoid?: Ellipsoid;
  tiling?: WebMercatorTilingScheme;
  exaggeration?: number;
};

export function createTerrainMesh(tile: TerrainHeightmapTile, options: TerrainMeshOptions = {}): TerrainMesh {
  if (tile.width < 2 || tile.height < 2) {
    throw new Error("Terrain mesh requires at least a 2x2 heightmap tile");
  }

  const ellipsoid = options.ellipsoid ?? Ellipsoid.WGS84;
  const tiling = options.tiling ?? new WebMercatorTilingScheme(tile.level, tile.width);
  const exaggeration = options.exaggeration ?? 1;
  const vertexCount = tile.width * tile.height;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const texcoords = new Float32Array(vertexCount * 2);
  let minHeight = Number.POSITIVE_INFINITY;
  let maxHeight = Number.NEGATIVE_INFINITY;

  for (let row = 0; row < tile.height; row += 1) {
    const v = tile.height === 1 ? 0 : row / (tile.height - 1);

    for (let column = 0; column < tile.width; column += 1) {
      const u = tile.width === 1 ? 0 : column / (tile.width - 1);
      const vertexIndex = row * tile.width + column;
      const height = finiteOr(tile.heights[vertexIndex], 0);
      const { lon, lat } = tileSampleToCartographic(tile, u, v, tiling);
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

  const indices = createGridIndices(tile.width, tile.height);

  return {
    positions,
    normals,
    texcoords,
    indices: orientIndicesOutward(indices, positions),
    minHeight,
    maxHeight,
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

function createGridIndices(width: number, height: number): Uint16Array | Uint32Array {
  const indexCount = (width - 1) * (height - 1) * 6;
  const IndexArray = width * height > 65_535 ? Uint32Array : Uint16Array;
  const indices = new IndexArray(indexCount);
  let offset = 0;

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

  return indices;
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

function vertexAt(positions: Float32Array, index: number): MutableVec3 {
  return [positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]];
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
