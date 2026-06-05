import { type Vec3 } from "../../core/math/vec3";
import { ImageryLayer, type ImageryLayerStats, type ImageryTexture } from "./imagery-layer";
import { type QuadtreeTile } from "./quadtree-tile";
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
    const layer = new ImageryLayer(provider, options.level ?? 2, {
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

  update(cameraPosition: Vec3, cameraDistance: number): ImageryLayerStats | undefined {
    const layer = this.layers[0];

    if (!layer) {
      return undefined;
    }

    const stats = layer.update(cameraPosition, cameraDistance);
    this.options.onActiveTilesChanged?.(layer.activeTileIds);
    return stats;
  }

  get size(): number {
    return this.layers.length;
  }
}
