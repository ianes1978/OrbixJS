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

  constructor(x: number, y: number, z: number) {
    this.radii = [x, y, z];
    this.maximumRadius = Math.max(x, y, z);
    this.minimumRadius = Math.min(x, y, z);
  }

  static readonly WGS84 = new Ellipsoid(6378137, 6356752.314245179, 6378137);

  geodeticSurfaceNormal(lon: number, lat: number): MutableVec3 {
    const cosLat = Math.cos(lat);
    return normalize([cosLat * Math.cos(lon), Math.sin(lat), cosLat * Math.sin(lon)]);
  }

  cartographicToCartesian({ lon, lat, height = 0 }: Cartographic): MutableVec3 {
    const normal = this.geodeticSurfaceNormal(lon, lat);
    const [rx, ry, rz] = this.radii;

    return [
      normal[0] * (rx + height),
      normal[1] * (ry + height),
      normal[2] * (rz + height),
    ];
  }

  scaledToUnitSphere(position: Vec3): MutableVec3 {
    return [
      position[0] / this.radii[0],
      position[1] / this.radii[1],
      position[2] / this.radii[2],
    ];
  }
}
