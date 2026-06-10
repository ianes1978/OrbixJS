import { type Mat4 } from "../../core/math/mat4";
import { type Vec3 } from "../../core/math/vec3";
import { type QuadtreeTile } from "../imagery/quadtree-tile";

/**
 * Vista ristretta di GeoViewer di cui una strategia di selezione ha bisogno.
 * Angoli in radianti, cartesiane unit-scale (normalizzate per maximumRadius).
 */
export type TileSelectionHost = {
  canvasSize(): readonly [number, number];
  cameraFov(): number;
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
