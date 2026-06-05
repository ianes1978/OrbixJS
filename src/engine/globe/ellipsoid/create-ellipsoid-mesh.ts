import { Ellipsoid } from "../../core/geodesy/ellipsoid";
import { normalize } from "../../core/math/vec3";
import { lonLatToWebMercatorUv } from "../tiling/web-mercator-tiling";

export type MeshData = {
  vertices: Float32Array;
  indices: Uint16Array;
  vertexStride: number;
};

export function createEllipsoidMesh(
  ellipsoid = Ellipsoid.WGS84,
  longitudeSegments = 96,
  latitudeSegments = 48,
): MeshData {
  const vertices: number[] = [];
  const indices: number[] = [];
  const maxRadius = ellipsoid.maximumRadius;

  for (let latIndex = 0; latIndex <= latitudeSegments; latIndex += 1) {
    const v = latIndex / latitudeSegments;
    const lat = Math.PI / 2 - v * Math.PI;

    for (let lonIndex = 0; lonIndex <= longitudeSegments; lonIndex += 1) {
      const u = lonIndex / longitudeSegments;
      const lon = u * Math.PI * 2;
      const normal = ellipsoid.geodeticSurfaceNormal(lon, lat);
      const position = ellipsoid.cartographicToCartesian({ lon, lat });
      const scaledPosition = [
        position[0] / maxRadius,
        position[1] / maxRadius,
        position[2] / maxRadius,
      ] as const;
      const renderNormal = normalize(scaledPosition);
      const geographicLon = lon > Math.PI ? lon - Math.PI * 2 : lon;
      const [mercatorU, mercatorV] = lonLatToWebMercatorUv(geographicLon, lat);
      const uv = [1 - mercatorU, mercatorV] as const;

      vertices.push(
        scaledPosition[0],
        scaledPosition[1],
        scaledPosition[2],
        renderNormal[0],
        renderNormal[1],
        renderNormal[2],
        normal[0],
        normal[1],
        normal[2],
        uv[0],
        uv[1],
      );
    }
  }

  for (let latIndex = 0; latIndex < latitudeSegments; latIndex += 1) {
    for (let lonIndex = 0; lonIndex < longitudeSegments; lonIndex += 1) {
      const first = latIndex * (longitudeSegments + 1) + lonIndex;
      const second = first + longitudeSegments + 1;
      indices.push(first, first + 1, second, second, first + 1, second + 1);
    }
  }

  return {
    vertices: new Float32Array(vertices),
    indices: new Uint16Array(indices),
    vertexStride: 11,
  };
}
