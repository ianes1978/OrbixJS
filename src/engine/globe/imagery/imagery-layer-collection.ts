import { ImageryLayer, type ImageryLayerStats, type ImageryTexture } from "./imagery-layer";
import { type QuadtreeTile } from "./quadtree-tile";
import { type RasterTileProvider } from "./tile-provider";
import { WMTSTileProvider, type WMTSTileProviderOptions } from "./wmts-tile-provider";
import { XYZTileProvider, type XYZTileProviderOptions } from "./xyz-tile-provider";

export type ImageryLayerCollectionOptions = {
  onTextureReady?: (texture: ImageryTexture) => void;
  onTileReady?: (tile: QuadtreeTile, image: HTMLImageElement) => void;
  onActiveTilesChanged?: (ids: string[]) => void;
  onLayerError?: (error: unknown) => void;
};

export class ImageryLayerCollection {
  private readonly layers: ImageryLayer[] = [];

  constructor(private readonly options: ImageryLayerCollectionOptions) {}

  addXYZLayer(options: XYZTileProviderOptions & { level?: number }): ImageryLayer {
    const provider = new XYZTileProvider(options);
    return this.addLayer(provider, options.level);
  }

  addWMTSLayer(options: WMTSTileProviderOptions & { level?: number }): ImageryLayer {
    const provider = new WMTSTileProvider(options);
    return this.addLayer(provider, options.level);
  }

  private addLayer(provider: RasterTileProvider, level = 2): ImageryLayer {
    const layer = new ImageryLayer(provider, level, {
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

  update(center: readonly [number, number, number], cameraDistance: number): ImageryLayerStats | undefined {
    const layer = this.layers[0];

    if (!layer) {
      return undefined;
    }

    const stats = layer.update(center[0], center[1], cameraDistance);
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
