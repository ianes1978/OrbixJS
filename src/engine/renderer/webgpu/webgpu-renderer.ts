import { Ellipsoid } from "../../core/geodesy/ellipsoid";
import { createLocalFrameENU, localEnuToRenderUnit } from "../../core/geodesy/local-frame";
import { type Vec3 } from "../../core/math/vec3";
import { createEllipsoidMesh } from "../../globe/ellipsoid/create-ellipsoid-mesh";
import { createEllipsoidTileMesh } from "../../globe/ellipsoid/create-ellipsoid-tile-mesh";
import { type QuadtreeTile } from "../../globe/imagery/quadtree-tile";
import { type TerrainHeightmapTile } from "../../globe/terrain/terrain-provider";
import { type TerrainSurfaceMeshEntry } from "../../globe/terrain/terrain-surface-runtime";
import { multiply } from "../../core/math/mat4";
import { type Renderer, type RendererFrame } from "../interface/renderer";
import { emptyRendererResourceStats } from "../interface/resource-manager";
import {
  parseTerrainImageryTileId,
  resolveTerrainImageryFallback,
  terrainTileCanReplaceImageryTile,
} from "../terrain-imagery-fallback";
import {
  webGpuGlobeProgram,
  webGpuImageryTileProgram,
  webGpuModelProgram,
  webGpuTerrainProgram,
  webGpuVectorLineProgram,
} from "./wgsl-shaders";

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
const webGpuHeightmapFormat = "r32float";

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
    format: typeof webGpuDepthFormat | typeof webGpuImageryFormat | typeof webGpuHeightmapFormat;
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
  writeTexture(
    destination: { texture: WebGpuTextureLike },
    data: ArrayBuffer | ArrayBufferView,
    dataLayout: { bytesPerRow: number; rowsPerImage?: number },
    size: [number, number],
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
  setIndexBuffer(buffer: WebGpuBufferLike, indexFormat: "uint16" | "uint32"): void;
  draw(vertexCount: number): void;
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
    topology: "triangle-list" | "line-list";
    cullMode: "back" | "none";
  };
  depthStencil?: {
    format: typeof webGpuDepthFormat;
    depthWriteEnabled: boolean;
    depthCompare: "less" | "less-equal";
  };
};

type WebGpuTileEntry = {
  vertexBuffer: WebGpuBufferLike;
  indexBuffer: WebGpuBufferLike;
  texture: WebGpuTextureLike;
  bindGroup: WebGpuBindGroupLike;
  indexCount: number;
  ready: boolean;
};

type WebGpuModelEntry = {
  vertexBuffer: WebGpuBufferLike;
  indexBuffer: WebGpuBufferLike;
  indexCount: number;
  indexFormat: "uint16" | "uint32";
};

type WebGpuTerrainEntry = {
  tile: TerrainHeightmapTile;
  heightmapTexture: WebGpuTextureLike;
  uniformBuffer: WebGpuBufferLike;
  bindGroup?: WebGpuBindGroupLike;
  bindGroupTexture?: WebGpuTextureLike;
  bindGroupKey?: string;
  exaggeration: number;
  skirtDepth: number;
};

type WebGpuTerrainPatchEntry = {
  vertexBuffer: WebGpuBufferLike;
  indexBuffer: WebGpuBufferLike;
  indexCount: number;
  indexFormat: "uint16" | "uint32";
};

type WebGpuDebugModelMesh = {
  positions: Float32Array;
  texcoords?: Float32Array;
  indices?: Uint16Array | Uint32Array;
  lon: number;
  lat: number;
  height?: number;
  scale?: number;
  baseColorFactor?: [number, number, number, number];
  baseColorTexture?: TexImageSource;
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
  private tilePipeline: WebGpuRenderPipelineLike | undefined;
  private terrainPipeline: WebGpuRenderPipelineLike | undefined;
  private vectorPipeline: WebGpuRenderPipelineLike | undefined;
  private modelPipeline: WebGpuRenderPipelineLike | undefined;
  private globeBindGroup: WebGpuBindGroupLike | undefined;
  private vectorBindGroup: WebGpuBindGroupLike | undefined;
  private modelBindGroup: WebGpuBindGroupLike | undefined;
  private globeVertexBuffer: WebGpuBufferLike | undefined;
  private globeIndexBuffer: WebGpuBufferLike | undefined;
  private globeUniformBuffer: WebGpuBufferLike | undefined;
  private modelUniformBuffer: WebGpuBufferLike | undefined;
  private vectorVertexBuffer: WebGpuBufferLike | undefined;
  private vectorVertexCount = 0;
  private vectorLinesVisible = false;
  private debugModel: WebGpuModelEntry | undefined;
  private debugModelVisible = false;
  private tileDebugOverlayVisible = false;
  private debugModelBaseColorFactor: [number, number, number, number] = [1, 0.75, 0.15, 1];
  private depthTexture: WebGpuTextureLike | undefined;
  private depthTextureSize: readonly [number, number] | undefined;
  private imageryTexture: WebGpuTextureLike | undefined;
  private imagerySampler: WebGpuSamplerLike | undefined;
  private imageryTextureSize: readonly [number, number] | undefined;
  private imageryReady = false;
  private pendingImagery: TexImageSource | undefined;
  private pendingVectorLines: readonly (readonly [number, number])[][] | undefined;
  private pendingDebugModelMesh: WebGpuDebugModelMesh | undefined;
  private pendingTerrainMeshes: readonly TerrainSurfaceMeshEntry[] | undefined;
  private readonly pendingTileImages = new Map<string, { tile: QuadtreeTile; image: TexImageSource }>();
  private readonly tileEntries = new Map<string, WebGpuTileEntry>();
  private readonly terrainEntries = new Map<string, WebGpuTerrainEntry>();
  private readonly terrainPatchMeshes = new Map<string, WebGpuTerrainPatchEntry>();
  private activeTileIds: readonly string[] = [];
  private activeTerrainIds: readonly string[] = [];
  private surfaceFallbackVisible = false;
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
      supportsTerrainHeightmapDisplacement: this.supported,
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

  setImageryTile(tile: QuadtreeTile, image: TexImageSource): void {
    if (!this.device || !this.tilePipeline || !this.globeUniformBuffer) {
      this.pendingTileImages.set(tile.id, { tile, image });
      return;
    }

    this.uploadImageryTile(tile, image);
  }

  ensureDebugImageryTile(_tile: QuadtreeTile): void {
    // WebGPU renders only uploaded imagery tiles for now. Placeholder debug tiles stay WebGL2-only.
  }

  setActiveImageryTiles(ids: readonly string[]): void {
    this.activeTileIds = [...ids];
  }

  setTileDebugOverlayVisible(visible: boolean): void {
    this.tileDebugOverlayVisible = visible;
  }

  setSurfaceFallbackVisible(visible: boolean): void {
    this.surfaceFallbackVisible = visible;
  }

  setTerrainMeshes(meshes: readonly TerrainSurfaceMeshEntry[]): void {
    this.activeTerrainIds = meshes.map((entry) => entry.id);
    const nextTerrainIds = new Set(this.activeTerrainIds);

    if (!this.device || !this.terrainPipeline || !this.globeUniformBuffer) {
      this.pendingTerrainMeshes = meshes;
      return;
    }

    for (const entry of meshes) {
      if (!this.terrainEntries.has(entry.id)) {
        this.uploadTerrainHeightmapEntry(entry);
      }
    }

    for (const [id, entry] of this.terrainEntries) {
      if (!nextTerrainIds.has(id)) {
        destroyTerrainEntry(entry);
        this.terrainEntries.delete(id);
      }
    }

    this.pendingTerrainMeshes = undefined;
  }

  setVectorLines(lines: readonly (readonly [number, number])[][]): void {
    if (!this.device || !this.vectorPipeline || !this.globeUniformBuffer) {
      this.pendingVectorLines = lines;
      return;
    }

    this.uploadVectorLines(lines);
  }

  setVectorLinesVisible(visible: boolean): void {
    this.vectorLinesVisible = visible;
  }

  setDebugModelVisible(visible: boolean): void {
    this.debugModelVisible = visible;
  }

  setDebugModelMesh(mesh: WebGpuDebugModelMesh): void {
    if (!this.device || !this.modelPipeline || !this.modelUniformBuffer) {
      this.pendingDebugModelMesh = mesh;
      return;
    }

    this.uploadDebugModel(mesh);
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
    const surfaceTilesActive = this.hasDrawableSurfaceTiles();
    const viewProjection = webGpuViewProjection(frame, aspect);
    const uniforms = createGlobeUniforms(viewProjection, this.imageryReady, this.tileDebugOverlayVisible);
    this.device.queue.writeBuffer(this.globeUniformBuffer, 0, uniforms);
    this.writeDebugModelUniforms(viewProjection);

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

    if (this.imageryReady || this.surfaceFallbackVisible || !surfaceTilesActive) {
      pass.setPipeline(this.globePipeline);
      pass.setBindGroup(0, this.globeBindGroup);
      pass.setVertexBuffer(0, this.globeVertexBuffer);
      pass.setIndexBuffer(this.globeIndexBuffer, "uint16");
      pass.drawIndexed(this.globeIndexCount);
    }
    this.renderImageryTiles(pass);
    this.renderTerrainMeshes(pass);
    this.renderDebugModel(pass);
    this.renderVectorLines(pass);
    pass.end();

    this.device.queue.submit([encoder.finish()]);
  }

  destroy(): void {
    this.context?.unconfigure?.();
    this.globeVertexBuffer?.destroy?.();
    this.globeIndexBuffer?.destroy?.();
    this.globeUniformBuffer?.destroy?.();
    this.modelUniformBuffer?.destroy?.();
    this.vectorVertexBuffer?.destroy?.();
    if (this.debugModel) {
      destroyModelEntry(this.debugModel);
    }
    for (const entry of this.terrainEntries.values()) {
      destroyTerrainEntry(entry);
    }
    for (const patch of this.terrainPatchMeshes.values()) {
      destroyModelEntry(patch);
    }
    this.depthTexture?.destroy?.();
    this.imageryTexture?.destroy?.();
    for (const entry of this.tileEntries.values()) {
      destroyTileEntry(entry);
    }
    this.device?.destroy?.();
    this.initialized = false;
    this.context = undefined;
    this.device = undefined;
    this.adapter = undefined;
    this.globePipeline = undefined;
    this.tilePipeline = undefined;
    this.vectorPipeline = undefined;
    this.modelPipeline = undefined;
    this.terrainPipeline = undefined;
    this.globeBindGroup = undefined;
    this.vectorBindGroup = undefined;
    this.modelBindGroup = undefined;
    this.globeVertexBuffer = undefined;
    this.globeIndexBuffer = undefined;
    this.globeUniformBuffer = undefined;
    this.modelUniformBuffer = undefined;
    this.vectorVertexBuffer = undefined;
    this.vectorVertexCount = 0;
    this.vectorLinesVisible = false;
    this.debugModel = undefined;
    this.debugModelVisible = false;
    this.tileDebugOverlayVisible = false;
    this.debugModelBaseColorFactor = [1, 0.75, 0.15, 1];
    this.depthTexture = undefined;
    this.depthTextureSize = undefined;
    this.imageryTexture = undefined;
    this.imagerySampler = undefined;
    this.imageryTextureSize = undefined;
    this.imageryReady = false;
    this.pendingImagery = undefined;
    this.pendingVectorLines = undefined;
    this.pendingDebugModelMesh = undefined;
    this.pendingTerrainMeshes = undefined;
    this.pendingTileImages.clear();
    this.tileEntries.clear();
    this.terrainEntries.clear();
    this.terrainPatchMeshes.clear();
    this.activeTileIds = [];
    this.activeTerrainIds = [];
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
        cullMode: "back",
      },
      depthStencil: {
        format: webGpuDepthFormat,
        depthWriteEnabled: true,
        depthCompare: "less",
      },
    });
    this.createGlobeBindGroup();
    this.createTilePipeline();
    this.createTerrainPipeline();
    this.createVectorPipeline();
    this.createModelPipeline();
    this.globeIndexCount = mesh.indices.length;

    if (this.pendingImagery) {
      this.uploadImagery(this.pendingImagery);
      this.pendingImagery = undefined;
    }

    for (const pending of this.pendingTileImages.values()) {
      this.uploadImageryTile(pending.tile, pending.image);
    }
    this.pendingTileImages.clear();

    if (this.pendingVectorLines) {
      this.uploadVectorLines(this.pendingVectorLines);
    }

    if (this.pendingDebugModelMesh) {
      this.uploadDebugModel(this.pendingDebugModelMesh);
    }

    if (this.pendingTerrainMeshes) {
      this.setTerrainMeshes(this.pendingTerrainMeshes);
    }
  }

  private createTilePipeline(): void {
    if (!this.device || !this.format) {
      return;
    }

    const vertexModule = this.device.createShaderModule({
      label: webGpuImageryTileProgram.vertex.id,
      code: webGpuImageryTileProgram.vertex.source,
    });
    const fragmentModule = this.device.createShaderModule({
      label: webGpuImageryTileProgram.fragment.id,
      code: webGpuImageryTileProgram.fragment.source,
    });

    this.tilePipeline = this.device.createRenderPipeline({
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
        targets: [{ format: this.format }],
      },
      primitive: {
        topology: "triangle-list",
        cullMode: "none",
      },
      depthStencil: {
        format: webGpuDepthFormat,
        depthWriteEnabled: true,
        depthCompare: "less-equal",
      },
    });
  }

  private createTerrainPipeline(): void {
    if (!this.device || !this.format) {
      return;
    }

    const vertexModule = this.device.createShaderModule({
      label: webGpuTerrainProgram.vertex.id,
      code: webGpuTerrainProgram.vertex.source,
    });
    const fragmentModule = this.device.createShaderModule({
      label: webGpuTerrainProgram.fragment.id,
      code: webGpuTerrainProgram.fragment.source,
    });

    this.terrainPipeline = this.device.createRenderPipeline({
      label: "OrbixJS WebGPU terrain pipeline",
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
  }

  private createVectorPipeline(): void {
    if (!this.device || !this.format) {
      return;
    }

    const vertexModule = this.device.createShaderModule({
      label: webGpuVectorLineProgram.vertex.id,
      code: webGpuVectorLineProgram.vertex.source,
    });
    const fragmentModule = this.device.createShaderModule({
      label: webGpuVectorLineProgram.fragment.id,
      code: webGpuVectorLineProgram.fragment.source,
    });

    this.vectorPipeline = this.device.createRenderPipeline({
      label: "OrbixJS WebGPU vector line pipeline",
      layout: "auto",
      vertex: {
        module: vertexModule,
        entryPoint: "main",
        buffers: [
          {
            arrayStride: 3 * Float32Array.BYTES_PER_ELEMENT,
            attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }],
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
              color: {
                srcFactor: "src-alpha",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
              alpha: {
                srcFactor: "one",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
            },
          },
        ],
      },
      primitive: {
        topology: "line-list",
        cullMode: "none",
      },
      depthStencil: {
        format: webGpuDepthFormat,
        depthWriteEnabled: false,
        depthCompare: "less",
      },
    });
  }

  private createModelPipeline(): void {
    if (!this.device || !this.format) {
      return;
    }

    const vertexModule = this.device.createShaderModule({
      label: webGpuModelProgram.vertex.id,
      code: webGpuModelProgram.vertex.source,
    });
    const fragmentModule = this.device.createShaderModule({
      label: webGpuModelProgram.fragment.id,
      code: webGpuModelProgram.fragment.source,
    });

    this.modelUniformBuffer = this.device.createBuffer({
      label: "OrbixJS WebGPU model uniforms",
      size: 20 * Float32Array.BYTES_PER_ELEMENT,
      usage: webGpuBufferUsage.uniform | webGpuBufferUsage.copyDst,
    });
    this.modelPipeline = this.device.createRenderPipeline({
      label: "OrbixJS WebGPU model pipeline",
      layout: "auto",
      vertex: {
        module: vertexModule,
        entryPoint: "main",
        buffers: [
          {
            arrayStride: 5 * Float32Array.BYTES_PER_ELEMENT,
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x3" },
              { shaderLocation: 1, offset: 3 * Float32Array.BYTES_PER_ELEMENT, format: "float32x2" },
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
    this.modelBindGroup = this.device.createBindGroup({
      label: "OrbixJS WebGPU model bind group",
      layout: this.modelPipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this.modelUniformBuffer,
          },
        },
      ],
    });
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

    if (!this.imageryTexture || !this.imagerySampler) {
      this.ensureImageryResources();
    }

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

    this.ensureImagerySampler();

    if (this.imageryTexture && this.imageryTextureSize?.[0] === size[0] && this.imageryTextureSize[1] === size[1]) {
      return;
    }

    this.imageryTexture?.destroy?.();
    this.imageryTexture = this.device.createTexture({
      label: "OrbixJS WebGPU imagery texture",
      size: [size[0], size[1]],
      format: webGpuImageryFormat,
      usage: webGpuTextureUsage.textureBinding | webGpuTextureUsage.copyDst | webGpuTextureUsage.renderAttachment,
    });
    this.imageryTextureSize = [size[0], size[1]];
  }

  private ensureImagerySampler(): void {
    if (!this.device || this.imagerySampler) {
      return;
    }

    this.imagerySampler = this.device.createSampler({
      label: "OrbixJS WebGPU imagery sampler",
      magFilter: "linear",
      minFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    });
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

  private renderImageryTiles(pass: WebGpuRenderPassEncoderLike): void {
    if (!this.tilePipeline || this.activeTileIds.length === 0) {
      return;
    }

    pass.setPipeline(this.tilePipeline);

    for (const id of this.activeTileIds) {
      const entry = this.tileEntries.get(id);

      if (this.hasReadyTerrainSurfaceForImageryTile(id)) {
        continue;
      }

      if (!entry?.ready) {
        continue;
      }

      pass.setBindGroup(0, entry.bindGroup);
      pass.setVertexBuffer(0, entry.vertexBuffer);
      pass.setIndexBuffer(entry.indexBuffer, "uint16");
      pass.drawIndexed(entry.indexCount);
    }
  }

  private hasReadyTerrainSurfaceForImageryTile(id: string): boolean {
    const imageryTile = parseTerrainImageryTileId(id);

    if (!imageryTile) {
      return false;
    }

    for (const terrainId of this.activeTerrainIds) {
      const terrain = this.terrainEntries.get(terrainId);

      if (terrain && terrainTileCanReplaceImageryTile(terrain.tile, imageryTile)) {
        return true;
      }
    }

    return false;
  }

  private hasDrawableSurfaceTiles(): boolean {
    for (const id of this.activeTileIds) {
      if (!this.hasReadyTerrainSurfaceForImageryTile(id) && this.tileEntries.get(id)?.ready) {
        return true;
      }
    }

    return this.hasDrawableTerrainSurfaceTiles();
  }

  private hasDrawableTerrainSurfaceTiles(): boolean {
    for (const id of this.activeTerrainIds) {
      const terrain = this.terrainEntries.get(id);

      if (terrain && resolveTerrainImageryFallback(terrain.tile, (imageryId) => this.tileEntries.get(imageryId)?.ready === true)) {
        return true;
      }
    }

    return false;
  }

  private renderTerrainMeshes(pass: WebGpuRenderPassEncoderLike): void {
    if (!this.device || !this.terrainPipeline || !this.globeUniformBuffer || !this.imagerySampler || this.activeTerrainIds.length === 0) {
      return;
    }

    pass.setPipeline(this.terrainPipeline);

    for (const id of this.activeTerrainIds) {
      const entry = this.terrainEntries.get(id);
      const imageryFallback = entry
        ? resolveTerrainImageryFallback(entry.tile, (imageryId) => this.tileEntries.get(imageryId)?.ready === true)
        : undefined;
      const imagery = imageryFallback ? this.tileEntries.get(imageryFallback.imageryId) : undefined;

      if (!entry || !imagery?.ready || !imageryFallback) {
        continue;
      }

      const patch = this.ensureTerrainPatchMesh(entry.tile.width, entry.tile.height);

      if (!patch) {
        continue;
      }

      const bindGroupKey = [
        imageryFallback.imageryId,
        imageryFallback.uvScale[0],
        imageryFallback.uvScale[1],
        imageryFallback.uvOffset[0],
        imageryFallback.uvOffset[1],
      ].join(":");

      if (entry.bindGroupKey !== bindGroupKey || entry.bindGroupTexture !== imagery.texture || !entry.bindGroup) {
        this.device.queue.writeBuffer(
          entry.uniformBuffer,
          0,
          createTerrainUniforms(entry.tile, entry.exaggeration, entry.skirtDepth, imageryFallback.uvScale, imageryFallback.uvOffset),
        );
        entry.bindGroup = this.device.createBindGroup({
          label: `OrbixJS WebGPU terrain bind group ${id}`,
          layout: this.terrainPipeline.getBindGroupLayout(0),
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
              resource: imagery.texture.createView(),
            },
            {
              binding: 3,
              resource: entry.heightmapTexture.createView(),
            },
            {
              binding: 4,
              resource: {
                buffer: entry.uniformBuffer,
              },
            },
          ],
        });
        entry.bindGroupTexture = imagery.texture;
        entry.bindGroupKey = bindGroupKey;
      }

      pass.setBindGroup(0, entry.bindGroup);
      pass.setVertexBuffer(0, patch.vertexBuffer);
      pass.setIndexBuffer(patch.indexBuffer, patch.indexFormat);
      pass.drawIndexed(patch.indexCount);
    }
  }

  private renderVectorLines(pass: WebGpuRenderPassEncoderLike): void {
    if (
      !this.vectorLinesVisible ||
      !this.vectorPipeline ||
      !this.vectorBindGroup ||
      !this.vectorVertexBuffer ||
      this.vectorVertexCount === 0
    ) {
      return;
    }

    pass.setPipeline(this.vectorPipeline);
    pass.setBindGroup(0, this.vectorBindGroup);
    pass.setVertexBuffer(0, this.vectorVertexBuffer);
    pass.draw(this.vectorVertexCount);
  }

  private renderDebugModel(pass: WebGpuRenderPassEncoderLike): void {
    if (!this.debugModelVisible || !this.debugModel || !this.modelPipeline || !this.modelBindGroup) {
      return;
    }

    pass.setPipeline(this.modelPipeline);
    pass.setBindGroup(0, this.modelBindGroup);
    pass.setVertexBuffer(0, this.debugModel.vertexBuffer);
    pass.setIndexBuffer(this.debugModel.indexBuffer, this.debugModel.indexFormat);
    pass.drawIndexed(this.debugModel.indexCount);
  }

  private writeDebugModelUniforms(viewProjection: Float32Array): void {
    if (!this.device || !this.modelUniformBuffer || !this.debugModelVisible || !this.debugModel) {
      return;
    }

    const uniforms = new Float32Array(20);
    uniforms.set(viewProjection, 0);
    uniforms.set(this.debugModelBaseColorFactor, 16);
    this.device.queue.writeBuffer(this.modelUniformBuffer, 0, uniforms);
  }

  private uploadVectorLines(lines: readonly (readonly [number, number])[][]): void {
    if (!this.device || !this.vectorPipeline || !this.globeUniformBuffer) {
      this.pendingVectorLines = lines;
      return;
    }

    const vertices = createVectorLineVertices(lines);

    this.vectorVertexBuffer?.destroy?.();
    this.vectorVertexBuffer = undefined;
    this.vectorVertexCount = vertices.length / 3;

    if (vertices.length === 0) {
      this.vectorBindGroup = undefined;
      return;
    }

    this.vectorVertexBuffer = this.device.createBuffer({
      label: "OrbixJS WebGPU vector line vertices",
      size: vertices.byteLength,
      usage: webGpuBufferUsage.vertex | webGpuBufferUsage.copyDst,
    });
    this.device.queue.writeBuffer(this.vectorVertexBuffer, 0, vertices);
    this.vectorBindGroup = this.device.createBindGroup({
      label: "OrbixJS WebGPU vector line bind group",
      layout: this.vectorPipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this.globeUniformBuffer,
          },
        },
      ],
    });
  }

  private uploadDebugModel(mesh: WebGpuDebugModelMesh): void {
    if (!this.device || !this.modelPipeline || !this.modelUniformBuffer) {
      this.pendingDebugModelMesh = mesh;
      return;
    }

    const placedMesh = createPlacedModelMesh(mesh.positions, mesh.indices, {
      texcoords: mesh.texcoords,
      lon: mesh.lon,
      lat: mesh.lat,
      height: mesh.height ?? 0,
      scale: mesh.scale ?? 1,
    });

    if (this.debugModel) {
      destroyModelEntry(this.debugModel);
      this.debugModel = undefined;
    }

    const vertexBuffer = this.device.createBuffer({
      label: "OrbixJS WebGPU debug model vertices",
      size: placedMesh.vertices.byteLength,
      usage: webGpuBufferUsage.vertex | webGpuBufferUsage.copyDst,
    });
    const indexBuffer = this.device.createBuffer({
      label: "OrbixJS WebGPU debug model indices",
      size: placedMesh.indices.byteLength,
      usage: webGpuBufferUsage.index | webGpuBufferUsage.copyDst,
    });
    this.device.queue.writeBuffer(vertexBuffer, 0, placedMesh.vertices);
    this.device.queue.writeBuffer(indexBuffer, 0, placedMesh.indices);

    this.debugModel = {
      vertexBuffer,
      indexBuffer,
      indexCount: placedMesh.indices.length,
      indexFormat: placedMesh.indices instanceof Uint32Array ? "uint32" : "uint16",
    };
    this.debugModelBaseColorFactor = mesh.baseColorFactor ?? [1, 0.75, 0.15, 1];
    this.pendingDebugModelMesh = undefined;
  }

  private uploadImageryTile(tile: QuadtreeTile, image: TexImageSource): void {
    if (!this.device || !this.tilePipeline || !this.globeUniformBuffer) {
      this.pendingTileImages.set(tile.id, { tile, image });
      return;
    }

    this.ensureImagerySampler();

    if (!this.imagerySampler) {
      return;
    }

    const mesh = createEllipsoidTileMesh(tile);
    const size = imageSize(image);
    const vertexBuffer = this.device.createBuffer({
      label: `OrbixJS WebGPU imagery tile vertices ${tile.id}`,
      size: mesh.vertices.byteLength,
      usage: webGpuBufferUsage.vertex | webGpuBufferUsage.copyDst,
    });
    const indexBuffer = this.device.createBuffer({
      label: `OrbixJS WebGPU imagery tile indices ${tile.id}`,
      size: mesh.indices.byteLength,
      usage: webGpuBufferUsage.index | webGpuBufferUsage.copyDst,
    });
    const texture = this.device.createTexture({
      label: `OrbixJS WebGPU imagery tile texture ${tile.id}`,
      size: [size[0], size[1]],
      format: webGpuImageryFormat,
      usage: webGpuTextureUsage.textureBinding | webGpuTextureUsage.copyDst | webGpuTextureUsage.renderAttachment,
    });

    this.device.queue.writeBuffer(vertexBuffer, 0, mesh.vertices);
    this.device.queue.writeBuffer(indexBuffer, 0, mesh.indices);
    this.device.queue.copyExternalImageToTexture({ source: image }, { texture }, [size[0], size[1]]);

    const bindGroup = this.device.createBindGroup({
      label: `OrbixJS WebGPU imagery tile bind group ${tile.id}`,
      layout: this.tilePipeline.getBindGroupLayout(0),
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
          resource: texture.createView(),
        },
      ],
    });
    const previous = this.tileEntries.get(tile.id);

    if (previous) {
      destroyTileEntry(previous);
    }

    this.tileEntries.set(tile.id, {
      vertexBuffer,
      indexBuffer,
      texture,
      bindGroup,
      indexCount: mesh.indices.length,
      ready: true,
    });
  }

  private uploadTerrainHeightmapEntry(entry: TerrainSurfaceMeshEntry): void {
    if (!this.device) {
      return;
    }

    const heightmapTexture = this.device.createTexture({
      label: `OrbixJS WebGPU terrain heightmap ${entry.id}`,
      size: [entry.heightmap.width, entry.heightmap.height],
      format: webGpuHeightmapFormat,
      usage: webGpuTextureUsage.textureBinding | webGpuTextureUsage.copyDst,
    });
    const uniformBuffer = this.device.createBuffer({
      label: `OrbixJS WebGPU terrain uniforms ${entry.id}`,
      size: Float32Array.BYTES_PER_ELEMENT * 12,
      usage: webGpuBufferUsage.uniform | webGpuBufferUsage.copyDst,
    });
    const previous = this.terrainEntries.get(entry.id);

    this.device.queue.writeTexture(
      { texture: heightmapTexture },
      entry.heightmap.heights,
      {
        bytesPerRow: entry.heightmap.width * Float32Array.BYTES_PER_ELEMENT,
        rowsPerImage: entry.heightmap.height,
      },
      [entry.heightmap.width, entry.heightmap.height],
    );

    if (previous) {
      destroyTerrainEntry(previous);
    }

    this.terrainEntries.set(entry.id, {
      tile: entry.heightmap,
      heightmapTexture,
      uniformBuffer,
      exaggeration: entry.exaggeration,
      skirtDepth: entry.skirtDepth,
    });
  }

  private ensureTerrainPatchMesh(width: number, height: number): WebGpuTerrainPatchEntry | undefined {
    if (!this.device) {
      return undefined;
    }

    const key = `${width}x${height}`;
    const existing = this.terrainPatchMeshes.get(key);

    if (existing) {
      return existing;
    }

    const mesh = createTerrainPatchMesh(width, height);
    const vertexBuffer = this.device.createBuffer({
      label: `OrbixJS WebGPU terrain patch vertices ${key}`,
      size: mesh.vertices.byteLength,
      usage: webGpuBufferUsage.vertex | webGpuBufferUsage.copyDst,
    });
    const indexBuffer = this.device.createBuffer({
      label: `OrbixJS WebGPU terrain patch indices ${key}`,
      size: mesh.indices.byteLength,
      usage: webGpuBufferUsage.index | webGpuBufferUsage.copyDst,
    });

    this.device.queue.writeBuffer(vertexBuffer, 0, mesh.vertices);
    this.device.queue.writeBuffer(indexBuffer, 0, mesh.indices);

    const patch: WebGpuTerrainPatchEntry = {
      vertexBuffer,
      indexBuffer,
      indexCount: mesh.indices.length,
      indexFormat: mesh.indices instanceof Uint32Array ? "uint32" : "uint16",
    };
    this.terrainPatchMeshes.set(key, patch);
    return patch;
  }
}

function webGpuViewProjection(frame: RendererFrame, aspect: number): Float32Array {
  return multiply(webGpuClipSpaceCorrection, multiply(frame.camera.projectionMatrix(aspect), frame.camera.viewMatrix()));
}

function createGlobeUniforms(viewProjection: Float32Array, imageryReady: boolean, tileDebugOverlayVisible = false): Float32Array {
  const uniforms = new Float32Array(20);
  uniforms.set(viewProjection, 0);
  uniforms[16] = imageryReady ? 1 : 0;
  uniforms[17] = tileDebugOverlayVisible ? 1 : 0;
  return uniforms;
}

function createTerrainUniforms(
  tile: TerrainHeightmapTile,
  exaggeration: number,
  skirtDepth: number,
  imageryUvScale: readonly [number, number],
  imageryUvOffset: readonly [number, number],
): Float32Array {
  return new Float32Array([
    tile.level,
    tile.x,
    tile.y,
    exaggeration,
    skirtDepth,
    0,
    0,
    0,
    imageryUvScale[0],
    imageryUvScale[1],
    imageryUvOffset[0],
    imageryUvOffset[1],
  ]);
}

function createTerrainPatchMesh(width: number, height: number): {
  vertices: Float32Array;
  indices: Uint16Array | Uint32Array;
} {
  const columns = Math.max(2, width);
  const rows = Math.max(2, height);
  const baseVertexCount = columns * rows;
  const skirtVertexCount = columns * 2 + Math.max(0, rows - 2) * 2;
  const vertexCount = baseVertexCount + skirtVertexCount;
  const gridIndexCount = (columns - 1) * (rows - 1) * 6;
  const skirtIndexCount = ((columns - 1) * 2 + (rows - 1) * 2) * 6;
  const vertices = new Float32Array(vertexCount * 8);
  const IndexArray = vertexCount > 65_535 ? Uint32Array : Uint16Array;
  const indices = new IndexArray(gridIndexCount + skirtIndexCount);

  for (let row = 0; row < rows; row += 1) {
    const v = rows === 1 ? 0 : row / (rows - 1);

    for (let column = 0; column < columns; column += 1) {
      const u = columns === 1 ? 0 : column / (columns - 1);
      const offset = (row * columns + column) * 8;

      vertices[offset] = u;
      vertices[offset + 1] = v;
      vertices[offset + 2] = 0;
      vertices[offset + 3] = 0;
      vertices[offset + 4] = 1;
      vertices[offset + 5] = 0;
      vertices[offset + 6] = u;
      vertices[offset + 7] = v;
    }
  }

  const skirtByBaseVertex = new Map<number, number>();
  let nextSkirtIndex = baseVertexCount;

  for (const baseIndex of boundaryPatchVertices(columns, rows)) {
    const offset = baseIndex * 8;
    const skirtOffset = nextSkirtIndex * 8;

    vertices.set(vertices.subarray(offset, offset + 8), skirtOffset);
    vertices[skirtOffset + 2] = 1;
    skirtByBaseVertex.set(baseIndex, nextSkirtIndex);
    nextSkirtIndex += 1;
  }

  let offset = 0;

  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      const topLeft = row * columns + column;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + columns;
      const bottomRight = bottomLeft + 1;

      indices[offset] = topLeft;
      indices[offset + 1] = bottomLeft;
      indices[offset + 2] = topRight;
      indices[offset + 3] = topRight;
      indices[offset + 4] = bottomLeft;
      indices[offset + 5] = bottomRight;
      offset += 6;
    }
  }

  offset = writePatchSkirt(indices, offset, topPatchEdge(columns), skirtByBaseVertex);
  offset = writePatchSkirt(indices, offset, rightPatchEdge(columns, rows), skirtByBaseVertex);
  offset = writePatchSkirt(indices, offset, bottomPatchEdge(columns, rows), skirtByBaseVertex);
  writePatchSkirt(indices, offset, leftPatchEdge(columns, rows), skirtByBaseVertex);

  return { vertices, indices };
}

function boundaryPatchVertices(columns: number, rows: number): number[] {
  return [
    ...topPatchEdge(columns),
    ...rightPatchEdge(columns, rows).slice(1, -1),
    ...bottomPatchEdge(columns, rows),
    ...leftPatchEdge(columns, rows).slice(1, -1),
  ];
}

function topPatchEdge(columns: number): number[] {
  return Array.from({ length: columns }, (_, column) => column);
}

function rightPatchEdge(columns: number, rows: number): number[] {
  return Array.from({ length: rows }, (_, row) => row * columns + columns - 1);
}

function bottomPatchEdge(columns: number, rows: number): number[] {
  return Array.from({ length: columns }, (_, column) => (rows - 1) * columns + (columns - 1 - column));
}

function leftPatchEdge(columns: number, rows: number): number[] {
  return Array.from({ length: rows }, (_, row) => (rows - 1 - row) * columns);
}

function writePatchSkirt<T extends Uint16Array | Uint32Array>(
  indices: T,
  offset: number,
  edge: readonly number[],
  skirtByBaseVertex: ReadonlyMap<number, number>,
): number {
  for (let index = 0; index < edge.length - 1; index += 1) {
    const a = edge[index];
    const b = edge[index + 1];
    const skirtA = skirtByBaseVertex.get(a);
    const skirtB = skirtByBaseVertex.get(b);

    if (skirtA === undefined || skirtB === undefined) {
      continue;
    }

    indices[offset] = a;
    indices[offset + 1] = b;
    indices[offset + 2] = skirtA;
    indices[offset + 3] = skirtA;
    indices[offset + 4] = b;
    indices[offset + 5] = skirtB;
    offset += 6;
  }

  return offset;
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

function createVectorLineVertices(
  lines: readonly (readonly [number, number])[][],
  ellipsoid = Ellipsoid.WGS84,
): Float32Array {
  const vertices: number[] = [];
  const maxRadius = ellipsoid.maximumRadius;

  for (const line of lines) {
    for (let index = 0; index < line.length - 1; index += 1) {
      const current = line[index];
      const next = line[index + 1];

      if (Math.abs(next[0] - current[0]) > 180) {
        continue;
      }

      pushVectorLineVertex(vertices, current[0], current[1], ellipsoid, maxRadius);
      pushVectorLineVertex(vertices, next[0], next[1], ellipsoid, maxRadius);
    }
  }

  return new Float32Array(vertices);
}

function pushVectorLineVertex(
  vertices: number[],
  lonDegrees: number,
  latDegrees: number,
  ellipsoid: Ellipsoid,
  maxRadius: number,
): void {
  const position = ellipsoid.cartographicToCartesian({
    lon: lonDegrees * (Math.PI / 180),
    lat: latDegrees * (Math.PI / 180),
    height: 12000,
  });

  vertices.push(position[0] / maxRadius, position[1] / maxRadius, position[2] / maxRadius);
}

function createPlacedModelMesh(
  positions: Float32Array,
  indices: Uint16Array | Uint32Array | undefined,
  placement: { texcoords?: Float32Array; lon: number; lat: number; height: number; scale: number },
  ellipsoid = Ellipsoid.WGS84,
): { vertices: Float32Array; indices: Uint16Array | Uint32Array } {
  const lon = placement.lon * (Math.PI / 180);
  const lat = placement.lat * (Math.PI / 180);
  const frame = createLocalFrameENU({ lon, lat, height: placement.height }, ellipsoid);
  const vertices: number[] = [];

  for (let index = 0; index < positions.length; index += 3) {
    const localX = positions[index];
    const localY = positions[index + 1];
    const localZ = positions[index + 2];
    const worldPosition = localEnuToRenderUnit(
      frame,
      [localX * placement.scale, localZ * placement.scale, localY * placement.scale],
      ellipsoid,
    );

    vertices.push(...worldPosition, placement.texcoords?.[(index / 3) * 2] ?? 0, placement.texcoords?.[(index / 3) * 2 + 1] ?? 0);
  }

  return { vertices: new Float32Array(vertices), indices: indices ?? createSequentialIndices(positions.length / 3) };
}

function createSequentialIndices(vertexCount: number): Uint16Array | Uint32Array {
  const indices = vertexCount > 65535 ? new Uint32Array(vertexCount) : new Uint16Array(vertexCount);

  for (let index = 0; index < vertexCount; index += 1) {
    indices[index] = index;
  }

  return indices;
}

function destroyTileEntry(entry: WebGpuTileEntry): void {
  entry.vertexBuffer.destroy?.();
  entry.indexBuffer.destroy?.();
  entry.texture.destroy?.();
}

function destroyTerrainEntry(entry: WebGpuTerrainEntry): void {
  entry.heightmapTexture.destroy?.();
  entry.uniformBuffer.destroy?.();
}

function destroyModelEntry(entry: WebGpuModelEntry): void {
  entry.vertexBuffer.destroy?.();
  entry.indexBuffer.destroy?.();
}
