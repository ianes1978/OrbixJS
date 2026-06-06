import { type Vec3 } from "../../core/math/vec3";
import { createEllipsoidMesh } from "../../globe/ellipsoid/create-ellipsoid-mesh";
import { type QuadtreeTile } from "../../globe/imagery/quadtree-tile";
import { multiply } from "../../core/math/mat4";
import { type Renderer, type RendererFrame } from "../interface/renderer";
import { emptyRendererResourceStats } from "../interface/resource-manager";
import { webGpuGlobeProgram } from "./wgsl-shaders";

const webGpuBufferUsage = {
  vertex: 0x20,
  index: 0x10,
  uniform: 0x40,
  copyDst: 0x08,
} as const;

const webGpuTextureUsage = {
  copyDst: 0x02,
  textureBinding: 0x04,
  renderAttachment: 0x10,
} as const;

const webGpuDepthFormat = "depth24plus";
const webGpuImageryFormat = "rgba8unorm";

const webGpuClipSpaceCorrection = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0.5, 0, 0, 0, 0.5, 1]);

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
  queue: WebGpuQueueLike;
  createShaderModule(options: { label?: string; code: string }): WebGpuShaderModuleLike;
  createRenderPipeline(options: WebGpuRenderPipelineDescriptorLike): WebGpuRenderPipelineLike;
  createBuffer(options: { label?: string; size: number; usage: number }): WebGpuBufferLike;
  createTexture(options: {
    label?: string;
    size: [number, number];
    format: typeof webGpuDepthFormat | typeof webGpuImageryFormat;
    usage: number;
  }): WebGpuTextureLike;
  createSampler(options: {
    label?: string;
    magFilter: "linear";
    minFilter: "linear";
    addressModeU: "clamp-to-edge";
    addressModeV: "clamp-to-edge";
  }): WebGpuSamplerLike;
  createBindGroup(options: {
    label?: string;
    layout: unknown;
    entries: Array<{
      binding: number;
      resource: unknown;
    }>;
  }): WebGpuBindGroupLike;
  createCommandEncoder(options?: { label?: string }): WebGpuCommandEncoderLike;
  destroy?: () => void;
};

type WebGpuCanvasContextLike = {
  configure(options: {
    device: WebGpuDeviceLike;
    format: string;
    alphaMode?: "opaque" | "premultiplied";
  }): void;
  getCurrentTexture(): {
    createView(): unknown;
  };
  unconfigure?: () => void;
};

type WebGpuQueueLike = {
  writeBuffer(
    buffer: WebGpuBufferLike,
    bufferOffset: number,
    data: ArrayBuffer | ArrayBufferView,
    dataOffset?: number,
    size?: number,
  ): void;
  copyExternalImageToTexture(
    source: { source: TexImageSource },
    destination: { texture: WebGpuTextureLike },
    copySize: [number, number],
  ): void;
  submit(commandBuffers: readonly unknown[]): void;
};

type WebGpuShaderModuleLike = unknown;

type WebGpuBufferLike = {
  destroy?: () => void;
};

type WebGpuTextureLike = {
  createView(): unknown;
  destroy?: () => void;
};

type WebGpuSamplerLike = unknown;

type WebGpuRenderPipelineLike = {
  getBindGroupLayout(index: number): unknown;
};

type WebGpuBindGroupLike = unknown;

type WebGpuCommandEncoderLike = {
  beginRenderPass(options: {
    label?: string;
    colorAttachments: Array<{
      view: unknown;
      clearValue: { r: number; g: number; b: number; a: number };
      loadOp: "clear";
      storeOp: "store";
    }>;
    depthStencilAttachment?: {
      view: unknown;
      depthClearValue: number;
      depthLoadOp: "clear";
      depthStoreOp: "store";
    };
  }): WebGpuRenderPassEncoderLike;
  finish(): unknown;
};

type WebGpuRenderPassEncoderLike = {
  setPipeline(pipeline: WebGpuRenderPipelineLike): void;
  setBindGroup(index: number, bindGroup: WebGpuBindGroupLike): void;
  setVertexBuffer(slot: number, buffer: WebGpuBufferLike): void;
  setIndexBuffer(buffer: WebGpuBufferLike, indexFormat: "uint16"): void;
  drawIndexed(indexCount: number): void;
  end(): void;
};

type WebGpuRenderPipelineDescriptorLike = {
  label?: string;
  layout: "auto";
  vertex: {
    module: WebGpuShaderModuleLike;
    entryPoint: string;
    buffers: Array<{
      arrayStride: number;
      attributes: Array<{
        shaderLocation: number;
        offset: number;
        format: "float32x2" | "float32x3";
      }>;
    }>;
  };
  fragment: {
    module: WebGpuShaderModuleLike;
    entryPoint: string;
    targets: Array<{
      format: string;
      blend?: {
        color: {
          srcFactor: "src-alpha";
          dstFactor: "one-minus-src-alpha";
          operation: "add";
        };
        alpha: {
          srcFactor: "one";
          dstFactor: "one-minus-src-alpha";
          operation: "add";
        };
      };
    }>;
  };
  primitive: {
    topology: "triangle-list";
    cullMode: "back" | "none";
  };
  depthStencil?: {
    format: typeof webGpuDepthFormat;
    depthWriteEnabled: boolean;
    depthCompare: "less";
  };
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
  private globePipeline: WebGpuRenderPipelineLike | undefined;
  private globeBindGroup: WebGpuBindGroupLike | undefined;
  private globeVertexBuffer: WebGpuBufferLike | undefined;
  private globeIndexBuffer: WebGpuBufferLike | undefined;
  private globeUniformBuffer: WebGpuBufferLike | undefined;
  private depthTexture: WebGpuTextureLike | undefined;
  private depthTextureSize: readonly [number, number] | undefined;
  private imageryTexture: WebGpuTextureLike | undefined;
  private imagerySampler: WebGpuSamplerLike | undefined;
  private imageryTextureSize: readonly [number, number] | undefined;
  private imageryReady = false;
  private pendingImagery: TexImageSource | undefined;
  private globeIndexCount = 0;

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

  setImagery(image: TexImageSource): void {
    if (!this.device || !this.globePipeline) {
      this.pendingImagery = image;
      return;
    }

    this.uploadImagery(image);
  }

  setImageryTile(_tile: QuadtreeTile, _image: TexImageSource): void {
    // WebGPU imagery is intentionally disabled until the texture path is reintroduced safely.
  }

  ensureDebugImageryTile(_tile: QuadtreeTile): void {
    // WebGPU imagery is intentionally disabled until the texture path is reintroduced safely.
  }

  setActiveImageryTiles(_ids: readonly string[]): void {
    // WebGPU imagery is intentionally disabled until the texture path is reintroduced safely.
  }

  setVectorLines(_lines: readonly (readonly [number, number])[][]): void {
    // Vector overlay support is WebGL2-only for now.
  }

  setVectorLinesVisible(_visible: boolean): void {
    // Vector overlay support is WebGL2-only for now.
  }

  setDebugModelVisible(_visible: boolean): void {
    // Model rendering support is WebGL2-only for now.
  }

  setDebugModelMesh(_mesh: {
    positions: Float32Array;
    texcoords?: Float32Array;
    indices?: Uint16Array | Uint32Array;
    lon: number;
    lat: number;
    height?: number;
    scale?: number;
    baseColorFactor?: [number, number, number, number];
    baseColorTexture?: TexImageSource;
  }): void {
    // Model rendering support is WebGL2-only for now.
  }

  setSunDirection(_direction: Vec3): void {
    // Sun uniforms land after the first textured WebGPU pass.
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
    this.createGlobeResources();
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

    this.ensureDepthTexture();
  }

  render(frame: RendererFrame): void {
    this.resize();

    if (
      !this.initialized ||
      !this.device ||
      !this.context ||
      !this.globePipeline ||
      !this.globeBindGroup ||
      !this.globeVertexBuffer ||
      !this.globeIndexBuffer ||
      !this.globeUniformBuffer
    ) {
      return;
    }
    this.ensureDepthTexture();

    const aspect = this.canvas.width / this.canvas.height;
    const uniforms = createGlobeUniforms(webGpuViewProjection(frame, aspect), this.imageryReady);
    this.device.queue.writeBuffer(this.globeUniformBuffer, 0, uniforms);

    const view = this.context.getCurrentTexture().createView();
    const encoder = this.device.createCommandEncoder({ label: "OrbixJS WebGPU frame" });
    const pass = encoder.beginRenderPass({
      label: "OrbixJS WebGPU globe pass",
      colorAttachments: [
        {
          view,
          clearValue: { r: 0.012, g: 0.022, b: 0.028, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
      depthStencilAttachment: this.depthTexture
        ? {
            view: this.depthTexture.createView(),
            depthClearValue: 1,
            depthLoadOp: "clear",
            depthStoreOp: "store",
          }
        : undefined,
    });

    pass.setPipeline(this.globePipeline);
    pass.setBindGroup(0, this.globeBindGroup);
    pass.setVertexBuffer(0, this.globeVertexBuffer);
    pass.setIndexBuffer(this.globeIndexBuffer, "uint16");
    pass.drawIndexed(this.globeIndexCount);
    pass.end();

    this.device.queue.submit([encoder.finish()]);
  }

  destroy(): void {
    this.context?.unconfigure?.();
    this.globeVertexBuffer?.destroy?.();
    this.globeIndexBuffer?.destroy?.();
    this.globeUniformBuffer?.destroy?.();
    this.depthTexture?.destroy?.();
    this.imageryTexture?.destroy?.();
    this.device?.destroy?.();
    this.initialized = false;
    this.context = undefined;
    this.device = undefined;
    this.adapter = undefined;
    this.globePipeline = undefined;
    this.globeBindGroup = undefined;
    this.globeVertexBuffer = undefined;
    this.globeIndexBuffer = undefined;
    this.globeUniformBuffer = undefined;
    this.depthTexture = undefined;
    this.depthTextureSize = undefined;
    this.imageryTexture = undefined;
    this.imagerySampler = undefined;
    this.imageryTextureSize = undefined;
    this.imageryReady = false;
    this.pendingImagery = undefined;
    this.globeIndexCount = 0;
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

  private createGlobeResources(): void {
    if (!this.device || !this.format) {
      return;
    }

    const mesh = createEllipsoidMesh();
    const vertexModule = this.device.createShaderModule({
      label: webGpuGlobeProgram.vertex.id,
      code: webGpuGlobeProgram.vertex.source,
    });
    const fragmentModule = this.device.createShaderModule({
      label: webGpuGlobeProgram.fragment.id,
      code: webGpuGlobeProgram.fragment.source,
    });
    this.globeVertexBuffer = this.device.createBuffer({
      label: "OrbixJS globe vertices",
      size: mesh.vertices.byteLength,
      usage: webGpuBufferUsage.vertex | webGpuBufferUsage.copyDst,
    });
    this.globeIndexBuffer = this.device.createBuffer({
      label: "OrbixJS globe indices",
      size: mesh.indices.byteLength,
      usage: webGpuBufferUsage.index | webGpuBufferUsage.copyDst,
    });
    this.globeUniformBuffer = this.device.createBuffer({
      label: "OrbixJS globe uniforms",
      size: 20 * Float32Array.BYTES_PER_ELEMENT,
      usage: webGpuBufferUsage.uniform | webGpuBufferUsage.copyDst,
    });
    this.device.queue.writeBuffer(this.globeVertexBuffer, 0, mesh.vertices);
    this.device.queue.writeBuffer(this.globeIndexBuffer, 0, mesh.indices);

    this.globePipeline = this.device.createRenderPipeline({
      label: "OrbixJS WebGPU globe pipeline",
      layout: "auto",
      vertex: {
        module: vertexModule,
        entryPoint: "main",
        buffers: [
          {
            arrayStride: mesh.vertexStride * Float32Array.BYTES_PER_ELEMENT,
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x3" },
              { shaderLocation: 1, offset: 3 * Float32Array.BYTES_PER_ELEMENT, format: "float32x3" },
              { shaderLocation: 2, offset: 6 * Float32Array.BYTES_PER_ELEMENT, format: "float32x3" },
              { shaderLocation: 3, offset: 9 * Float32Array.BYTES_PER_ELEMENT, format: "float32x2" },
            ],
          },
        ],
      },
      fragment: {
        module: fragmentModule,
        entryPoint: "main",
        targets: [{ format: this.format }],
      },
      primitive: {
        topology: "triangle-list",
        cullMode: "none",
      },
      depthStencil: {
        format: webGpuDepthFormat,
        depthWriteEnabled: true,
        depthCompare: "less",
      },
    });
    this.createGlobeBindGroup();
    this.globeIndexCount = mesh.indices.length;

    if (this.pendingImagery) {
      this.uploadImagery(this.pendingImagery);
      this.pendingImagery = undefined;
    }
  }

  private ensureDepthTexture(): void {
    if (!this.device || this.canvas.width <= 0 || this.canvas.height <= 0) {
      return;
    }

    const size = [this.canvas.width, this.canvas.height] as const;

    if (this.depthTexture && this.depthTextureSize?.[0] === size[0] && this.depthTextureSize[1] === size[1]) {
      return;
    }

    this.depthTexture?.destroy?.();
    this.depthTexture = this.device.createTexture({
      label: "OrbixJS WebGPU depth texture",
      size: [size[0], size[1]],
      format: webGpuDepthFormat,
      usage: webGpuTextureUsage.renderAttachment,
    });
    this.depthTextureSize = size;
  }

  private createGlobeBindGroup(): void {
    if (!this.device || !this.globePipeline || !this.globeUniformBuffer) {
      return;
    }

    this.ensureImageryResources();

    if (!this.imagerySampler || !this.imageryTexture) {
      return;
    }

    this.globeBindGroup = this.device.createBindGroup({
      label: "OrbixJS globe bind group",
      layout: this.globePipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this.globeUniformBuffer,
          },
        },
        {
          binding: 1,
          resource: this.imagerySampler,
        },
        {
          binding: 2,
          resource: this.imageryTexture.createView(),
        },
      ],
    });
  }

  private ensureImageryResources(size: readonly [number, number] = [1, 1]): void {
    if (!this.device) {
      return;
    }

    if (!this.imagerySampler) {
      this.imagerySampler = this.device.createSampler({
        label: "OrbixJS WebGPU imagery sampler",
        magFilter: "linear",
        minFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });
    }

    if (this.imageryTexture && this.imageryTextureSize?.[0] === size[0] && this.imageryTextureSize[1] === size[1]) {
      return;
    }

    this.imageryTexture?.destroy?.();
    this.imageryTexture = this.device.createTexture({
      label: "OrbixJS WebGPU imagery texture",
      size: [size[0], size[1]],
      format: webGpuImageryFormat,
      usage: webGpuTextureUsage.textureBinding | webGpuTextureUsage.copyDst,
    });
    this.imageryTextureSize = [size[0], size[1]];
    this.createGlobeBindGroup();
  }

  private uploadImagery(image: TexImageSource): void {
    if (!this.device) {
      this.pendingImagery = image;
      return;
    }

    const size = imageSize(image);
    this.ensureImageryResources(size);

    if (!this.imageryTexture) {
      return;
    }

    this.device.queue.copyExternalImageToTexture({ source: image }, { texture: this.imageryTexture }, [size[0], size[1]]);
    this.imageryReady = true;
    this.createGlobeBindGroup();
  }
}

function webGpuViewProjection(frame: RendererFrame, aspect: number): Float32Array {
  return multiply(webGpuClipSpaceCorrection, multiply(frame.camera.projectionMatrix(aspect), frame.camera.viewMatrix()));
}

function createGlobeUniforms(viewProjection: Float32Array, imageryReady: boolean): Float32Array {
  const uniforms = new Float32Array(20);
  uniforms.set(viewProjection, 0);
  uniforms[16] = imageryReady ? 1 : 0;
  return uniforms;
}

function imageSize(image: TexImageSource): [number, number] {
  const source = image as {
    width?: number;
    height?: number;
    videoWidth?: number;
    videoHeight?: number;
    naturalWidth?: number;
    naturalHeight?: number;
  };
  const width = source.videoWidth ?? source.naturalWidth ?? source.width ?? 1;
  const height = source.videoHeight ?? source.naturalHeight ?? source.height ?? 1;

  return [Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height))];
}
