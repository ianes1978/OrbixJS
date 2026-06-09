import { Ellipsoid } from "../../core/geodesy/ellipsoid";
import { normalize } from "../../core/math/vec3";
import { type TileCoordinate, WebMercatorTilingScheme, webMercatorYToLatitude } from "../tiling/web-mercator-tiling";

export type TileMeshData = {
  vertices: Float32Array;
  indices: Uint16Array;
  vertexStride: number;
};

export function createEllipsoidTileMesh(
  tile: TileCoordinate,
  segments = ellipsoidTileMeshSegments(tile.z),
  ellipsoid = Ellipsoid.WGS84,
): TileMeshData {
  const tiling = new WebMercatorTilingScheme();
  const rectangle = tiling.tileXYToRectangle(tile);
  const vertices: number[] = [];
  const indices: number[] = [];
  const maxRadius = ellipsoid.maximumRadius;
  const tileCount = tiling.tileCount(tile.z);

  for (let row = 0; row <= segments; row += 1) {
    const v = row / segments;
    const lat = webMercatorYToLatitude((tile.y + v) / tileCount);

    for (let column = 0; column <= segments; column += 1) {
      const u = column / segments;
      const lon = rectangle.west + (rectangle.east - rectangle.west) * u;
      const normal = ellipsoid.geodeticSurfaceNormal(lon, lat);
      const position = ellipsoid.cartographicToCartesian({ lon, lat, height: 0 });
      const scaledPosition = [
        position[0] / maxRadius,
        position[1] / maxRadius,
        position[2] / maxRadius,
      ] as const;
      const renderNormal = normalize(scaledPosition);

      vertices.push(
        scaledPosition[0],
        scaledPosition[1],
        scaledPosition[2],
        renderNormal[0],
        renderNormal[1],
        renderNormal[2],
        u,
        v,
      );
    }
  }

  for (let row = 0; row < segments; row += 1) {
    for (let column = 0; column < segments; column += 1) {
      const first = row * (segments + 1) + column;
      const second = first + segments + 1;
      indices.push(first, second, first + 1, second, second + 1, first + 1);
    }
  }

  return {
    vertices: new Float32Array(vertices),
    indices: new Uint16Array(indices),
    vertexStride: 8,
  };
}

export function ellipsoidTileMeshSegments(level: number): number {
  if (level <= 2) {
    return 128;
  }

  if (level <= 3) {
    return 96;
  }

  if (level <= 5) {
    return 64;
  }

  if (level <= 7) {
    return 32;
  }

  if (level <= 10) {
    return 20;
  }

  return 12;
}
