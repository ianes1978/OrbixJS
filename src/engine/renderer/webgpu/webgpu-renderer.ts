import { type Renderer, type RendererFrame } from "../interface/renderer";

type NavigatorWithGpu = Navigator & {
  gpu?: unknown;
};

export class WebGPURenderer implements Renderer {
  readonly backend = "webgpu" as const;
  readonly supported: boolean;
  readonly capabilities: Renderer["capabilities"];

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.supported = Boolean((navigator as NavigatorWithGpu).gpu);
    this.capabilities = {
      backend: this.backend,
      maxTextureSize: 0,
      supportsInstancing: this.supported,
      supportsFloatTextures: this.supported,
    };
  }

  resize(): void {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * pixelRatio));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * pixelRatio));

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  render(_frame: RendererFrame): void {
    this.resize();
  }

  destroy(): void {
    // Device/context ownership will be added when the async WebGPU backend is wired.
  }
}
