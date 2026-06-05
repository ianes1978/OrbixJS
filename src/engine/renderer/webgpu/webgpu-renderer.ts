import { type Renderer, type RendererFrame } from "../interface/renderer";
import { emptyRendererResourceStats } from "../interface/resource-manager";

type NavigatorWithGpu = Navigator & {
  gpu?: WebGpuLike;
};

type WebGpuLike = {
  requestAdapter(options?: { powerPreference?: "high-performance" | "low-power" }): Promise<WebGpuAdapterLike | null>;
  getPreferredCanvasFormat?: () => string;
};

type WebGpuAdapterLike = {
  limits?: {
    maxTextureDimension2D?: number;
  };
  features?: {
    has(feature: string): boolean;
  };
  requestDevice(): Promise<WebGpuDeviceLike>;
};

type WebGpuDeviceLike = {
  destroy?: () => void;
};

type WebGpuCanvasContextLike = {
  configure(options: {
    device: WebGpuDeviceLike;
    format: string;
    alphaMode?: "opaque" | "premultiplied";
  }): void;
  unconfigure?: () => void;
};

type WebGpuCanvas = HTMLCanvasElement & {
  getContext(contextId: "webgpu"): WebGpuCanvasContextLike | null;
};

export type WebGPURendererOptions = {
  gpu?: WebGpuLike;
  canvasFormat?: string;
};

export class WebGPURenderer implements Renderer {
  readonly backend = "webgpu" as const;
  readonly supported: boolean;
  readonly capabilities: Renderer["capabilities"];
  readonly resourceStats = emptyRendererResourceStats();
  private readonly gpu: WebGpuLike | undefined;
  private adapter: WebGpuAdapterLike | undefined;
  private device: WebGpuDeviceLike | undefined;
  private context: WebGpuCanvasContextLike | undefined;
  private format: string | undefined;
  private initialized = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    options: WebGPURendererOptions = {},
  ) {
    const runtimeNavigator = typeof navigator === "undefined" ? undefined : (navigator as NavigatorWithGpu);
    this.gpu = options.gpu ?? runtimeNavigator?.gpu;
    this.supported = Boolean(this.gpu);
    this.format = options.canvasFormat;
    this.capabilities = {
      backend: this.backend,
      maxTextureSize: 0,
      supportsInstancing: this.supported,
      supportsFloatTextures: this.supported,
    };
  }

  get ready(): boolean {
    return this.initialized;
  }

  async initialize(): Promise<boolean> {
    if (!this.gpu) {
      return false;
    }

    const adapter = await this.gpu.requestAdapter({ powerPreference: "high-performance" });

    if (!adapter) {
      return false;
    }

    const device = await adapter.requestDevice();
    const context = (this.canvas as WebGpuCanvas).getContext("webgpu");

    if (!context) {
      device.destroy?.();
      return false;
    }

    this.adapter = adapter;
    this.device = device;
    this.context = context;
    this.format = this.format ?? this.gpu.getPreferredCanvasFormat?.() ?? "bgra8unorm";
    this.capabilities.maxTextureSize = adapter.limits?.maxTextureDimension2D ?? 0;
    this.capabilities.supportsFloatTextures = adapter.features?.has("float32-filterable") ?? true;
    this.resize();
    this.configureCanvas();
    this.initialized = true;
    return true;
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
    this.context?.unconfigure?.();
    this.device?.destroy?.();
    this.initialized = false;
    this.context = undefined;
    this.device = undefined;
    this.adapter = undefined;
  }

  private configureCanvas(): void {
    if (!this.context || !this.device || !this.format) {
      return;
    }

    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: "opaque",
    });
  }
}
