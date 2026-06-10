import { Ellipsoid } from "../../core/geodesy/ellipsoid";
import { type Mat4 } from "../../core/math/mat4";
import { dot, length, normalize, subtract, type Vec3 } from "../../core/math/vec3";
import { WebMercatorTilingScheme } from "../tiling/web-mercator-tiling";

export type TileBoundingSphere = {
  /** Centro in coordinate unit-scale (normalizzate per maximumRadius). */
  center: Vec3;
  /** Raggio di culling (unit-scale), comprensivo del margine per il terreno. */
  radius: number;
  /**
   * Raggio della sola superficie (senza envelope terreno): da usare per la
   * distanza SSE, altrimenti l'envelope azzera la distanza dei tile piccoli
   * e fa esplodere il raffinamento.
   */
  surfaceRadius: number;
  /** Latitudine geodetica del centro del rettangolo (radianti). */
  centerLat: number;
};

export type FrustumPlane = {
  normal: Vec3;
  distance: number;
};

/** Quota massima di terreno considerata nel bounding volume (Everest + margine). */
const terrainEnvelopeMeters = 9_000;

const tiling = new WebMercatorTilingScheme();
const boundingSphereCache = new Map<string, TileBoundingSphere>();
const boundingSphereCacheLimit = 8192;

export function tileBoundingSphere(tile: { x: number; y: number; z: number }, ellipsoid = Ellipsoid.WGS84): TileBoundingSphere {
  const cacheKey = `${tile.z}/${tile.x}/${tile.y}`;
  const cached = boundingSphereCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const sphere = computeTileBoundingSphere(tile, ellipsoid);

  if (boundingSphereCache.size >= boundingSphereCacheLimit) {
    boundingSphereCache.clear();
  }

  boundingSphereCache.set(cacheKey, sphere);
  return sphere;
}

function computeTileBoundingSphere(tile: { x: number; y: number; z: number }, ellipsoid: Ellipsoid): TileBoundingSphere {
  const rectangle = tiling.tileXYToRectangle(tile);
  const centerLon = (rectangle.west + rectangle.east) * 0.5;
  const centerLat = (rectangle.south + rectangle.north) * 0.5;
  const samples: Vec3[] = [];

  for (const lat of [rectangle.south, centerLat, rectangle.north]) {
    for (const lon of [rectangle.west, centerLon, rectangle.east]) {
      samples.push(unitPosition(lon, lat, 0, ellipsoid));
    }
  }

  const center = samples[4];
  let radius = 0;

  for (const sample of samples) {
    radius = Math.max(radius, length(subtract(sample, center)));
  }

  return {
    center,
    radius: radius + terrainEnvelopeMeters / ellipsoid.maximumRadius,
    surfaceRadius: radius,
    centerLat,
  };
}

/**
 * Estrae i sei piani del frustum dalla view-projection (Gribb–Hartmann,
 * matrici column-major). I piani puntano verso l'interno: un punto è dentro
 * se dot(n, p) + d >= 0.
 */
export function extractFrustumPlanes(viewProjection: Mat4): FrustumPlane[] {
  const m = viewProjection;
  const rows = [
    [m[0], m[4], m[8], m[12]],
    [m[1], m[5], m[9], m[13]],
    [m[2], m[6], m[10], m[14]],
    [m[3], m[7], m[11], m[15]],
  ];
  const planes: FrustumPlane[] = [];

  for (const [row, sign] of [
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [2, 1],
    [2, -1],
  ] as const) {
    const a = rows[3][0] + sign * rows[row][0];
    const b = rows[3][1] + sign * rows[row][1];
    const c = rows[3][2] + sign * rows[row][2];
    const d = rows[3][3] + sign * rows[row][3];
    const magnitude = Math.hypot(a, b, c);

    if (magnitude > 1e-12) {
      planes.push({ normal: [a / magnitude, b / magnitude, c / magnitude], distance: d / magnitude });
    }
  }

  return planes;
}

export function sphereIntersectsFrustum(sphere: TileBoundingSphere, planes: readonly FrustumPlane[]): boolean {
  for (const plane of planes) {
    if (dot(plane.normal, sphere.center) + plane.distance < -sphere.radius) {
      return false;
    }
  }

  return true;
}

/**
 * Test cono d'orizzonte: il tile è interamente oltre l'orizzonte visto dalla
 * camera? L'orizzonte è calcolato contro la sfera tangente di raggio minimo
 * (b/a in coordinate unit): conservativo rispetto all'ellissoide vero, e —
 * essendo b/a < raggio locale ovunque — resta valido anche con la camera
 * vicino al suolo (dove |camera| scende sotto 1).
 */
export function sphereBeyondHorizon(sphere: TileBoundingSphere, cameraPositionUnit: Vec3, horizonSlack = 0.001): boolean {
  const minRadiusUnit = Ellipsoid.WGS84.minimumRadius / Ellipsoid.WGS84.maximumRadius;
  const cameraDistance = length(cameraPositionUnit);

  if (cameraDistance <= minRadiusUnit * 1.000001) {
    return false;
  }

  const cameraNormal = normalize(cameraPositionUnit);
  const horizonDot = minRadiusUnit / cameraDistance;
  const centerDot = dot(cameraNormal, normalize(sphere.center));

  return centerDot + sphere.radius < horizonDot - horizonSlack;
}

function unitPosition(lon: number, lat: number, height: number, ellipsoid: Ellipsoid): Vec3 {
  const position = ellipsoid.cartographicToCartesian({ lon, lat, height });

  return [
    position[0] / ellipsoid.maximumRadius,
    position[1] / ellipsoid.maximumRadius,
    position[2] / ellipsoid.maximumRadius,
  ];
}
