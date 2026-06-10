import { normalize, type MutableVec3, type Vec3 } from "../math/vec3";

export type Cartographic = {
  lon: number;
  lat: number;
  height?: number;
};

export class Ellipsoid {
  readonly radii: Vec3;
  readonly maximumRadius: number;
  readonly minimumRadius: number;
  /** Eccentricità al quadrato dell'ellissoide di rotazione (asse polare = y). */
  readonly eccentricitySquared: number;

  constructor(x: number, y: number, z: number) {
    this.radii = [x, y, z];
    this.maximumRadius = Math.max(x, y, z);
    this.minimumRadius = Math.min(x, y, z);
    this.eccentricitySquared = 1 - (this.minimumRadius * this.minimumRadius) / (this.maximumRadius * this.maximumRadius);
  }

  static readonly WGS84 = new Ellipsoid(6378137, 6356752.314245179, 6378137);

  geodeticSurfaceNormal(lon: number, lat: number): MutableVec3 {
    const cosLat = Math.cos(lat);
    return normalize([cosLat * Math.cos(lon), Math.sin(lat), -cosLat * Math.sin(lon)]);
  }

  /** Raggio di curvatura nel primo verticale N(φ). */
  primeVerticalRadius(lat: number): number {
    const sinLat = Math.sin(lat);
    return this.maximumRadius / Math.sqrt(1 - this.eccentricitySquared * sinLat * sinLat);
  }

  cartographicToCartesian({ lon, lat, height = 0 }: Cartographic): MutableVec3 {
    const e2 = this.eccentricitySquared;
    const cosLat = Math.cos(lat);
    const sinLat = Math.sin(lat);
    const N = this.primeVerticalRadius(lat);

    return [
      (N + height) * cosLat * Math.cos(lon),
      (N * (1 - e2) + height) * sinLat,
      -(N + height) * cosLat * Math.sin(lon),
    ];
  }

  surfaceNormalToCartographic(normal: Vec3): Cartographic {
    const unit = normalize(normal);
    return {
      lon: Math.atan2(-unit[2], unit[0]),
      lat: Math.asin(unit[1]),
      height: 0,
    };
  }

  cartesianToCartographic(position: Vec3): Cartographic {
    const e2 = this.eccentricitySquared;
    const x = position[0];
    const y = position[1];
    const z = position[2];
    const lon = Math.atan2(-z, x);
    const p = Math.hypot(x, z);
    let lat = Math.atan2(y, p * (1 - e2));

    for (let iteration = 0; iteration < 4; iteration += 1) {
      const sinLat = Math.sin(lat);
      const N = this.primeVerticalRadius(lat);
      const height = p * Math.cos(lat) + y * sinLat - N * (1 - e2 * sinLat * sinLat);
      lat = Math.atan2(y, p * (1 - e2 * (N / (N + height))));
    }

    const sinLat = Math.sin(lat);
    const N = this.primeVerticalRadius(lat);
    const height = p * Math.cos(lat) + y * sinLat - N * (1 - e2 * sinLat * sinLat);

    return { lon, lat, height };
  }

  unitCartesianToCartographic(position: Vec3): Cartographic {
    return this.cartesianToCartographic([
      position[0] * this.maximumRadius,
      position[1] * this.maximumRadius,
      position[2] * this.maximumRadius,
    ]);
  }

  scaledToUnitSphere(position: Vec3): MutableVec3 {
    return [
      position[0] / this.radii[0],
      position[1] / this.radii[1],
      position[2] / this.radii[2],
    ];
  }
}
