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
  const maxMercatorLatitude = 85.0511287798066 * (Math.PI / 180);
  const rings = createLatitudeRings(latitudeSegments, maxMercatorLatitude);

  for (const lat of rings) {
    for (let lonIndex = 0; lonIndex <= longitudeSegments; lonIndex += 1) {
      const u = lonIndex / longitudeSegments;
      const lon = -Math.PI + u * Math.PI * 2;
      const [mercatorU, mercatorV] = lonLatToWebMercatorUv(lon, lat);
      pushVertex(vertices, ellipsoid, maxRadius, lon, lat, clamp01(mercatorU), clamp01(mercatorV));
    }
  }

  for (let latIndex = 0; latIndex < rings.length - 1; latIndex += 1) {
    for (let lonIndex = 0; lonIndex < longitudeSegments; lonIndex += 1) {
      const first = latIndex * (longitudeSegments + 1) + lonIndex;
      const second = first + longitudeSegments + 1;
      indices.push(first, second, first + 1, second, second + 1, first + 1);
    }
  }

  return {
    vertices: new Float32Array(vertices),
    indices: new Uint16Array(indices),
    vertexStride: 11,
  };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function createLatitudeRings(latitudeSegments: number, maxMercatorLatitude: number): number[] {
  const rings = [Math.PI / 2];
  const mercatorBands = Math.max(2, latitudeSegments - 2);

  for (let index = 0; index <= mercatorBands; index += 1) {
    const t = index / mercatorBands;
    rings.push(maxMercatorLatitude + (-2 * maxMercatorLatitude) * t);
  }

  rings.push(-Math.PI / 2);
  return rings;
}

function pushVertex(
  vertices: number[],
  ellipsoid: Ellipsoid,
  maxRadius: number,
  lon: number,
  lat: number,
  u: number,
  v: number,
): void {
  const normal = ellipsoid.geodeticSurfaceNormal(lon, lat);
  const position = ellipsoid.cartographicToCartesian({ lon, lat });
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
    normal[0],
    normal[1],
    normal[2],
    u,
    v,
  );
}
