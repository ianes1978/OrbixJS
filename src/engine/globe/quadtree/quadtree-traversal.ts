import { Ellipsoid } from "../../core/geodesy/ellipsoid";
import { type Mat4 } from "../../core/math/mat4";
import { length, subtract, type Vec3 } from "../../core/math/vec3";
import { createQuadtreeTile, type QuadtreeTile } from "../imagery/quadtree-tile";
import { projectedTileSizePixels, viewportProjectionFactor } from "./screen-space-error";
import {
  extractFrustumPlanes,
  sphereBeyondHorizon,
  sphereIntersectsFrustum,
  tileBoundingSphere,
  type TileBoundingSphere,
} from "./tile-culling";

export type QuadtreeTraversalInput = {
  /** Posizione camera in coordinate unit-scale (normalizzate per maximumRadius). */
  cameraPositionUnit: Vec3;
  /** View-projection (column-major, float64) per il frustum culling. */
  viewProjection: Mat4;
  viewportHeightPx: number;
  fovY: number;
  /**
   * Soglia SSE: dimensione proiettata massima (px) oltre la quale un tile va
   * raffinato. Tipicamente targetTilePixels (256) × pixelErrorBudget.
   */
  thresholdPixels: number;
  /** Livello massimo di raffinamento (dal LOD target corrente). */
  maxLevel: number;
  /** Livello minimo / dei tile radice dell'attraversamento. */
  minLevel?: number;
  /** Budget massimo di tile selezionati. */
  maxTiles: number;
};

export type QuadtreeSelectedTile = {
  tile: QuadtreeTile;
  /** Dimensione proiettata a schermo in px (metrica di priorità). */
  projectedPixels: number;
  /** Distanza camera→tile in metri (per priorità di caricamento). */
  distanceMeters: number;
};

export type QuadtreeTraversalResult = {
  /**
   * Foglie selezionate, ordinate per priorità decrescente (prima i tile con
   * errore a schermo maggiore). Coprono interamente la vista: ogni ramo
   * visibile termina con una foglia.
   */
  tiles: QuadtreeSelectedTile[];
  /** Tile valutati durante l'attraversamento (telemetria). */
  visited: number;
  /** Tile scartati dal culling (telemetria). */
  culled: number;
};

type TraversalCandidate = QuadtreeSelectedTile & { sphere: TileBoundingSphere; mustRefine: boolean };

/**
 * Attraversamento top-down del quadtree Web Mercator guidato dallo
 * screen-space error. Deterministico a parità di input: nessun budget di
 * tempo, il budget di tile ferma il raffinamento sulle foglie con SSE più
 * basso (le aree peggiori a schermo vengono raffinate per prime).
 */
export function traverseQuadtree(input: QuadtreeTraversalInput): QuadtreeTraversalResult {
  const minLevel = Math.max(0, Math.round(input.minLevel ?? 2));
  const maxLevel = Math.max(minLevel, Math.round(input.maxLevel));
  const maxTiles = Math.max(1, input.maxTiles);
  const planes = extractFrustumPlanes(input.viewProjection);
  const projectionFactor = viewportProjectionFactor(input.viewportHeightPx, input.fovY);
  const earthRadius = Ellipsoid.WGS84.maximumRadius;
  // Distanza dell'orizzonte in coordinate unit (raggio locale minimo = b/a):
  // sotto questa scala i test su sfera diventano informativi.
  const cameraDistanceUnit = length(input.cameraPositionUnit);
  const minRadiusUnit = Ellipsoid.WGS84.minimumRadius / earthRadius;
  const horizonDistanceUnit = Math.sqrt(Math.max(0, cameraDistanceUnit * cameraDistanceUnit - minRadiusUnit * minRadiusUnit));
  const rootCount = 2 ** minLevel;
  const queue: TraversalCandidate[] = [];
  const selected: QuadtreeSelectedTile[] = [];
  let visited = 0;
  let culled = 0;

  const evaluate = (tile: QuadtreeTile): TraversalCandidate | undefined => {
    visited += 1;
    const sphere = tileBoundingSphere(tile);

    if (!sphereIntersectsFrustum(sphere, planes) || sphereBeyondHorizon(sphere, input.cameraPositionUnit)) {
      culled += 1;
      return undefined;
    }

    const centerDistanceUnit = length(subtract(sphere.center, input.cameraPositionUnit));
    const distanceUnit = Math.max(1e-9, centerDistanceUnit - sphere.surfaceRadius);
    const distanceMeters = distanceUnit * earthRadius;
    const projectedPixels = projectedTileSizePixels(tile.z, sphere.centerLat, distanceMeters, projectionFactor);
    // Un tile la cui sfera "avvolge" la camera o supera la scala dell'orizzonte
    // è indecidibile per il culling conservativo: va raffinato a prescindere
    // dall'SSE, così i figli (sfere più strette) vengono scartati dal culling
    // e il budget non si spreca su tile enormi fuori vista.
    const mustRefine = sphere.radius > Math.min(centerDistanceUnit, horizonDistanceUnit);

    return { tile, sphere, projectedPixels, distanceMeters, mustRefine };
  };

  for (let y = 0; y < rootCount; y += 1) {
    for (let x = 0; x < rootCount; x += 1) {
      const candidate = evaluate(createQuadtreeTile(x, y, minLevel));

      if (candidate) {
        queue.push(candidate);
      }
    }
  }

  while (queue.length > 0) {
    const index = highestPriorityIndex(queue);
    const candidate = queue.splice(index, 1)[0];
    const wantsRefine =
      (candidate.projectedPixels > input.thresholdPixels || candidate.mustRefine) && candidate.tile.z < maxLevel;
    // -1: il tile corrente viene sostituito dai figli.
    const childrenFitBudget = selected.length + queue.length + 4 - 1 <= maxTiles;

    if (wantsRefine && childrenFitBudget) {
      const children = quadtreeChildrenOf(candidate.tile)
        .map(evaluate)
        .filter((child): child is TraversalCandidate => child !== undefined);

      // Tutti i figli culled ⇒ nessuna parte del tile è visibile: il padre era
      // un sopravvissuto del culling conservativo e va scartato, non reso.
      queue.push(...children);
      continue;
    }

    selected.push({ tile: candidate.tile, projectedPixels: candidate.projectedPixels, distanceMeters: candidate.distanceMeters });

    if (selected.length >= maxTiles) {
      // Budget esaurito: la coda residua diventa foglie così la copertura
      // resta completa (il budget limita il raffinamento, mai la copertura).
      for (const remaining of queue) {
        selected.push({
          tile: remaining.tile,
          projectedPixels: remaining.projectedPixels,
          distanceMeters: remaining.distanceMeters,
        });
      }

      break;
    }
  }

  selected.sort((a, b) => b.projectedPixels - a.projectedPixels);

  return { tiles: selected, visited, culled };
}

function highestPriorityIndex(queue: readonly TraversalCandidate[]): number {
  let best = 0;

  for (let index = 1; index < queue.length; index += 1) {
    const candidate = queue[index];
    const current = queue[best];

    // I tile indecidibili (mustRefine) vanno processati per primi: raffinarli
    // riduce la coda perché i figli vengono scartati dal culling. Solo dopo
    // conta l'errore a schermo.
    if (
      (candidate.mustRefine && !current.mustRefine) ||
      (candidate.mustRefine === current.mustRefine && candidate.projectedPixels > current.projectedPixels)
    ) {
      best = index;
    }
  }

  return best;
}

function quadtreeChildrenOf(tile: QuadtreeTile): QuadtreeTile[] {
  const childX = tile.x * 2;
  const childY = tile.y * 2;
  const childLevel = tile.z + 1;

  return [
    createQuadtreeTile(childX, childY, childLevel),
    createQuadtreeTile(childX + 1, childY, childLevel),
    createQuadtreeTile(childX, childY + 1, childLevel),
    createQuadtreeTile(childX + 1, childY + 1, childLevel),
  ];
}
