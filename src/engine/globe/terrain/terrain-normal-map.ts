import { Ellipsoid } from "../../core/geodesy/ellipsoid";
import { WebMercatorTilingScheme } from "../tiling/web-mercator-tiling";
import { tileSampleToCartographic } from "./terrain-mesh";
import { type TerrainHeightmapTile } from "./terrain-provider";

export type TerrainNormalMapOptions = {
  ellipsoid?: Ellipsoid;
  exaggeration?: number;
};

/**
 * Precalcola le normali world-space del terreno per ogni texel della
 * heightmap, codificate RGB8 (n*0.5+0.5). Sostituisce le differenze finite
 * ricalcolate per vertice a ogni frame nel vertex shader: la normale è
 * statica per tile, va calcolata una volta sola — qui, in float64.
 */
export function computeTerrainNormalMap(
  tile: TerrainHeightmapTile,
  options: TerrainNormalMapOptions = {},
): Uint8Array {
  const ellipsoid = options.ellipsoid ?? Ellipsoid.WGS84;
  const exaggeration = options.exaggeration ?? 1;
  const tiling = new WebMercatorTilingScheme(tile.level, tile.width);
  const width = tile.width;
  const height = tile.height;
  const inverseRadius = 1 / ellipsoid.maximumRadius;
  // Posizioni world (unit-scale) di tutti i texel, calcolate una volta.
  const positions = new Float64Array(width * height * 3);
  // Direzioni geodetiche per orientare la normale verso l'esterno.
  const outward = new Float64Array(width * height * 3);

  for (let row = 0; row < height; row += 1) {
    const v = height === 1 ? 0 : row / (height - 1);

    for (let column = 0; column < width; column += 1) {
      const u = width === 1 ? 0 : column / (width - 1);
      const index = row * width + column;
      const rawHeight = tile.heights[index];
      const texelHeight = (Number.isFinite(rawHeight) ? rawHeight : 0) * exaggeration;
      const { lon, lat } = tileSampleToCartographic(tile, u, v, tiling);
      const position = ellipsoid.cartographicToCartesian({ lon, lat, height: texelHeight });
      const normal = ellipsoid.geodeticSurfaceNormal(lon, lat);

      positions[index * 3] = position[0] * inverseRadius;
      positions[index * 3 + 1] = position[1] * inverseRadius;
      positions[index * 3 + 2] = position[2] * inverseRadius;
      outward[index * 3] = normal[0];
      outward[index * 3 + 1] = normal[1];
      outward[index * 3 + 2] = normal[2];
    }
  }

  const encoded = new Uint8Array(width * height * 3);

  for (let row = 0; row < height; row += 1) {
    const north = Math.max(0, row - 1) * width;
    const south = Math.min(height - 1, row + 1) * width;
    const current = row * width;

    for (let column = 0; column < width; column += 1) {
      const west = (current + Math.max(0, column - 1)) * 3;
      const east = (current + Math.min(width - 1, column + 1)) * 3;
      const up = (north + column) * 3;
      const down = (south + column) * 3;
      // east − west e north − south, stesso schema delle differenze finite
      // che erano nello shader.
      const ex = positions[east] - positions[west];
      const ey = positions[east + 1] - positions[west + 1];
      const ez = positions[east + 2] - positions[west + 2];
      const nx = positions[up] - positions[down];
      const ny = positions[up + 1] - positions[down + 1];
      const nz = positions[up + 2] - positions[down + 2];
      let cx = ey * nz - ez * ny;
      let cy = ez * nx - ex * nz;
      let cz = ex * ny - ey * nx;
      const length = Math.hypot(cx, cy, cz);
      const texel = (current + column) * 3;

      if (length < 1e-18) {
        // Texel degenere (tile 1xN o dati piatti ai bordi): normale geodetica.
        cx = outward[texel];
        cy = outward[texel + 1];
        cz = outward[texel + 2];
      } else {
        cx /= length;
        cy /= length;
        cz /= length;

        if (cx * outward[texel] + cy * outward[texel + 1] + cz * outward[texel + 2] < 0) {
          cx = -cx;
          cy = -cy;
          cz = -cz;
        }
      }

      encoded[texel] = encodeNormalComponent(cx);
      encoded[texel + 1] = encodeNormalComponent(cy);
      encoded[texel + 2] = encodeNormalComponent(cz);
    }
  }

  return encoded;
}

function encodeNormalComponent(value: number): number {
  return Math.max(0, Math.min(255, Math.round((value * 0.5 + 0.5) * 255)));
}
