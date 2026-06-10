import { traverseQuadtree } from "./quadtree-traversal";
import {
  type CoverageSelection,
  type CoverageSelectionInput,
  type TileSelectionHost,
  type TileSelectionStrategy,
} from "../selection/selection-strategy";

/**
 * Strategia di selezione Plan3: un singolo attraversamento di quadtree
 * guidato dallo screen-space error. Sostituisce le euristiche della
 * ClassicSelectionStrategy con un algoritmo deterministico: dettaglio
 * massimo sul terreno più vicino, falloff monotono con la distanza,
 * copertura completa fino all'orizzonte per costruzione.
 */
export class QuadtreeSelectionStrategy implements TileSelectionStrategy {
  constructor(private readonly host: TileSelectionHost) {}

  selectCoverage(input: CoverageSelectionInput): CoverageSelection | undefined {
    const [width, height] = this.host.canvasSize();

    if (width <= 0 || height <= 0 || input.maxTiles <= 0) {
      return undefined;
    }

    const result = traverseQuadtree({
      cameraPositionUnit: this.host.cameraPositionUnit(),
      viewProjection: this.host.viewProjectionMatrix(),
      viewportHeightPx: height,
      fovY: this.host.cameraFov(),
      thresholdPixels: input.targetTilePixels,
      maxLevel: input.targetLevel ?? 22,
      maxTiles: input.maxTiles,
    });

    return result.tiles.length > 0
      ? { tiles: result.tiles.map((selected) => selected.tile), strategy: "sse-quadtree" }
      : undefined;
  }
}
