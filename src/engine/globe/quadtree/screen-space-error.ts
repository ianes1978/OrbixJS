import { Ellipsoid } from "../../core/geodesy/ellipsoid";

const earthEquatorCircumferenceMeters = 2 * Math.PI * Ellipsoid.WGS84.maximumRadius;

/**
 * Larghezza in metri (all'equatore) di un tile Web Mercator al livello dato.
 */
export function tileWidthMeters(level: number): number {
  return earthEquatorCircumferenceMeters / 2 ** level;
}

/**
 * Fattore di proiezione prospettica: converte un rapporto (dimensione/distanza)
 * in pixel sullo schermo. viewportHeightPx / (2·tan(fov/2)).
 */
export function viewportProjectionFactor(viewportHeightPx: number, fovY: number): number {
  return Math.max(1, viewportHeightPx) / (2 * Math.tan(Math.max(0.01, fovY) / 2));
}

/**
 * Dimensione proiettata a schermo (px) di un tile: la metrica SSE della
 * selezione. Se supera la soglia (targetTilePixels) il tile va raffinato.
 *
 * - `tileWidthEquatorMeters` × cos(lat) dà la larghezza reale del tile;
 * - `distanceMeters` è la distanza camera → bounding volume (non centro);
 * - il fattore viewport converte il rapporto in pixel.
 */
export function projectedTileSizePixels(
  level: number,
  centerLatRadians: number,
  distanceMeters: number,
  projectionFactor: number,
): number {
  const widthMeters = tileWidthMeters(level) * Math.max(0.05, Math.cos(centerLatRadians));

  return (widthMeters / Math.max(1, distanceMeters)) * projectionFactor;
}
