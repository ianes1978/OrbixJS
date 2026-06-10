import {
  ImageryLayer,
  type ImageryLayerStats,
  type ImageryLayerUpdateContext,
  type ImageryTexture,
  type RasterTileImage,
} from "./imagery-layer";
import { type QuadtreeTile } from "./quadtree-tile";
import { type RasterTileProvider } from "./tile-provider";
import { WMTSTileProvider, type WMTSTileProviderOptions } from "./wmts-tile-provider";
import { XYZTileProvider, type XYZTileProviderOptions } from "./xyz-tile-provider";

export type ImageryLayerCollectionOptions = {
  onTextureReady?: (texture: ImageryTexture) => void;
  onTileReady?: (tile: QuadtreeTile, image: RasterTileImage) => void;
  onActiveTilesChanged?: (ids: string[]) => void;
  onLayerError?: (error: unknown) => void;
};

export class ImageryLayerCollection {
  private readonly layers: ImageryLayer[] = [];

  constructor(private readonly options: ImageryLayerCollectionOptions) {}

  addXYZLayer(options: XYZTileProviderOptions & { level?: number; minLevel?: number; maxLevel?: number }): ImageryLayer {
    const provider = new XYZTileProvider(options);
    return this.addLayer(provider, options);
  }

  addWMTSLayer(options: WMTSTileProviderOptions & { level?: number; minLevel?: number; maxLevel?: number }): ImageryLayer {
    const provider = new WMTSTileProvider(options);
    return this.addLayer(provider, options);
  }

  addRasterLayer(provider: RasterTileProvider, options: { level?: number; minLevel?: number; maxLevel?: number } = {}): ImageryLayer {
    return this.addLayer(provider, options);
  }

  clear(): void {
    this.layers.length = 0;
    this.options.onActiveTilesChanged?.([]);
  }

  private addLayer(provider: RasterTileProvider, options: { level?: number; minLevel?: number; maxLevel?: number }): ImageryLayer {
    const layer = new ImageryLayer(provider, options.level ?? 2, {
      minLevel: options.minLevel,
      maxLevel: options.maxLevel,
      onTileReady: (tile, image) => this.options.onTileReady?.(tile, image),
      onTileError: (_tile, error) => this.options.onLayerError?.(error),
    });
    this.layers.push(layer);

    void layer
      .createTexture()
      .then((texture) => this.options.onTextureReady?.(texture))
      .catch((error: unknown) => this.options.onLayerError?.(error));

    return layer;
  }

  update(
    center: readonly [number, number, number],
    cameraDistance: number,
    context: ImageryLayerUpdateContext = {},
  ): ImageryLayerStats | undefined {
    const layer = this.layers[0];

    if (!layer) {
      return undefined;
    }

    const stats = layer.update(center[0], center[1], cameraDistance, context);
    this.options.onActiveTilesChanged?.(layer.activeTileIds);
    return stats;
  }

  get size(): number {
    return this.layers.length;
  }

  findTile(id: string): QuadtreeTile | undefined {
    return this.layers[0]?.findActiveTile(id);
  }
}
