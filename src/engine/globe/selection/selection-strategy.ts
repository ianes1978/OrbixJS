import { type Mat4 } from "../../core/math/mat4";
import { type Ray } from "../../core/math/ray";
import { type Vec3 } from "../../core/math/vec3";
import { type WebMercatorTilingScheme } from "../tiling/web-mercator-tiling";
import { type QuadtreeTile } from "../imagery/quadtree-tile";
import { type ScreenBounds } from "./coverage-utils";

/**
 * Vista ristretta di GeoViewer di cui una strategia di selezione ha bisogno.
 * Quote in metri, angoli in radianti, cartesiane unit-scale (normalizzate
 * per maximumRadius).
 */
export type TileSelectionHost = {
  readonly imageryTiling: WebMercatorTilingScheme;
  canvasSize(): readonly [number, number];
  cameraFov(): number;
  cameraTiltOffset(): number;
  cameraAltitudeAboveSurfaceMeters(): number;
  cameraDistanceForLod(): number;
  cameraSurfaceStatus(): { lon: number; lat: number };
  lodViewportHeight(): number;
  smoothedCpuMs(): number;
  adaptiveQualityReduction(): number;
  currentViewportSampleCount(): number;
  projectedImageryLevel(): number | undefined;
  pickNormalizedDeviceCoordinate(x: number, y: number): { lon: number; lat: number; height: number } | undefined;
  pickRayFromNdc(x: number, y: number): Ray | undefined;
  nearestVisibleCartographicSample(): [number, number, number] | undefined;
  projectTileScreenBounds(tile: { x: number; y: number; z: number }): ScreenBounds | undefined;
  /** Posizione camera in coordinate unit-scale (normalizzate per maximumRadius). */
  cameraPositionUnit(): Vec3;
  /** View-projection corrente (column-major, float64). */
  viewProjectionMatrix(): Mat4;
};

export type CoverageSelectionInput = {
  maxTiles: number;
  targetLevel?: number;
  coveragePositions: readonly (readonly [number, number, number?])[];
  targetTilePixels: number;
  recordStrategy?: boolean;
};

export type CoverageSelection = {
  tiles: QuadtreeTile[];
  strategy: string;
};

export type TileSelectionStrategy = {
  selectCoverage(input: CoverageSelectionInput): CoverageSelection | undefined;
};
