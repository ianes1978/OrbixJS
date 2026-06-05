export type TileCoordinate = {
  x: number;
  y: number;
  z: number;
};

export type RectangleRadians = {
  west: number;
  south: number;
  east: number;
  north: number;
};

const maxLatitude = 85.0511287798066 * (Math.PI / 180);

export class WebMercatorTilingScheme {
  tileCount(level: number): number {
    return 2 ** level;
  }

  tileXYToRectangle({ x, y, z }: TileCoordinate): RectangleRadians {
    const count = this.tileCount(z);
    const west = tileXToLongitude(x, count);
    const east = tileXToLongitude(x + 1, count);
    const north = tileYToLatitude(y, count);
    const south = tileYToLatitude(y + 1, count);
    return { west, south, east, north };
  }

  positionToTileXY(lon: number, lat: number, level: number): TileCoordinate {
    const count = this.tileCount(level);
    const clampedLat = clamp(lat, -maxLatitude, maxLatitude);
    const x = Math.floor(((lon + Math.PI) / (2 * Math.PI)) * count);
    const mercator = Math.log(Math.tan(Math.PI / 4 + clampedLat / 2));
    const y = Math.floor(((Math.PI - mercator) / (2 * Math.PI)) * count);

    return {
      x: clamp(x, 0, count - 1),
      y: clamp(y, 0, count - 1),
      z: level,
    };
  }
}

export function lonLatToWebMercatorUv(lon: number, lat: number): [number, number] {
  const clampedLat = clamp(lat, -maxLatitude, maxLatitude);
  const u = (lon + Math.PI) / (2 * Math.PI);
  const mercator = Math.log(Math.tan(Math.PI / 4 + clampedLat / 2));
  const v = (Math.PI - mercator) / (2 * Math.PI);
  return [u, v];
}

function tileXToLongitude(x: number, count: number): number {
  return (x / count) * 2 * Math.PI - Math.PI;
}

function tileYToLatitude(y: number, count: number): number {
  const n = Math.PI - (2 * Math.PI * y) / count;
  return Math.atan(Math.sinh(n));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
