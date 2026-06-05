import { Ellipsoid, type Cartographic } from "./ellipsoid";

export type SupportedCrs = "EPSG:4326" | "EPSG:3857" | "EPSG:4979";

export type CrsCoordinate = {
  x: number;
  y: number;
  z?: number;
};

const webMercatorMaxLatitude = 85.0511287798066 * (Math.PI / 180);

export function isSupportedCrs(crs: string): crs is SupportedCrs {
  return crs === "EPSG:4326" || crs === "EPSG:3857" || crs === "EPSG:4979";
}

export function coordinateToCartographic(coordinate: CrsCoordinate, crs: SupportedCrs): Cartographic {
  switch (crs) {
    case "EPSG:4326":
    case "EPSG:4979":
      return {
        lon: toRadians(coordinate.x),
        lat: toRadians(coordinate.y),
        height: coordinate.z ?? 0,
      };
    case "EPSG:3857":
      return {
        lon: coordinate.x / Ellipsoid.WGS84.maximumRadius,
        lat: 2 * Math.atan(Math.exp(coordinate.y / Ellipsoid.WGS84.maximumRadius)) - Math.PI / 2,
        height: coordinate.z ?? 0,
      };
  }
}

export function cartographicToCoordinate(cartographic: Cartographic, crs: SupportedCrs): CrsCoordinate {
  switch (crs) {
    case "EPSG:4326":
    case "EPSG:4979":
      return {
        x: toDegrees(cartographic.lon),
        y: toDegrees(cartographic.lat),
        z: cartographic.height,
      };
    case "EPSG:3857": {
      const lat = clamp(cartographic.lat, -webMercatorMaxLatitude, webMercatorMaxLatitude);
      return {
        x: Ellipsoid.WGS84.maximumRadius * cartographic.lon,
        y: Ellipsoid.WGS84.maximumRadius * Math.log(Math.tan(Math.PI / 4 + lat / 2)),
        z: cartographic.height,
      };
    }
  }
}

export function transformCoordinate(coordinate: CrsCoordinate, sourceCrs: SupportedCrs, targetCrs: SupportedCrs): CrsCoordinate {
  if (sourceCrs === targetCrs) {
    return { ...coordinate };
  }

  return cartographicToCoordinate(coordinateToCartographic(coordinate, sourceCrs), targetCrs);
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
