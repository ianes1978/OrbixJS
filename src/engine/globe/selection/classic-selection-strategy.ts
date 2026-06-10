import { createQuadtreeTile, type QuadtreeTile } from "../imagery/quadtree-tile";
import { selectLevel } from "../imagery/tile-selector";
import {
  bestCandidateIndex,
  cartographicFromClosestRaySurfacePoint,
  conservativeViewportBounds,
  distanceFromCartographicToRectangleMeters,
  mergeOrderedCoverageTiles,
  mergePriorityCoverageTiles,
  moduloTileX,
  screenBoundsDistanceToViewportCenter,
  screenBoundsIntersectsViewport,
  unwrapTileX,
  type ScreenBounds,
  type ScreenTileCandidate,
} from "./coverage-utils";
import {
  type CoverageSelection,
  type CoverageSelectionInput,
  type TileSelectionHost,
  type TileSelectionStrategy,
} from "./selection-strategy";

/**
 * Strategia di selezione "classica": le euristiche di copertura pre-Plan3
 * (anelli clipmap, quadtree a distanza, bbox da campioni, globo intero)
 * spostate fuori da GeoViewer senza cambi di comportamento.
 * Verra' sostituita dalla QuadtreeSelectionStrategy (Plan3, Fase 3).
 */
export class ClassicSelectionStrategy implements TileSelectionStrategy {
  private lastStrategy = "none";

  constructor(private readonly host: TileSelectionHost) {}

  selectCoverage(input: CoverageSelectionInput): CoverageSelection | undefined {
    const tiles = this.screenSpaceCoverageTiles(
      input.maxTiles,
      input.targetLevel,
      input.coveragePositions,
      input.targetTilePixels,
      input.recordStrategy ?? true,
    );

    return tiles ? { tiles, strategy: this.lastStrategy } : undefined;
  }

  private screenSpaceCoverageTiles(
    maxTiles = 2048,
    targetLevelOverride?: number,
    coveragePositions: readonly (readonly [number, number, number?])[] = [],
    targetTilePixels = 256 * 1.08,
    recordStrategy = true,
  ): QuadtreeTile[] | undefined {
    const [width, height] = this.host.canvasSize();

    if (width <= 0 || height <= 0) {
      if (recordStrategy) {
        this.lastStrategy = "none";
      }
      return undefined;
    }

    const targetLevel =
      targetLevelOverride ??
      this.host.projectedImageryLevel() ??
      selectLevel(this.host.cameraDistanceForLod(), 22, {
        viewportHeight: this.host.lodViewportHeight(),
        fov: this.host.cameraFov(),
      });
    const altitudeMeters = this.host.cameraAltitudeAboveSurfaceMeters();

    if (altitudeMeters > 8_000_000) {
      const distantGlobeLevel = altitudeMeters > 18_000_000 ? 2 : 3;
      const globeTiles = this.wholeGlobeCoverageTiles(distantGlobeLevel, maxTiles);

      if (globeTiles.length > 0) {
        if (recordStrategy) {
          this.lastStrategy = "whole-globe-quadtree";
        }
        return globeTiles;
      }
    }

    const useScreenSpaceCoverage = altitudeMeters < 80_000;

    if (useScreenSpaceCoverage) {
      const clodCoverage = this.clodCoverageTiles(maxTiles, targetLevel, width, height);

      if (clodCoverage && clodCoverage.length > 0) {
        if (recordStrategy) {
          this.lastStrategy = "camera-clipmap-screen-quadtree";
        }
        return clodCoverage;
      }
    }

    if (altitudeMeters <= 1_000_000) {
      const anchoredCoverage = this.cameraAnchoredCoverageTiles(targetLevel, maxTiles);

      if (anchoredCoverage.length > 0) {
        if (recordStrategy) {
          this.lastStrategy = "camera-anchored-mid-altitude";
        }
        return anchoredCoverage;
      }
    }

    const rayCoverage = useScreenSpaceCoverage
      ? undefined
      : this.coverageTilesFromVisibleSamples(coveragePositions, targetLevel, maxTiles);

    if (rayCoverage) {
      if (recordStrategy) {
        this.lastStrategy = "sample-bbox";
      }
      return rayCoverage;
    }

    const threshold = Math.max(32, targetTilePixels);
    const rootLevel = altitudeMeters > 8_000_000 ? 1 : 2;
    const rootCount = this.host.imageryTiling.tileCount(rootLevel);
    const stack: QuadtreeTile[] = [];
    const selected: { tile: QuadtreeTile; bounds: ScreenBounds }[] = [];

    for (let y = 0; y < rootCount; y += 1) {
      for (let x = 0; x < rootCount; x += 1) {
        stack.push(createQuadtreeTile(x, y, rootLevel));
      }
    }

    while (stack.length > 0) {
      const tile = stack.pop();

      if (!tile) {
        continue;
      }

      const bounds = this.host.projectTileScreenBounds(tile);

      if (!bounds || !screenBoundsIntersectsViewport(bounds, width, height)) {
        continue;
      }

      const projectedSize = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
      const shouldSubdivide = tile.z < targetLevel && projectedSize > threshold;
      const canSubdivide = shouldSubdivide && selected.length + stack.length + 4 <= maxTiles;

      if (!canSubdivide) {
        selected.push({ tile, bounds });
        continue;
      }

      const childX = tile.x * 2;
      const childY = tile.y * 2;
      const childLevel = tile.z + 1;
      stack.push(
        createQuadtreeTile(childX, childY, childLevel),
        createQuadtreeTile(childX + 1, childY, childLevel),
        createQuadtreeTile(childX, childY + 1, childLevel),
        createQuadtreeTile(childX + 1, childY + 1, childLevel),
      );
    }

    const prioritized = selected
      .sort((a, b) => screenBoundsDistanceToViewportCenter(a.bounds, width, height) - screenBoundsDistanceToViewportCenter(b.bounds, width, height))
      .map((entry) => entry.tile);
    const cameraAnchoredCoverage = useScreenSpaceCoverage
      ? this.cameraAnchoredCoverageTiles(targetLevel, maxTiles)
      : [];
    const mergedCoverage =
      cameraAnchoredCoverage.length > 0
        ? mergePriorityCoverageTiles(cameraAnchoredCoverage, prioritized, maxTiles)
        : prioritized.slice(0, maxTiles);

    if (recordStrategy) {
      this.lastStrategy =
        mergedCoverage.length > 0
          ? cameraAnchoredCoverage.length > 0
            ? "camera-anchored-screen-quadtree"
            : useScreenSpaceCoverage
              ? "screen-quadtree-near"
              : "screen-quadtree"
          : "none";
    }
    return mergedCoverage.length > 0 ? mergedCoverage : undefined;
  }

  private cameraAnchoredCoverageTiles(targetLevel: number, maxTiles: number): QuadtreeTile[] {
    const altitudeMeters = this.host.cameraAltitudeAboveSurfaceMeters();

    if (altitudeMeters > 1_000_000 || !Number.isFinite(targetLevel) || maxTiles <= 0) {
      return [];
    }

    const anchor = this.viewCoverageAnchorCartographic();

    if (!anchor) {
      return [];
    }

    const level = Math.max(2, Math.round(targetLevel));
    const tilted = Math.abs(this.host.cameraTiltOffset()) > 0.35;
    const midAltitude = altitudeMeters > 80_000;
    const padding = midAltitude ? 4 : altitudeMeters <= 2_500 ? 2 : tilted ? 3 : 2;
    const limit = Math.min(maxTiles, midAltitude ? 81 : altitudeMeters <= 2_500 ? 25 : tilted ? 49 : 25);
    const count = this.host.imageryTiling.tileCount(level);
    const center = this.host.imageryTiling.positionToTileXY(anchor[0], anchor[1], level);
    const tiles: QuadtreeTile[] = [];

    for (let y = Math.max(0, center.y - padding); y <= Math.min(count - 1, center.y + padding); y += 1) {
      for (let x = center.x - padding; x <= center.x + padding; x += 1) {
        tiles.push(createQuadtreeTile(moduloTileX(x, count), y, level));

        if (tiles.length >= limit) {
          return tiles;
        }
      }
    }

    return tiles;
  }

  private viewCoverageAnchorCartographic(): [number, number, number] | undefined {
    // Con la camera inclinata il centro schermo colpisce il terreno lontano (verso
    // l'orizzonte): l'ancora del dettaglio massimo deve restare sul terreno più
    // vicino alla camera, cioè in basso nello schermo (NDC y negativo).
    const tilted = Math.abs(this.host.cameraTiltOffset()) > 0.35;
    const viewSamples = tilted
      ? ([
          [0, -0.85],
          [-0.35, -0.85],
          [0.35, -0.85],
          [0, -0.6],
          [-0.35, -0.6],
          [0.35, -0.6],
          [0, -0.3],
          [0, 0],
        ] as const)
      : ([
          [0, 0],
          [0, -0.25],
          [-0.25, -0.25],
          [0.25, -0.25],
          [0, -0.5],
          [-0.35, -0.5],
          [0.35, -0.5],
        ] as const);

    for (const [x, y] of viewSamples) {
      const cartographic = this.host.pickNormalizedDeviceCoordinate(x, y);

      if (cartographic) {
        return [cartographic.lon, cartographic.lat, cartographic.height];
      }
    }

    const center = this.host.nearestVisibleCartographicSample();

    if (center) {
      return center;
    }

    for (const [x, y] of viewSamples) {
      const ray = this.host.pickRayFromNdc(x, y);
      const cartographic = ray ? cartographicFromClosestRaySurfacePoint(ray) : undefined;

      if (cartographic) {
        return cartographic;
      }
    }

    const camera = this.host.cameraSurfaceStatus();

    return Number.isFinite(camera.lon) && Number.isFinite(camera.lat)
      ? [camera.lon, camera.lat, 0]
      : undefined;
  }

  private clodCoverageTiles(
    maxTiles: number,
    targetLevel: number,
    width: number,
    height: number,
  ): QuadtreeTile[] | undefined {
    const altitudeMeters = this.host.cameraAltitudeAboveSurfaceMeters();

    const cameraTiles = mergeOrderedCoverageTiles(this.cameraClipmapRingTiles(targetLevel, maxTiles), maxTiles);

    // La copertura a distanza non va mai saltata del tutto (lascerebbe buchi verso
    // l'orizzonte): nei frame sotto sforzo si riduce il budget, non la copertura.
    const strainedFrame = this.host.smoothedCpuMs() >= 80 || this.host.adaptiveQualityReduction() >= 1.25;
    const distanceBudget = Math.max(0, maxTiles - cameraTiles.length);
    const effectiveDistanceBudget = strainedFrame ? Math.max(16, Math.floor(distanceBudget / 2)) : distanceBudget;
    const distanceCoverage =
      effectiveDistanceBudget > 0
        ? this.distanceDependentCoverageTiles(
            effectiveDistanceBudget,
            strainedFrame ? Math.max(2, targetLevel - 1) : targetLevel,
            width,
            height,
          )
        : undefined;

    if (!distanceCoverage || distanceCoverage.length === 0) {
      return cameraTiles.length > 0 ? cameraTiles : undefined;
    }

    const distanceTiles = altitudeMeters <= 80_000
      ? distanceCoverage
      : this.expandCoverageTiles(distanceCoverage, distanceBudget);
    const merged = mergePriorityCoverageTiles(cameraTiles, distanceTiles, maxTiles);

    return merged.length > 0 ? merged : undefined;
  }

  private cameraClipmapRingTiles(targetLevel: number, maxTiles: number): QuadtreeTile[] {
    const altitudeMeters = this.host.cameraAltitudeAboveSurfaceMeters();

    if (altitudeMeters > 120_000) {
      return [];
    }

    const anchor = this.viewCoverageAnchorCartographic();

    if (!anchor) {
      return [];
    }

    const roundedTargetLevel = Math.max(2, Math.round(targetLevel));
    const rings =
      altitudeMeters <= 2_500
        ? [
            { level: roundedTargetLevel, padding: 1 },
            { level: roundedTargetLevel - 2, padding: 1 },
            { level: roundedTargetLevel - 4, padding: 2 },
          ]
        : Math.abs(this.host.cameraTiltOffset()) > 0.35
          ? [
              { level: roundedTargetLevel, padding: 1 },
              { level: roundedTargetLevel - 2, padding: 1 },
              { level: roundedTargetLevel - 4, padding: 2 },
              { level: roundedTargetLevel - 6, padding: 2 },
            ]
          : [
              { level: roundedTargetLevel, padding: 1 },
              { level: roundedTargetLevel - 3, padding: 2 },
            ];
    const tiles = new Map<string, QuadtreeTile>();

    for (const ring of rings) {
      const level = Math.max(2, ring.level);
      const count = this.host.imageryTiling.tileCount(level);
      const center = this.host.imageryTiling.positionToTileXY(anchor[0], anchor[1], level);

      for (let y = Math.max(0, center.y - ring.padding); y <= Math.min(count - 1, center.y + ring.padding); y += 1) {
        for (let x = center.x - ring.padding; x <= center.x + ring.padding; x += 1) {
          const tile = createQuadtreeTile(moduloTileX(x, count), y, level);
          tiles.set(tile.id, tile);

          if (tiles.size >= maxTiles) {
            return [...tiles.values()];
          }
        }
      }
    }

    return [...tiles.values()];
  }

  private distanceDependentCoverageTiles(
    maxTiles: number,
    targetLevel: number,
    width: number,
    height: number,
  ): QuadtreeTile[] | undefined {
    const startedAt = performance.now();
    const budgetMs = this.host.smoothedCpuMs() > 32 ? 5 : 9;
    const rootLevel = 2;
    const rootCount = this.host.imageryTiling.tileCount(rootLevel);
    const queue: ScreenTileCandidate[] = [];
    const selected: QuadtreeTile[] = [];
    // Allo scadere del budget di tempo le candidate in coda diventano foglie:
    // copertura più grossolana ma senza buchi (mai scartare la coda).
    const flushQueue = () => {
      for (const candidate of queue) {
        if (selected.length >= maxTiles) {
          break;
        }

        selected.push(candidate.tile);
      }

      return selected.length > 0 ? selected.slice(0, maxTiles) : undefined;
    };

    for (let y = 0; y < rootCount; y += 1) {
      for (let x = 0; x < rootCount; x += 1) {
        const candidate = this.screenTileCandidate(createQuadtreeTile(x, y, rootLevel), targetLevel, width, height);

        if (candidate) {
          queue.push(candidate);
        }
      }
    }

    while (queue.length > 0) {
      if (performance.now() - startedAt > budgetMs) {
        return flushQueue();
      }

      const index = bestCandidateIndex(queue);
      const candidate = queue.splice(index, 1)[0];
      const childrenFitBudget = selected.length + queue.length + 4 <= maxTiles;

      if (candidate.tile.z < candidate.desiredLevel && childrenFitBudget) {
        const childX = candidate.tile.x * 2;
        const childY = candidate.tile.y * 2;
        const childLevel = candidate.tile.z + 1;
        const children = [
          createQuadtreeTile(childX, childY, childLevel),
          createQuadtreeTile(childX + 1, childY, childLevel),
          createQuadtreeTile(childX, childY + 1, childLevel),
          createQuadtreeTile(childX + 1, childY + 1, childLevel),
        ]
          .map((tile) => this.screenTileCandidate(tile, targetLevel, width, height))
          .filter((child): child is ScreenTileCandidate => child !== undefined);

        if (children.length > 0) {
          queue.push(...children);
          continue;
        }
      }

      selected.push(candidate.tile);
    }

    return selected.length > 0 ? selected.slice(0, maxTiles) : undefined;
  }

  private wholeGlobeCoverageTiles(level: number, maxTiles: number): QuadtreeTile[] {
    const clampedLevel = Math.max(0, Math.round(level));
    const count = this.host.imageryTiling.tileCount(clampedLevel);
    const tiles: QuadtreeTile[] = [];

    for (let y = 0; y < count; y += 1) {
      for (let x = 0; x < count; x += 1) {
        tiles.push(createQuadtreeTile(x, y, clampedLevel));

        if (tiles.length >= maxTiles) {
          return tiles;
        }
      }
    }

    return tiles;
  }

  private distanceCoverageTileBudget(maxTiles: number): number {
    const altitudeMeters = this.host.cameraAltitudeAboveSurfaceMeters();

    if (altitudeMeters <= 2_500) {
      return Math.min(maxTiles, 192);
    }

    if (altitudeMeters <= 8_000) {
      return Math.min(maxTiles, 256);
    }

    return maxTiles;
  }

  private screenTileCandidate(
    tile: QuadtreeTile,
    targetLevel: number,
    width: number,
    height: number,
  ): ScreenTileCandidate | undefined {
    const bounds = this.host.projectTileScreenBounds(tile);

    if (!bounds || !screenBoundsIntersectsViewport(bounds, width, height)) {
      return undefined;
    }

    const desiredLevel = this.distanceDesiredTileLevel(tile, targetLevel);
    const distanceToCenter = screenBoundsDistanceToViewportCenter(bounds, width, height);
    const viewportScale = Math.max(1, Math.hypot(width, height));
    const normalizedCenterDistance = Math.sqrt(distanceToCenter) / viewportScale;

    return {
      tile,
      bounds,
      desiredLevel,
      priority: desiredLevel * 1_000_000 + tile.z * 10_000 - normalizedCenterDistance * 1_000,
    };
  }

  private distanceDesiredTileLevel(tile: QuadtreeTile, targetLevel: number): number {
    const rectangle = this.host.imageryTiling.tileXYToRectangle(tile);
    const camera = this.host.cameraSurfaceStatus();
    const cameraToTileMeters = distanceFromCartographicToRectangleMeters(camera.lon, camera.lat, rectangle);
    const referenceMeters = Math.max(250, this.host.cameraAltitudeAboveSurfaceMeters());
    const distanceRatio = Math.max(1, cameraToTileMeters / referenceMeters);
    const levelDrop = Math.floor(Math.log2(distanceRatio));
    // Il pavimento anti-sgranato vale solo nel campo vicino: verso l'orizzonte i
    // livelli devono poter scendere, altrimenti la copertura esplode e si tronca.
    const nearField = cameraToTileMeters <= referenceMeters * 4;
    const minLevel = nearField ? this.minimumNearGroundCoverageLevel(targetLevel) : 2;

    return Math.max(minLevel, Math.min(targetLevel, Math.round(targetLevel - levelDrop)));
  }

  private isNearGroundSampleCoverage(tiles: readonly QuadtreeTile[], targetLevel: number): boolean {
    if (tiles.length === 0 || this.host.cameraAltitudeAboveSurfaceMeters() > 12_000) {
      return false;
    }

    const minimumLevel = this.minimumNearGroundCoverageLevel(targetLevel);
    return tiles.every((tile) => tile.z >= minimumLevel);
  }

  private isNearGroundCoarseCoverage(tile: QuadtreeTile, targetLevel: number): boolean {
    if (this.host.cameraAltitudeAboveSurfaceMeters() > 12_000) {
      return false;
    }

    return tile.z < this.minimumNearGroundCoverageLevel(targetLevel);
  }

  private minimumNearGroundCoverageLevel(targetLevel: number): number {
    const altitude = this.host.cameraAltitudeAboveSurfaceMeters();

    if (altitude <= 2_500) {
      return Math.max(2, targetLevel - 3);
    }

    if (altitude <= 8_000) {
      return Math.max(2, targetLevel - 4);
    }

    if (altitude <= 20_000) {
      return Math.max(2, targetLevel - 5);
    }

    return 2;
  }

  private coverageTilesFromVisibleSamples(
    coveragePositions: readonly (readonly [number, number, number?])[],
    targetLevel: number,
    maxTiles: number,
  ): QuadtreeTile[] | undefined {
    const samples = coveragePositions.filter(
      (position): position is readonly [number, number, number?] =>
        Number.isFinite(position[0]) && Number.isFinite(position[1]),
    );

    if (samples.length === 0 || !Number.isFinite(targetLevel)) {
      return undefined;
    }

    const minLevel = 2;
    const startLevel = Math.max(minLevel, Math.round(targetLevel));
    const fallbackDepth = this.host.cameraAltitudeAboveSurfaceMeters() <= 2_500 ? 8 : 3;
    const minimumScreenSpaceLevel = Math.max(minLevel, startLevel - fallbackDepth);
    const sampleCompleteness = samples.length / Math.max(1, this.host.currentViewportSampleCount());

    if (sampleCompleteness < 0.35) {
      return undefined;
    }

    for (let level = startLevel; level >= minimumScreenSpaceLevel; level -= 1) {
      const count = this.host.imageryTiling.tileCount(level);
      const anchor = this.host.imageryTiling.positionToTileXY(samples[0][0], samples[0][1], level);
      const padding = this.coveragePaddingForLevel(level, sampleCompleteness);
      let minX = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;

      for (const [lon, lat] of samples) {
        const tile = this.host.imageryTiling.positionToTileXY(lon, lat, level);
        const unwrappedX = unwrapTileX(tile.x, anchor.x, count);

        minX = Math.min(minX, unwrappedX);
        maxX = Math.max(maxX, unwrappedX);
        minY = Math.min(minY, tile.y);
        maxY = Math.max(maxY, tile.y);
      }

      if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
        continue;
      }

      const paddedMinY = Math.max(0, minY - padding);
      const paddedMaxY = Math.min(count - 1, maxY + padding);
      const spanX = maxX - minX + 1 + padding * 2;
      const spanY = paddedMaxY - paddedMinY + 1;
      const estimatedTileCount = spanX * spanY;

      if (spanX <= 0 || spanY <= 0 || estimatedTileCount > maxTiles) {
        continue;
      }

      const tiles = new Map<string, QuadtreeTile>();

      for (let y = paddedMinY; y <= paddedMaxY; y += 1) {
        for (let x = minX - padding; x <= maxX + padding; x += 1) {
          const tile = createQuadtreeTile(moduloTileX(x, count), y, level);
          tiles.set(tile.id, tile);
        }
      }

      if (tiles.size > 0 && tiles.size <= maxTiles) {
        return [...tiles.values()].slice(0, maxTiles);
      }
    }

    return undefined;
  }

  private coverageTilesFromSampleNeighborhoods(
    coveragePositions: readonly (readonly [number, number, number?])[],
    targetLevel: number,
    maxTiles: number,
  ): QuadtreeTile[] | undefined {
    const samples = coveragePositions.filter(
      (position): position is readonly [number, number, number?] =>
        Number.isFinite(position[0]) && Number.isFinite(position[1]),
    );

    if (samples.length === 0 || !Number.isFinite(targetLevel)) {
      return undefined;
    }

    const minLevel = 2;
    const startLevel = Math.max(minLevel, Math.round(targetLevel));
    const minimumLevel = minLevel;
    const altitudeMeters = this.host.cameraAltitudeAboveSurfaceMeters();

    for (let level = startLevel; level >= minimumLevel; level -= 1) {
      const count = this.host.imageryTiling.tileCount(level);
      const padding =
        altitudeMeters <= 2_500
          ? Math.abs(this.host.cameraTiltOffset()) > 0.35
            ? 1
            : 2
          : Math.min(1, this.coveragePaddingForLevel(level));
      const tiles = new Map<string, QuadtreeTile>();
      let overflow = false;

      for (const [lon, lat] of samples) {
        const center = this.host.imageryTiling.positionToTileXY(lon, lat, level);

        for (let y = center.y - padding; y <= center.y + padding; y += 1) {
          if (y < 0 || y >= count) {
            continue;
          }

          for (let x = center.x - padding; x <= center.x + padding; x += 1) {
            const tile = createQuadtreeTile(moduloTileX(x, count), y, level);
            tiles.set(tile.id, tile);

            if (tiles.size > maxTiles) {
              overflow = true;
              break;
            }
          }

          if (overflow) {
            break;
          }
        }

        if (overflow) {
          break;
        }
      }

      if (!overflow && tiles.size > 0) {
        return [...tiles.values()].slice(0, maxTiles);
      }
    }

    return undefined;
  }

  private radentNearGroundMixedCoverage(
    samples: readonly (readonly [number, number, number?])[],
    targetLevel: number,
    maxTiles: number,
  ): QuadtreeTile[] | undefined {
    if (this.host.cameraAltitudeAboveSurfaceMeters() > 80_000 || Math.abs(this.host.cameraTiltOffset()) <= 0.35) {
      return undefined;
    }

    const tiles = new Map<string, QuadtreeTile>();
    const anchorSamples = samples.slice(0, 1);
    const addNeighborhood = (level: number, padding: number): void => {
      const count = this.host.imageryTiling.tileCount(level);

      for (const [lon, lat] of anchorSamples) {
        const center = this.host.imageryTiling.positionToTileXY(lon, lat, level);

        for (let y = Math.max(0, center.y - padding); y <= Math.min(count - 1, center.y + padding); y += 1) {
          for (let x = center.x - padding; x <= center.x + padding; x += 1) {
            const tile = createQuadtreeTile(moduloTileX(x, count), y, level);
            tiles.set(tile.id, tile);
          }
        }
      }
    };

    addNeighborhood(Math.max(2, targetLevel - 5), 3);
    addNeighborhood(Math.max(2, targetLevel - 3), 2);
    addNeighborhood(targetLevel, 1);

    return tiles.size > 0 && tiles.size <= maxTiles ? [...tiles.values()] : undefined;
  }

  private coveragePaddingForLevel(level: number, sampleCompleteness = 1): number {
    const incompleteViewPadding = sampleCompleteness < 0.6 ? 2 : sampleCompleteness < 0.85 ? 1 : 0;

    if (level >= 13) {
      return 3 + incompleteViewPadding;
    }

    if (level >= 10) {
      return 2 + incompleteViewPadding;
    }

    return 1 + incompleteViewPadding;
  }

  private expandCoverageTiles(tiles: readonly QuadtreeTile[], maxTiles: number): QuadtreeTile[] {
    const expanded = new Map<string, QuadtreeTile>();

    for (const tile of tiles) {
      const count = this.host.imageryTiling.tileCount(tile.z);
      const padding = tile.z >= 13 ? 3 : tile.z >= 10 ? 2 : 1;

      for (let y = tile.y - padding; y <= tile.y + padding; y += 1) {
        if (y < 0 || y >= count) {
          continue;
        }

        for (let x = tile.x - padding; x <= tile.x + padding; x += 1) {
          const wrappedX = ((x % count) + count) % count;
          const expandedTile = createQuadtreeTile(wrappedX, y, tile.z);

          if (!expanded.has(expandedTile.id)) {
            expanded.set(expandedTile.id, expandedTile);
          }

          if (expanded.size >= maxTiles) {
            return [...expanded.values()];
          }
        }
      }
    }

    return [...expanded.values()];
  }
}
