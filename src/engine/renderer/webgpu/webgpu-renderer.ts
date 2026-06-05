import { type Vec3 } from "../../core/math/vec3";
import { createEllipsoidMesh } from "../../globe/ellipsoid/create-ellipsoid-mesh";
import { createEllipsoidTileMesh } from "../../globe/ellipsoid/create-ellipsoid-tile-mesh";
import { type QuadtreeTile } from "../../globe/imagery/quadtree-tile";
import { multiply } from "../../core/math/mat4";
import { type Renderer, type RendererFrame } from "../interface/renderer";
import { emptyRendererResourceStats } from "../interface/resource-manager";
import { webGpuGlobeProgram, webGpuImageryTileProgram } from "./wgsl-shaders";

const webGpuBufferUsage = {
  vertex: 0x20,
  index: 0x10,
  uniform: 0x40,
  copyDst: 0x08,
} as const;

const webGpuTextureUsage = {
  textureBinding: 0x04,
  copyDst: 0x02,
  renderAttachment: 0x10,
} as const;

const webGpuClipSpaceCorrection = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0.5, 0, 0, 0, 0.5, 1]);
const uniformFloatCount = 20;
const uniformBufferByteLength = uniformFloatCount * Float32Array.BYTES_PER_ELEMENT;

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
    format: "rgba8unorm";
    usage: number;
  }): WebGpuTextureLike;
  createSampler(options: {
    label?: string;
    magFilter: "linear";
    minFilter: "linear";
    mipmapFilter?: "linear";
    addressModeU: "repeat" | "clamp-to-edge";
    addressModeV: "repeat" | "clamp-to-edge";
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
  writeTexture(
    destination: { texture: WebGpuTextureLike },
    data: ArrayBuffer | ArrayBufferView,
    dataLayout: { bytesPerRow: number; rowsPerImage?: number },
    size: [number, number],
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
};

type WebGpuTileEntry = {
  vertexBuffer: WebGpuBufferLike;
  indexBuffer: WebGpuBufferLike;
  uniformBuffer: WebGpuBufferLike;
  texture: WebGpuTextureLike;
  bindGroup?: WebGpuBindGroupLike;
  indexCount: number;
  ready: boolean;
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
  private imageryTexture: WebGpuTextureLike | undefined;
  private imagerySampler: WebGpuSamplerLike | undefined;
  private globeIndexCount = 0;
  private tilePipeline: WebGpuRenderPipelineLike | undefined;
  private readonly tileEntries = new Map<string, WebGpuTileEntry>();
  private readonly activeTileIds = new Set<string>();
  private pendingImagery: TexImageSource | undefined;
  private readonly pendingTileImages = new Map<string, { tile: QuadtreeTile; image: TexImageSource }>();
  private globeImageryReady = false;

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

    this.uploadGlobeImagery(image);
  }

  setImageryTile(tile: QuadtreeTile, image: TexImageSource): void {
    if (!this.device || !this.tilePipeline) {
      this.pendingTileImages.set(tile.id, { tile, image });
      return;
    }

    this.uploadTileImagery(tile, image);
  }

  ensureDebugImageryTile(tile: QuadtreeTile): void {
    if (!this.device) {
      return;
    }

    this.ensureTileEntry(tile);
  }

  setActiveImageryTiles(ids: readonly string[]): void {
    this.activeTileIds.clear();

    for (const id of ids) {
      this.activeTileIds.add(id);
    }
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

  private uploadGlobeImagery(image: TexImageSource): void {
    if (!this.device) {
      return;
    }

    const size = textureSourceSize(image);

    if (!size) {
      return;
    }

    this.imageryTexture?.destroy?.();
    this.imageryTexture = this.device.createTexture({
      label: "OrbixJS WebGPU globe imagery",
      size,
      format: "rgba8unorm",
      usage: webGpuTextureUsage.textureBinding | webGpuTextureUsage.copyDst,
    });
    this.device.queue.copyExternalImageToTexture({ source: image }, { texture: this.imageryTexture }, size);
    this.globeImageryReady = true;
    this.createGlobeBindGroup();
    this.pendingImagery = undefined;
  }

  private uploadTileImagery(tile: QuadtreeTile, image: TexImageSource): void {
    if (!this.device) {
      return;
    }

    const entry = this.ensureTileEntry(tile);
    const size = textureSourceSize(image);

    if (!size) {
      return;
    }

    entry.texture.destroy?.();
    entry.texture = this.device.createTexture({
      label: `OrbixJS WebGPU tile ${tile.id}`,
      size,
      format: "rgba8unorm",
      usage: webGpuTextureUsage.textureBinding | webGpuTextureUsage.copyDst,
    });
    this.device.queue.copyExternalImageToTexture({ source: image }, { texture: entry.texture }, size);
    entry.bindGroup = this.createTextureBindGroup(this.tilePipeline, entry.uniformBuffer, entry.texture, "OrbixJS WebGPU tile bind group");
    entry.ready = true;
    this.pendingTileImages.delete(tile.id);
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
    this.flushPendingImagery();
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
      !this.globeUniformBuffer ||
      !this.tilePipeline
    ) {
      return;
    }

    const aspect = this.canvas.width / this.canvas.height;
    const viewProjection = webGpuViewProjection(frame, aspect);
    writeUniforms(this.device.queue, this.globeUniformBuffer, viewProjection, this.globeImageryReady ? 1 : 0);

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
    });

    pass.setPipeline(this.globePipeline);
    pass.setBindGroup(0, this.globeBindGroup);
    pass.setVertexBuffer(0, this.globeVertexBuffer);
    pass.setIndexBuffer(this.globeIndexBuffer, "uint16");
    pass.drawIndexed(this.globeIndexCount);

    pass.setPipeline(this.tilePipeline);

    for (const id of this.activeTileIds) {
      const entry = this.tileEntries.get(id);

      if (!entry?.ready || !entry.bindGroup) {
        continue;
      }

      writeUniforms(this.device.queue, entry.uniformBuffer, viewProjection, 1);
      pass.setBindGroup(0, entry.bindGroup);
      pass.setVertexBuffer(0, entry.vertexBuffer);
      pass.setIndexBuffer(entry.indexBuffer, "uint16");
      pass.drawIndexed(entry.indexCount);
    }

    pass.end();

    this.device.queue.submit([encoder.finish()]);
  }

  destroy(): void {
    this.context?.unconfigure?.();
    this.globeVertexBuffer?.destroy?.();
    this.globeIndexBuffer?.destroy?.();
    this.globeUniformBuffer?.destroy?.();
    this.imageryTexture?.destroy?.();
    for (const entry of this.tileEntries.values()) {
      entry.vertexBuffer.destroy?.();
      entry.indexBuffer.destroy?.();
      entry.uniformBuffer.destroy?.();
      entry.texture.destroy?.();
    }
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
    this.imageryTexture = undefined;
    this.imagerySampler = undefined;
    this.globeIndexCount = 0;
    this.globeImageryReady = false;
    this.tilePipeline = undefined;
    this.tileEntries.clear();
    this.activeTileIds.clear();
    this.pendingImagery = undefined;
    this.pendingTileImages.clear();
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
    const tileVertexModule = this.device.createShaderModule({
      label: webGpuImageryTileProgram.vertex.id,
      code: webGpuImageryTileProgram.vertex.source,
    });
    const tileFragmentModule = this.device.createShaderModule({
      label: webGpuImageryTileProgram.fragment.id,
      code: webGpuImageryTileProgram.fragment.source,
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
      size: uniformBufferByteLength,
      usage: webGpuBufferUsage.uniform | webGpuBufferUsage.copyDst,
    });
    this.imagerySampler = this.device.createSampler({
      label: "OrbixJS WebGPU imagery sampler",
      magFilter: "linear",
      minFilter: "linear",
      mipmapFilter: "linear",
      addressModeU: "repeat",
      addressModeV: "clamp-to-edge",
    });
    this.imageryTexture = this.createPlaceholderTexture();
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
              { shaderLocation: 2, offset: 9 * Float32Array.BYTES_PER_ELEMENT, format: "float32x2" },
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
    });
    this.tilePipeline = this.createTilePipeline(tileVertexModule, tileFragmentModule);
    this.createGlobeBindGroup();
    this.globeIndexCount = mesh.indices.length;
  }

  private createPlaceholderTexture(): WebGpuTextureLike | undefined {
    if (!this.device) {
      return undefined;
    }

    const texture = this.device.createTexture({
      label: "OrbixJS WebGPU placeholder imagery",
      size: [1, 1],
      format: "rgba8unorm",
      usage: webGpuTextureUsage.textureBinding | webGpuTextureUsage.copyDst,
    });
    const data = new Uint8Array(256);
    data.set([20, 118, 142, 255]);
    this.device.queue.writeTexture({ texture }, data, { bytesPerRow: 256, rowsPerImage: 1 }, [1, 1]);
    return texture;
  }

  private createGlobeBindGroup(): void {
    if (!this.device || !this.globePipeline || !this.globeUniformBuffer || !this.imagerySampler || !this.imageryTexture) {
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

  private createTilePipeline(vertexModule: WebGpuShaderModuleLike, fragmentModule: WebGpuShaderModuleLike): WebGpuRenderPipelineLike | undefined {
    if (!this.device || !this.format) {
      return undefined;
    }

    return this.device.createRenderPipeline({
      label: "OrbixJS WebGPU imagery tile pipeline",
      layout: "auto",
      vertex: {
        module: vertexModule,
        entryPoint: "main",
        buffers: [
          {
            arrayStride: 8 * Float32Array.BYTES_PER_ELEMENT,
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x3" },
              { shaderLocation: 1, offset: 3 * Float32Array.BYTES_PER_ELEMENT, format: "float32x3" },
              { shaderLocation: 2, offset: 6 * Float32Array.BYTES_PER_ELEMENT, format: "float32x2" },
            ],
          },
        ],
      },
      fragment: {
        module: fragmentModule,
        entryPoint: "main",
        targets: [
          {
            format: this.format,
            blend: {
              color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
              alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
            },
          },
        ],
      },
      primitive: {
        topology: "triangle-list",
        cullMode: "none",
      },
    });
  }

  private ensureTileEntry(tile: QuadtreeTile): WebGpuTileEntry {
    if (!this.device) {
      throw new Error("WebGPU is not available");
    }

    const existing = this.tileEntries.get(tile.id);

    if (existing) {
      return existing;
    }

    const mesh = createEllipsoidTileMesh(tile);
    const vertexBuffer = this.device.createBuffer({
      label: `OrbixJS WebGPU tile vertices ${tile.id}`,
      size: mesh.vertices.byteLength,
      usage: webGpuBufferUsage.vertex | webGpuBufferUsage.copyDst,
    });
    const indexBuffer = this.device.createBuffer({
      label: `OrbixJS WebGPU tile indices ${tile.id}`,
      size: mesh.indices.byteLength,
      usage: webGpuBufferUsage.index | webGpuBufferUsage.copyDst,
    });
    const uniformBuffer = this.device.createBuffer({
      label: `OrbixJS WebGPU tile uniforms ${tile.id}`,
      size: uniformBufferByteLength,
      usage: webGpuBufferUsage.uniform | webGpuBufferUsage.copyDst,
    });
    const texture = this.createPlaceholderTexture();

    if (!texture) {
      throw new Error("Unable to allocate WebGPU tile texture");
    }

    this.device.queue.writeBuffer(vertexBuffer, 0, mesh.vertices);
    this.device.queue.writeBuffer(indexBuffer, 0, mesh.indices);

    const entry: WebGpuTileEntry = {
      vertexBuffer,
      indexBuffer,
      uniformBuffer,
      texture,
      bindGroup: this.createTextureBindGroup(this.tilePipeline, uniformBuffer, texture, "OrbixJS WebGPU tile bind group"),
      indexCount: mesh.indices.length,
      ready: false,
    };
    this.tileEntries.set(tile.id, entry);
    return entry;
  }

  private createTextureBindGroup(
    pipeline: WebGpuRenderPipelineLike | undefined,
    uniformBuffer: WebGpuBufferLike,
    texture: WebGpuTextureLike,
    label: string,
  ): WebGpuBindGroupLike | undefined {
    if (!this.device || !this.imagerySampler || !pipeline) {
      return undefined;
    }

    return this.device.createBindGroup({
      label,
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: {
            buffer: uniformBuffer,
          },
        },
        {
          binding: 1,
          resource: this.imagerySampler,
        },
        {
          binding: 2,
          resource: texture.createView(),
        },
      ],
    });
  }

  private flushPendingImagery(): void {
    if (this.pendingImagery) {
      this.uploadGlobeImagery(this.pendingImagery);
    }

    for (const { tile, image } of this.pendingTileImages.values()) {
      this.uploadTileImagery(tile, image);
    }
  }
}

function textureSourceSize(source: TexImageSource): [number, number] | undefined {
  const candidate = source as { naturalWidth?: unknown; naturalHeight?: unknown; width?: unknown; height?: unknown };
  const width = typeof candidate.naturalWidth === "number" ? candidate.naturalWidth : candidate.width;
  const height = typeof candidate.naturalHeight === "number" ? candidate.naturalHeight : candidate.height;

  if (typeof width !== "number" || typeof height !== "number" || width <= 0 || height <= 0) {
    return undefined;
  }

  return [width, height];
}

function webGpuViewProjection(frame: RendererFrame, aspect: number): Float32Array {
  return multiply(webGpuClipSpaceCorrection, multiply(frame.camera.projectionMatrix(aspect), frame.camera.viewMatrix()));
}

function writeUniforms(queue: WebGpuQueueLike, buffer: WebGpuBufferLike, viewProjection: Float32Array, imageryReady: number): void {
  const uniforms = new Float32Array(uniformFloatCount);
  uniforms.set(viewProjection, 0);
  uniforms[16] = imageryReady;
  queue.writeBuffer(buffer, 0, uniforms);
}
