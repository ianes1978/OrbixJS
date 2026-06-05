import { ImageryLayer, type ImageryTexture } from "./imagery-layer";
import { XYZTileProvider, type XYZTileProviderOptions } from "./xyz-tile-provider";

export type ImageryLayerCollectionOptions = {
  onTextureReady: (texture: ImageryTexture) => void;
  onLayerError?: (error: unknown) => void;
};

export class ImageryLayerCollection {
  private readonly layers: ImageryLayer[] = [];

  constructor(private readonly options: ImageryLayerCollectionOptions) {}

  addXYZLayer(options: XYZTileProviderOptions & { level?: number }): ImageryLayer {
    const provider = new XYZTileProvider(options);
    const layer = new ImageryLayer(provider, options.level ?? 2);
    this.layers.push(layer);

    void layer
      .createTexture()
      .then((texture) => this.options.onTextureReady(texture))
      .catch((error: unknown) => this.options.onLayerError?.(error));

    return layer;
  }

  get size(): number {
    return this.layers.length;
  }
}
