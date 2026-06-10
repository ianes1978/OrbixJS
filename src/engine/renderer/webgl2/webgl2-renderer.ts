import { Ellipsoid } from "../../core/geodesy/ellipsoid";
import { createLocalFrameENU, localEnuToRenderUnit } from "../../core/geodesy/local-frame";
import { normalize, type Vec3 } from "../../core/math/vec3";
import { createEllipsoidMesh } from "../../globe/ellipsoid/create-ellipsoid-mesh";
import { createEllipsoidTileMesh } from "../../globe/ellipsoid/create-ellipsoid-tile-mesh";
import { type QuadtreeTile } from "../../globe/imagery/quadtree-tile";
import { type TerrainMesh } from "../../globe/terrain/terrain-mesh";
import { type TerrainHeightmapTile } from "../../globe/terrain/terrain-provider";
import { type TerrainSurfaceMeshEntry } from "../../globe/terrain/terrain-surface-runtime";
import { createRendererFramePlan } from "../interface/render-frame-plan";
import { type Renderer, type RendererFrame } from "../interface/renderer";
import { RendererResourceManager, type RendererResourceHandle } from "../interface/resource-manager";
import {
  globeFragmentShader,
  globeVertexShader,
  imageryTileFragmentShader,
  imageryTileVertexShader,
  modelFragmentShader,
  modelVertexShader,
  terrainFragmentShader,
  terrainVertexShader,
  vectorLineFragmentShader,
  vectorLineVertexShader,
} from "./glsl-shaders";
import {
  parseTerrainImageryTileId,
  resolveTerrainImageryFallback,
  terrainImageryTilesOverlap,
} from "../terrain-imagery-fallback";

type GlobeProgram = {
  program: WebGLProgram;
  resource: RendererResourceHandle;
  uProjection: WebGLUniformLocation;
  uView: WebGLUniformLocation;
  uModel: WebGLUniformLocation;
  uImageryEnabled: WebGLUniformLocation;
  uImagery: WebGLUniformLocation;
  uSunDirection: WebGLUniformLocation;
};

type TileProgram = {
  program: WebGLProgram;
  resource: RendererResourceHandle;
  uProjection: WebGLUniformLocation;
  uView: WebGLUniformLocation;
  uModel: WebGLUniformLocation;
  uImagery: WebGLUniformLocation;
  uSunDirection: WebGLUniformLocation;
  uDebugOverlay: WebGLUniformLocation;
  uFadeAlpha: WebGLUniformLocation;
};

type TerrainProgram = {
  program: WebGLProgram;
  resource: RendererResourceHandle;
  uProjection: WebGLUniformLocation;
  uView: WebGLUniformLocation;
  uTileKey: WebGLUniformLocation;
  uHeightmap: WebGLUniformLocation;
  uImagery: WebGLUniformLocation;
  uExaggeration: WebGLUniformLocation;
  uSkirtDepth: WebGLUniformLocation;
  uImageryUvScale: WebGLUniformLocation;
  uImageryUvOffset: WebGLUniformLocation;
  uSunDirection: WebGLUniformLocation;
  uDebugOverlay: WebGLUniformLocation;
  uCameraPosition: WebGLUniformLocation;
  uMorphRange: WebGLUniformLocation;
};

type VectorProgram = {
  program: WebGLProgram;
  resource: RendererResourceHandle;
  uProjection: WebGLUniformLocation;
  uView: WebGLUniformLocation;
  uModel: WebGLUniformLocation;
  uCameraPosition: WebGLUniformLocation;
};

type ModelProgram = {
  program: WebGLProgram;
  resource: RendererResourceHandle;
  uProjection: WebGLUniformLocation;
  uView: WebGLUniformLocation;
  uModel: WebGLUniformLocation;
  uBaseColorFactor: WebGLUniformLocation;
  uTextureEnabled: WebGLUniformLocation;
  uBaseColorTexture: WebGLUniformLocation;
  uSunDirection: WebGLUniformLocation;
};

type GpuMesh = {
  vao: WebGLVertexArrayObject;
  vaoResource: RendererResourceHandle;
  vertexBuffer: WebGLBuffer;
  vertexBufferResource: RendererResourceHandle;
  indexBuffer: WebGLBuffer;
  indexBufferResource: RendererResourceHandle;
  indexCount: number;
  indexType: number;
  texture?: WebGLTexture;
  textureResource?: RendererResourceHandle;
  textureEnabled?: boolean;
};

type GpuLineMesh = {
  vao: WebGLVertexArrayObject;
  vaoResource: RendererResourceHandle;
  vertexBuffer: WebGLBuffer;
  vertexBufferResource: RendererResourceHandle;
  vertexCount: number;
};

type TileEntry = {
  mesh: GpuMesh;
  texture: WebGLTexture;
  textureResource: RendererResourceHandle;
  level: number;
  ready: boolean;
  /** Timestamp del primo upload texture: guida il fade-in anti-pop. */
  readyAt?: number;
};

type GpuTexture = {
  texture: WebGLTexture;
  resource: RendererResourceHandle;
};

type TerrainGpuEntry = {
  tile: TerrainHeightmapTile;
  exaggeration: number;
  skirtDepth: number;
  heightmapTexture: WebGLTexture;
  heightmapTextureResource: RendererResourceHandle;
  ready: boolean;
};

type TrackedShader = {
  shader: WebGLShader;
  resource: RendererResourceHandle;
};

export class WebGL2Renderer implements Renderer {
  readonly supported: boolean;
  readonly backend = "webgl2" as const;
  readonly capabilities: Renderer["capabilities"];
  private readonly resourceManager = new RendererResourceManager();
  private readonly gl: WebGL2RenderingContext | null;
  private readonly program: GlobeProgram | null = null;
  private readonly tileProgram: TileProgram | null = null;
  private readonly terrainProgram: TerrainProgram | null = null;
  private readonly vectorProgram: VectorProgram | null = null;
  private readonly modelProgram: ModelProgram | null = null;
  private readonly globe: GpuMesh | null = null;
  private debugModel: GpuMesh | null = null;
  private imageryTexture: WebGLTexture | null = null;
  private imageryTextureResource: RendererResourceHandle | undefined;
  private imageryEnabled = false;
  private vectorLines: GpuLineMesh | null = null;
  private vectorLinesVisible = false;
  private debugModelVisible = false;
  private tileDebugOverlayVisible = false;
  private debugModelBaseColorFactor: [number, number, number, number] = [1, 0.75, 0.15, 1];
  private sunDirection: Vec3 = normalize([-0.25, 0.52, 0.82]);
  private readonly tileEntries = new Map<string, TileEntry>();
  private readonly activeTileIds = new Set<string>();
  private readonly terrainEntries = new Map<string, TerrainGpuEntry>();
  private readonly terrainPatchMeshes = new Map<string, GpuMesh>();
  private readonly activeTerrainIds = new Set<string>();
  private surfaceFallbackVisible = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.gl = canvas.getContext("webgl2", { antialias: true, alpha: false });
    this.supported = this.gl !== null;
    this.capabilities = this.gl
      ? {
          backend: this.backend,
          maxTextureSize: this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number,
          supportsInstancing: true,
          supportsFloatTextures: this.gl.getExtension("EXT_color_buffer_float") !== null,
          supportsTerrainHeightmapDisplacement: true,
        }
      : {
          backend: this.backend,
          maxTextureSize: 0,
          supportsInstancing: false,
          supportsFloatTextures: false,
          supportsTerrainHeightmapDisplacement: false,
        };

    if (!this.gl) {
      return;
    }

    this.program = createGlobeProgram(this.gl, this.resourceManager);
    this.tileProgram = createTileProgram(this.gl, this.resourceManager);
    this.terrainProgram = createTerrainProgram(this.gl, this.resourceManager);
    this.vectorProgram = createVectorProgram(this.gl, this.resourceManager);
    this.modelProgram = createModelProgram(this.gl, this.resourceManager);
    this.globe = uploadMesh(this.gl, createEllipsoidMesh(), this.resourceManager);
    const imageryTexture = createBaseMapTexture(this.gl, this.resourceManager);
    this.imageryTexture = imageryTexture.texture;
    this.imageryTextureResource = imageryTexture.resource;
    this.gl.enable(this.gl.DEPTH_TEST);
    this.gl.enable(this.gl.CULL_FACE);
  }

  get resourceStats(): Renderer["resourceStats"] {
    return this.resourceManager.snapshot();
  }

  setImageryTile(tile: QuadtreeTile, image: TexImageSource): void {
    if (!this.gl) {
      return;
    }

    const entry = this.ensureTileEntry(tile);

    this.gl.bindTexture(this.gl.TEXTURE_2D, entry.texture);
    this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, false);
    this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, image);
    this.gl.generateMipmap(this.gl.TEXTURE_2D);
    entry.ready = true;
    entry.readyAt ??= performance.now();
  }

  ensureDebugImageryTile(tile: QuadtreeTile): void {
    if (!this.gl) {
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

  setTileDebugOverlayVisible(visible: boolean): void {
    this.tileDebugOverlayVisible = visible;
  }

  setSurfaceFallbackVisible(visible: boolean): void {
    this.surfaceFallbackVisible = visible;
  }

  setTerrainMeshes(meshes: readonly TerrainSurfaceMeshEntry[]): void {
    if (!this.gl) {
      return;
    }

    this.activeTerrainIds.clear();
    const nextTerrainIds = new Set<string>();

    for (const entry of meshes) {
      this.activeTerrainIds.add(entry.id);
      nextTerrainIds.add(entry.id);

      if (!this.terrainEntries.has(entry.id)) {
        this.terrainEntries.set(entry.id, this.uploadTerrainHeightmapEntry(entry));
      }
    }

    for (const [id, entry] of this.terrainEntries) {
      if (!nextTerrainIds.has(id)) {
        this.deleteTerrainEntry(entry);
        this.terrainEntries.delete(id);
      }
    }
  }

  setVectorLines(lines: readonly (readonly [number, number])[][]): void {
    if (!this.gl) {
      return;
    }

    if (this.vectorLines) {
      this.gl.deleteVertexArray(this.vectorLines.vao);
      this.gl.deleteBuffer(this.vectorLines.vertexBuffer);
      this.vectorLines = null;
    }

    this.vectorLines = uploadLineMesh(this.gl, lines, this.resourceManager);
  }

  setVectorLinesVisible(visible: boolean): void {
    this.vectorLinesVisible = visible;
  }

  setDebugModelVisible(visible: boolean): void {
    this.debugModelVisible = visible;
  }

  setSunDirection(direction: Vec3): void {
    this.sunDirection = normalize(direction);
  }

  setDebugModelMesh(mesh: {
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
    if (!this.gl) {
      return;
    }

    if (this.debugModel) {
      deleteMesh(this.gl, this.debugModel, this.resourceManager);
      this.debugModel = null;
    }

    this.debugModel = uploadSimpleMesh(
      this.gl,
      createPlacedModelMesh(mesh.positions, mesh.indices, {
        texcoords: mesh.texcoords,
        lon: mesh.lon,
        lat: mesh.lat,
        height: mesh.height ?? 90000,
        scale: mesh.scale ?? 180000,
      }),
      this.resourceManager,
    );
    this.debugModelBaseColorFactor = mesh.baseColorFactor ?? [1, 1, 1, 1];

    if (mesh.baseColorTexture) {
      const texture = createModelTexture(this.gl, mesh.baseColorTexture, this.resourceManager);
      this.debugModel.texture = texture.texture;
      this.debugModel.textureResource = texture.resource;
      this.debugModel.textureEnabled = true;
    }
  }

  setImagery(image: TexImageSource): void {
    if (!this.gl || !this.imageryTexture) {
      return;
    }

    this.gl.bindTexture(this.gl.TEXTURE_2D, this.imageryTexture);
    this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, false);
    this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, image);
    this.gl.generateMipmap(this.gl.TEXTURE_2D);
    this.imageryEnabled = true;
  }

  resize(): void {
    if (!this.gl) {
      return;
    }

    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * pixelRatio));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * pixelRatio));

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  render(frame: RendererFrame): void {
    if (!this.gl || !this.program || !this.globe) {
      return;
    }

    this.resize();

    const aspect = this.canvas.width / this.canvas.height;
    const surfaceTilesActive = this.hasDrawableSurfaceTiles();
    const plan = createRendererFramePlan(frame, aspect, {
      imageryEnabled: this.imageryEnabled && surfaceTilesActive,
      vectorLinesVisible: this.vectorLinesVisible && this.vectorLines !== null,
      modelVisible: this.debugModelVisible && this.debugModel !== null,
    });

    this.gl.clearColor(0.012, 0.022, 0.028, 1);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

    if (!surfaceTilesActive) {
      this.renderGlobeBase(plan.projection, plan.view, plan.nodes);
    }

    if (plan.passes.includes("imagery")) {
      this.renderImageryTiles(plan.projection, plan.view);
    }

    this.renderTerrainMeshes(plan.projection, plan.view, plan.cameraPosition);

    if (plan.passes.includes("vector")) {
      this.renderVectorLines(plan.projection, plan.view, plan.cameraPosition);
    }

    if (plan.passes.includes("model")) {
      this.renderDebugModel(plan.projection, plan.view);
    }
  }

  destroy(): void {
    if (!this.gl || !this.program || !this.globe) {
      return;
    }

    deleteMesh(this.gl, this.globe, this.resourceManager);
    this.gl.deleteTexture(this.imageryTexture);
    this.resourceManager.release(this.imageryTextureResource);
    this.gl.deleteProgram(this.program.program);
    this.resourceManager.release(this.program.resource);

    if (this.tileProgram) {
      this.gl.deleteProgram(this.tileProgram.program);
      this.resourceManager.release(this.tileProgram.resource);
    }

    if (this.vectorProgram) {
      this.gl.deleteProgram(this.vectorProgram.program);
      this.resourceManager.release(this.vectorProgram.resource);
    }

    if (this.terrainProgram) {
      this.gl.deleteProgram(this.terrainProgram.program);
      this.resourceManager.release(this.terrainProgram.resource);
    }

    if (this.modelProgram) {
      this.gl.deleteProgram(this.modelProgram.program);
      this.resourceManager.release(this.modelProgram.resource);
    }

    if (this.debugModel) {
      deleteMesh(this.gl, this.debugModel, this.resourceManager);
    }

    if (this.vectorLines) {
      deleteLineMesh(this.gl, this.vectorLines, this.resourceManager);
    }

    for (const entry of this.tileEntries.values()) {
      deleteMesh(this.gl, entry.mesh, this.resourceManager);
      this.gl.deleteTexture(entry.texture);
      this.resourceManager.release(entry.textureResource);
    }

    for (const entry of this.terrainEntries.values()) {
      this.deleteTerrainEntry(entry);
    }
    this.terrainEntries.clear();

    for (const mesh of this.terrainPatchMeshes.values()) {
      deleteMesh(this.gl, mesh, this.resourceManager);
    }
    this.terrainPatchMeshes.clear();
  }

  private renderImageryTiles(projection: Float32Array, view: Float32Array): void {
    if (!this.gl || !this.tileProgram) {
      return;
    }

    this.gl.useProgram(this.tileProgram.program);
    this.gl.enable(this.gl.CULL_FACE);
    this.gl.cullFace(this.gl.BACK);
    this.gl.enable(this.gl.DEPTH_TEST);
    this.gl.depthMask(true);
    this.gl.depthFunc(this.gl.LEQUAL);
    this.gl.uniformMatrix4fv(this.tileProgram.uProjection, false, projection);
    this.gl.uniformMatrix4fv(this.tileProgram.uView, false, view);
    this.gl.uniformMatrix4fv(this.tileProgram.uModel, false, new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]));
    this.gl.uniform3fv(this.tileProgram.uSunDirection, this.sunDirection);
    this.gl.uniform1i(this.tileProgram.uDebugOverlay, this.tileDebugOverlayVisible ? 1 : 0);

    const now = performance.now();
    const drawable: { entry: TileEntry; alpha: number }[] = [];
    const fadingAncestorIds = new Set<string>();

    for (const id of this.activeTileIds) {
      const entry = this.tileEntries.get(id);

      if (this.hasReadyTerrainSurfaceForImageryTile(id)) {
        continue;
      }

      if (!entry?.ready) {
        continue;
      }

      const alpha = tileFadeAlpha(entry, now);
      drawable.push({ entry, alpha });

      // Durante il fade il padre piu' vicino gia' caricato resta sotto, cosi'
      // il nuovo livello entra senza pop ne' buchi.
      if (alpha < 1) {
        const ancestorId = this.nearestReadyAncestorTileId(id);

        if (ancestorId) {
          fadingAncestorIds.add(ancestorId);
        }
      }
    }

    const drawTile = (entry: TileEntry, alpha: number) => {
      if (!this.gl || !this.tileProgram) {
        return;
      }

      this.gl.uniform1f(this.tileProgram.uFadeAlpha, alpha);
      this.gl.activeTexture(this.gl.TEXTURE0);
      this.gl.bindTexture(this.gl.TEXTURE_2D, entry.texture);
      this.gl.uniform1i(this.tileProgram.uImagery, 0);
      this.gl.bindVertexArray(entry.mesh.vao);
      this.gl.drawElements(this.gl.TRIANGLES, entry.mesh.indexCount, entry.mesh.indexType, 0);
    };

    // Pass 1: antenati di supporto, opachi, senza scrivere il depth (i figli
    // in fade devono passare il depth test sopra di loro).
    this.gl.depthMask(false);

    for (const ancestorId of fadingAncestorIds) {
      const ancestor = this.tileEntries.get(ancestorId);

      if (ancestor?.ready && !this.activeTileIds.has(ancestorId)) {
        drawTile(ancestor, 1);
      }
    }

    this.gl.depthMask(true);

    // Pass 2: tile attive; quelle in fade in blending sopra l'antenato.
    for (const { entry, alpha } of drawable) {
      if (alpha < 1) {
        this.gl.enable(this.gl.BLEND);
        this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
        drawTile(entry, alpha);
        this.gl.disable(this.gl.BLEND);
      } else {
        drawTile(entry, 1);
      }
    }

    this.gl.enable(this.gl.DEPTH_TEST);
    this.gl.depthFunc(this.gl.LESS);
  }

  private nearestReadyAncestorTileId(id: string): string | undefined {
    const [z, x, y] = id.split("/").map(Number);

    if (![z, x, y].every(Number.isFinite)) {
      return undefined;
    }

    let level = z - 1;
    let tileX = Math.floor(x / 2);
    let tileY = Math.floor(y / 2);

    while (level >= 2) {
      const ancestorId = `${level}/${tileX}/${tileY}`;

      if (this.tileEntries.get(ancestorId)?.ready) {
        return ancestorId;
      }

      level -= 1;
      tileX = Math.floor(tileX / 2);
      tileY = Math.floor(tileY / 2);
    }

    return undefined;
  }

  private renderGlobeBase(projection: Float32Array, view: Float32Array, nodes: readonly { modelMatrix: ArrayLike<number> }[]): void {
    if (!this.gl || !this.program || !this.globe) {
      return;
    }

    this.gl.enable(this.gl.DEPTH_TEST);
    this.gl.depthMask(true);
    this.gl.useProgram(this.program.program);
    this.gl.uniformMatrix4fv(this.program.uProjection, false, projection);
    this.gl.uniformMatrix4fv(this.program.uView, false, view);
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.imageryTexture);
    this.gl.uniform1i(this.program.uImagery, 0);
    this.gl.uniform1i(this.program.uImageryEnabled, this.imageryEnabled ? 1 : 0);
    this.gl.uniform3fv(this.program.uSunDirection, this.sunDirection);
    this.gl.bindVertexArray(this.globe.vao);

    for (const node of nodes) {
      this.gl.uniformMatrix4fv(this.program.uModel, false, new Float32Array(node.modelMatrix));
      this.gl.drawElements(this.gl.TRIANGLES, this.globe.indexCount, this.globe.indexType, 0);
    }

  }

  private hasReadyTerrainSurfaceForImageryTile(id: string): boolean {
    const imageryTile = parseTerrainImageryTileId(id);

    if (!imageryTile) {
      return false;
    }

    for (const terrainId of this.activeTerrainIds) {
      const terrain = this.terrainEntries.get(terrainId);

      if (terrain && terrainImageryTilesOverlap(terrain.tile, imageryTile)) {
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

  private renderTerrainMeshes(projection: Float32Array, view: Float32Array, cameraPosition: readonly [number, number, number]): void {
    if (!this.gl || !this.terrainProgram || this.activeTerrainIds.size === 0) {
      return;
    }

    this.gl.useProgram(this.terrainProgram.program);
    this.gl.depthMask(true);
    this.gl.depthFunc(this.gl.LEQUAL);
    this.gl.uniformMatrix4fv(this.terrainProgram.uProjection, false, projection);
    this.gl.uniformMatrix4fv(this.terrainProgram.uView, false, view);
    this.gl.uniform3fv(this.terrainProgram.uSunDirection, this.sunDirection);
    this.gl.uniform1i(this.terrainProgram.uDebugOverlay, this.tileDebugOverlayVisible ? 1 : 0);
    this.gl.uniform3f(this.terrainProgram.uCameraPosition, cameraPosition[0], cameraPosition[1], cameraPosition[2]);
    // Fattore di proiezione ricavato dalla projection matrix: P[5] = 1/tan(fov/2).
    const viewportFactor = (this.canvas.height || 1) * projection[5] * 0.5;

    for (const id of this.activeTerrainIds) {
      const terrain = this.terrainEntries.get(id);
      const imageryFallback = terrain
        ? resolveTerrainImageryFallback(terrain.tile, (imageryId) => this.tileEntries.get(imageryId)?.ready === true)
        : undefined;
      const imagery = imageryFallback ? this.tileEntries.get(imageryFallback.imageryId) : undefined;

      if (!terrain?.ready || !imagery?.ready || !imageryFallback) {
        continue;
      }

      const patch = this.ensureTerrainPatchMesh(terrain.tile.width, terrain.tile.height);

      if (!patch) {
        continue;
      }

      this.gl.activeTexture(this.gl.TEXTURE0);
      this.gl.bindTexture(this.gl.TEXTURE_2D, imagery.texture);
      this.gl.uniform1i(this.terrainProgram.uImagery, 0);
      this.gl.activeTexture(this.gl.TEXTURE1);
      this.gl.bindTexture(this.gl.TEXTURE_2D, terrain.heightmapTexture);
      this.gl.uniform1i(this.terrainProgram.uHeightmap, 1);
      this.gl.uniform1f(this.terrainProgram.uExaggeration, terrain.exaggeration);
      this.gl.uniform1f(this.terrainProgram.uSkirtDepth, terrain.skirtDepth);
      this.gl.uniform2f(this.terrainProgram.uImageryUvScale, imageryFallback.uvScale[0], imageryFallback.uvScale[1]);
      this.gl.uniform2f(this.terrainProgram.uImageryUvOffset, imageryFallback.uvOffset[0], imageryFallback.uvOffset[1]);
      this.gl.uniform3f(this.terrainProgram.uTileKey, terrain.tile.level, terrain.tile.x, terrain.tile.y);
      const morphRange = terrainMorphRangeUnit(terrain.tile, viewportFactor);
      this.gl.uniform2f(this.terrainProgram.uMorphRange, morphRange[0], morphRange[1]);
      this.gl.bindVertexArray(patch.vao);
      this.gl.drawElements(this.gl.TRIANGLES, patch.indexCount, patch.indexType, 0);
    }

    this.gl.depthFunc(this.gl.LESS);
  }

  private renderVectorLines(projection: Float32Array, view: Float32Array, cameraPosition: readonly [number, number, number]): void {
    if (!this.gl || !this.vectorProgram || !this.vectorLines || !this.vectorLinesVisible) {
      return;
    }

    this.gl.useProgram(this.vectorProgram.program);
    this.gl.disable(this.gl.DEPTH_TEST);
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
    this.gl.uniformMatrix4fv(this.vectorProgram.uProjection, false, projection);
    this.gl.uniformMatrix4fv(this.vectorProgram.uView, false, view);
    this.gl.uniformMatrix4fv(this.vectorProgram.uModel, false, identityMatrix());
    this.gl.uniform3fv(this.vectorProgram.uCameraPosition, cameraPosition);
    this.gl.bindVertexArray(this.vectorLines.vao);
    this.gl.drawArrays(this.gl.LINES, 0, this.vectorLines.vertexCount);
    this.gl.disable(this.gl.BLEND);
    this.gl.enable(this.gl.DEPTH_TEST);
  }

  private renderDebugModel(projection: Float32Array, view: Float32Array): void {
    if (!this.gl || !this.modelProgram || !this.debugModel || !this.debugModelVisible) {
      return;
    }

    this.gl.useProgram(this.modelProgram.program);
    this.gl.disable(this.gl.CULL_FACE);
    this.gl.uniformMatrix4fv(this.modelProgram.uProjection, false, projection);
    this.gl.uniformMatrix4fv(this.modelProgram.uView, false, view);
    this.gl.uniformMatrix4fv(this.modelProgram.uModel, false, identityMatrix());
    this.gl.uniform4fv(this.modelProgram.uBaseColorFactor, this.debugModelBaseColorFactor);
    this.gl.uniform1i(this.modelProgram.uTextureEnabled, this.debugModel.textureEnabled ? 1 : 0);
    this.gl.uniform3fv(this.modelProgram.uSunDirection, this.sunDirection);
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.debugModel.texture ?? null);
    this.gl.uniform1i(this.modelProgram.uBaseColorTexture, 0);
    this.gl.bindVertexArray(this.debugModel.vao);
    this.gl.drawElements(this.gl.TRIANGLES, this.debugModel.indexCount, this.debugModel.indexType, 0);
    this.gl.enable(this.gl.CULL_FACE);
  }

  private ensureTileEntry(tile: QuadtreeTile): TileEntry {
    if (!this.gl) {
      throw new Error("WebGL2 is not available");
    }

    const existing = this.tileEntries.get(tile.id);

    if (existing) {
      return existing;
    }

    const texture = createDebugTileTexture(this.gl, this.resourceManager);
    const entry = {
      mesh: uploadTileMesh(this.gl, createEllipsoidTileMesh(tile), this.resourceManager),
      texture: texture.texture,
      textureResource: texture.resource,
      level: tile.z,
      ready: false,
    };
    this.tileEntries.set(tile.id, entry);
    return entry;
  }

  private uploadTerrainHeightmapEntry(entry: TerrainSurfaceMeshEntry): TerrainGpuEntry {
    if (!this.gl) {
      throw new Error("WebGL2 is not available");
    }

    const texture = createHeightmapTexture(this.gl, entry.heightmap, this.resourceManager);

    return {
      tile: entry.heightmap,
      exaggeration: entry.exaggeration,
      skirtDepth: entry.skirtDepth,
      heightmapTexture: texture.texture,
      heightmapTextureResource: texture.resource,
      ready: true,
    };
  }

  private deleteTerrainEntry(entry: TerrainGpuEntry): void {
    if (!this.gl) {
      return;
    }

    this.gl.deleteTexture(entry.heightmapTexture);
    this.resourceManager.release(entry.heightmapTextureResource);
  }

  private ensureTerrainPatchMesh(width: number, height: number): GpuMesh | undefined {
    if (!this.gl) {
      return undefined;
    }

    const key = `${width}x${height}`;
    const existing = this.terrainPatchMeshes.get(key);

    if (existing) {
      return existing;
    }

    const patch = uploadTileMesh(this.gl, createTerrainPatchMesh(width, height), this.resourceManager);
    this.terrainPatchMeshes.set(key, patch);
    return patch;
  }
}

function createGlobeProgram(gl: WebGL2RenderingContext, resources: RendererResourceManager): GlobeProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, globeVertexShader, resources);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, globeFragmentShader, resources);
  const program = gl.createProgram();

  if (!program) {
    throw new Error("Unable to create WebGL2 program");
  }

  const resource = resources.track("program");
  gl.attachShader(program, vertex.shader);
  gl.attachShader(program, fragment.shader);
  gl.bindAttribLocation(program, 0, "position");
  gl.bindAttribLocation(program, 1, "normal");
  gl.bindAttribLocation(program, 2, "geodeticNormal");
  gl.bindAttribLocation(program, 3, "imageryUv");
  gl.linkProgram(program);
  gl.deleteShader(vertex.shader);
  resources.release(vertex.resource);
  gl.deleteShader(fragment.shader);
  resources.release(fragment.resource);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? "Unable to link WebGL2 program");
  }

  const uProjection = gl.getUniformLocation(program, "uProjection");
  const uView = gl.getUniformLocation(program, "uView");
  const uModel = gl.getUniformLocation(program, "uModel");
  const uImageryEnabled = gl.getUniformLocation(program, "uImageryEnabled");
  const uImagery = gl.getUniformLocation(program, "uImagery");
  const uSunDirection = gl.getUniformLocation(program, "uSunDirection");

  if (!uProjection || !uView || !uModel || !uImageryEnabled || !uImagery || !uSunDirection) {
    throw new Error("Missing WebGL2 uniform");
  }

  return { program, resource, uProjection, uView, uModel, uImageryEnabled, uImagery, uSunDirection };
}

function createTileProgram(gl: WebGL2RenderingContext, resources: RendererResourceManager): TileProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, imageryTileVertexShader, resources);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, imageryTileFragmentShader, resources);
  const program = gl.createProgram();

  if (!program) {
    throw new Error("Unable to create WebGL2 tile program");
  }

  const resource = resources.track("program");
  gl.attachShader(program, vertex.shader);
  gl.attachShader(program, fragment.shader);
  gl.bindAttribLocation(program, 0, "position");
  gl.bindAttribLocation(program, 1, "normal");
  gl.bindAttribLocation(program, 2, "uv");
  gl.linkProgram(program);
  gl.deleteShader(vertex.shader);
  resources.release(vertex.resource);
  gl.deleteShader(fragment.shader);
  resources.release(fragment.resource);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? "Unable to link WebGL2 tile program");
  }

  const uProjection = gl.getUniformLocation(program, "uProjection");
  const uView = gl.getUniformLocation(program, "uView");
  const uModel = gl.getUniformLocation(program, "uModel");
  const uImagery = gl.getUniformLocation(program, "uImagery");
  const uSunDirection = gl.getUniformLocation(program, "uSunDirection");
  const uDebugOverlay = gl.getUniformLocation(program, "uDebugOverlay");
  const uFadeAlpha = gl.getUniformLocation(program, "uFadeAlpha");

  if (!uProjection || !uView || !uModel || !uImagery || !uSunDirection || !uDebugOverlay || !uFadeAlpha) {
    throw new Error("Missing WebGL2 tile uniform");
  }

  return { program, resource, uProjection, uView, uModel, uImagery, uSunDirection, uDebugOverlay, uFadeAlpha };
}

function createTerrainProgram(gl: WebGL2RenderingContext, resources: RendererResourceManager): TerrainProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, terrainVertexShader, resources);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, terrainFragmentShader, resources);
  const program = gl.createProgram();

  if (!program) {
    throw new Error("Unable to create WebGL2 terrain program");
  }

  const resource = resources.track("program");
  gl.attachShader(program, vertex.shader);
  gl.attachShader(program, fragment.shader);
  gl.bindAttribLocation(program, 0, "position");
  gl.bindAttribLocation(program, 1, "normal");
  gl.bindAttribLocation(program, 2, "uv");
  gl.linkProgram(program);
  gl.deleteShader(vertex.shader);
  resources.release(vertex.resource);
  gl.deleteShader(fragment.shader);
  resources.release(fragment.resource);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? "Unable to link WebGL2 terrain program");
  }

  const uProjection = gl.getUniformLocation(program, "uProjection");
  const uView = gl.getUniformLocation(program, "uView");
  const uTileKey = gl.getUniformLocation(program, "uTileKey");
  const uHeightmap = gl.getUniformLocation(program, "uHeightmap");
  const uImagery = gl.getUniformLocation(program, "uImagery");
  const uExaggeration = gl.getUniformLocation(program, "uExaggeration");
  const uSkirtDepth = gl.getUniformLocation(program, "uSkirtDepth");
  const uImageryUvScale = gl.getUniformLocation(program, "uImageryUvScale");
  const uImageryUvOffset = gl.getUniformLocation(program, "uImageryUvOffset");
  const uSunDirection = gl.getUniformLocation(program, "uSunDirection");
  const uDebugOverlay = gl.getUniformLocation(program, "uDebugOverlay");
  const uCameraPosition = gl.getUniformLocation(program, "uCameraPosition");
  const uMorphRange = gl.getUniformLocation(program, "uMorphRange");

  if (
    !uProjection ||
    !uView ||
    !uTileKey ||
    !uHeightmap ||
    !uImagery ||
    !uExaggeration ||
    !uSkirtDepth ||
    !uImageryUvScale ||
    !uImageryUvOffset ||
    !uSunDirection ||
    !uDebugOverlay ||
    !uCameraPosition ||
    !uMorphRange
  ) {
    throw new Error("Missing WebGL2 terrain uniform");
  }

  return {
    program,
    resource,
    uProjection,
    uView,
    uTileKey,
    uHeightmap,
    uImagery,
    uExaggeration,
    uSkirtDepth,
    uImageryUvScale,
    uImageryUvOffset,
    uSunDirection,
    uDebugOverlay,
    uCameraPosition,
    uMorphRange,
  };
}

function createVectorProgram(gl: WebGL2RenderingContext, resources: RendererResourceManager): VectorProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vectorLineVertexShader, resources);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, vectorLineFragmentShader, resources);
  const program = gl.createProgram();

  if (!program) {
    throw new Error("Unable to create WebGL2 vector program");
  }

  const resource = resources.track("program");
  gl.attachShader(program, vertex.shader);
  gl.attachShader(program, fragment.shader);
  gl.bindAttribLocation(program, 0, "position");
  gl.linkProgram(program);
  gl.deleteShader(vertex.shader);
  resources.release(vertex.resource);
  gl.deleteShader(fragment.shader);
  resources.release(fragment.resource);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? "Unable to link WebGL2 vector program");
  }

  const uProjection = gl.getUniformLocation(program, "uProjection");
  const uView = gl.getUniformLocation(program, "uView");
  const uModel = gl.getUniformLocation(program, "uModel");
  const uCameraPosition = gl.getUniformLocation(program, "uCameraPosition");

  if (!uProjection || !uView || !uModel || !uCameraPosition) {
    throw new Error("Missing WebGL2 vector uniform");
  }

  return { program, resource, uProjection, uView, uModel, uCameraPosition };
}

function createModelProgram(gl: WebGL2RenderingContext, resources: RendererResourceManager): ModelProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, modelVertexShader, resources);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, modelFragmentShader, resources);
  const program = gl.createProgram();

  if (!program) {
    throw new Error("Unable to create WebGL2 model program");
  }

  const resource = resources.track("program");
  gl.attachShader(program, vertex.shader);
  gl.attachShader(program, fragment.shader);
  gl.bindAttribLocation(program, 0, "position");
  gl.linkProgram(program);
  gl.deleteShader(vertex.shader);
  resources.release(vertex.resource);
  gl.deleteShader(fragment.shader);
  resources.release(fragment.resource);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? "Unable to link WebGL2 model program");
  }

  const uProjection = gl.getUniformLocation(program, "uProjection");
  const uView = gl.getUniformLocation(program, "uView");
  const uModel = gl.getUniformLocation(program, "uModel");
  const uBaseColorFactor = gl.getUniformLocation(program, "uBaseColorFactor");
  const uTextureEnabled = gl.getUniformLocation(program, "uTextureEnabled");
  const uBaseColorTexture = gl.getUniformLocation(program, "uBaseColorTexture");
  const uSunDirection = gl.getUniformLocation(program, "uSunDirection");

  if (
    !uProjection ||
    !uView ||
    !uModel ||
    !uBaseColorFactor ||
    !uTextureEnabled ||
    !uBaseColorTexture ||
    !uSunDirection
  ) {
    throw new Error("Missing WebGL2 model uniform");
  }

  return {
    program,
    resource,
    uProjection,
    uView,
    uModel,
    uBaseColorFactor,
    uTextureEnabled,
    uBaseColorTexture,
    uSunDirection,
  };
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
  resources: RendererResourceManager,
): TrackedShader {
  const shader = gl.createShader(type);

  if (!shader) {
    throw new Error("Unable to create WebGL2 shader");
  }

  const resource = resources.track("shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    resources.release(resource);
    throw new Error(info ?? "Unable to compile WebGL2 shader");
  }

  return { shader, resource };
}

function uploadMesh(
  gl: WebGL2RenderingContext,
  mesh: ReturnType<typeof createEllipsoidMesh>,
  resources: RendererResourceManager,
): GpuMesh {
  const vao = gl.createVertexArray();
  const vertexBuffer = gl.createBuffer();
  const indexBuffer = gl.createBuffer();

  if (!vao || !vertexBuffer || !indexBuffer) {
    throw new Error("Unable to allocate WebGL2 mesh");
  }

  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);

  const stride = mesh.vertexStride * Float32Array.BYTES_PER_ELEMENT;
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride, 6 * Float32Array.BYTES_PER_ELEMENT);
  gl.enableVertexAttribArray(3);
  gl.vertexAttribPointer(3, 2, gl.FLOAT, false, stride, 9 * Float32Array.BYTES_PER_ELEMENT);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);

  return {
    vao,
    vaoResource: resources.track("vertexArray"),
    vertexBuffer,
    vertexBufferResource: resources.track("buffer"),
    indexBuffer,
    indexBufferResource: resources.track("buffer"),
    indexCount: mesh.indices.length,
    indexType: gl.UNSIGNED_SHORT,
  };
}

function uploadTileMesh(
  gl: WebGL2RenderingContext,
  mesh: { vertices: Float32Array; indices: Uint16Array | Uint32Array; vertexStride: number },
  resources: RendererResourceManager,
): GpuMesh {
  const vao = gl.createVertexArray();
  const vertexBuffer = gl.createBuffer();
  const indexBuffer = gl.createBuffer();

  if (!vao || !vertexBuffer || !indexBuffer) {
    throw new Error("Unable to allocate WebGL2 tile mesh");
  }

  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);

  const stride = mesh.vertexStride * Float32Array.BYTES_PER_ELEMENT;
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 6 * Float32Array.BYTES_PER_ELEMENT);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);

  return {
    vao,
    vaoResource: resources.track("vertexArray"),
    vertexBuffer,
    vertexBufferResource: resources.track("buffer"),
    indexBuffer,
    indexBufferResource: resources.track("buffer"),
    indexCount: mesh.indices.length,
    indexType: mesh.indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
  };
}

function uploadTerrainMesh(gl: WebGL2RenderingContext, mesh: TerrainMesh, resources: RendererResourceManager): GpuMesh {
  return uploadTileMesh(gl, packTerrainMesh(mesh), resources);
}

function createTerrainPatchMesh(width: number, height: number): {
  vertices: Float32Array;
  indices: Uint16Array | Uint32Array;
  vertexStride: number;
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

  return {
    vertices,
    indices,
    vertexStride: 8,
  };
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

function packTerrainMesh(mesh: TerrainMesh): {
  vertices: Float32Array;
  indices: Uint16Array | Uint32Array;
  vertexStride: number;
} {
  const vertexCount = mesh.positions.length / 3;
  const vertices = new Float32Array(vertexCount * 8);

  for (let index = 0; index < vertexCount; index += 1) {
    const positionOffset = index * 3;
    const texcoordOffset = index * 2;
    const vertexOffset = index * 8;

    vertices[vertexOffset] = mesh.positions[positionOffset];
    vertices[vertexOffset + 1] = mesh.positions[positionOffset + 1];
    vertices[vertexOffset + 2] = mesh.positions[positionOffset + 2];
    vertices[vertexOffset + 3] = mesh.normals[positionOffset];
    vertices[vertexOffset + 4] = mesh.normals[positionOffset + 1];
    vertices[vertexOffset + 5] = mesh.normals[positionOffset + 2];
    vertices[vertexOffset + 6] = mesh.texcoords[texcoordOffset];
    vertices[vertexOffset + 7] = mesh.texcoords[texcoordOffset + 1];
  }

  return {
    vertices,
    indices: mesh.indices,
    vertexStride: 8,
  };
}

function uploadSimpleMesh(
  gl: WebGL2RenderingContext,
  mesh: { vertices: Float32Array; indices: Uint16Array | Uint32Array },
  resources: RendererResourceManager,
): GpuMesh {
  const vao = gl.createVertexArray();
  const vertexBuffer = gl.createBuffer();
  const indexBuffer = gl.createBuffer();

  if (!vao || !vertexBuffer || !indexBuffer) {
    throw new Error("Unable to allocate WebGL2 simple mesh");
  }

  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 5 * Float32Array.BYTES_PER_ELEMENT, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 5 * Float32Array.BYTES_PER_ELEMENT, 3 * Float32Array.BYTES_PER_ELEMENT);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);

  return {
    vao,
    vaoResource: resources.track("vertexArray"),
    vertexBuffer,
    vertexBufferResource: resources.track("buffer"),
    indexBuffer,
    indexBufferResource: resources.track("buffer"),
    indexCount: mesh.indices.length,
    indexType: mesh.indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
  };
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

function uploadLineMesh(
  gl: WebGL2RenderingContext,
  lines: readonly (readonly [number, number])[][],
  resources: RendererResourceManager,
  ellipsoid = Ellipsoid.WGS84,
): GpuLineMesh {
  const vertices: number[] = [];
  const maxRadius = ellipsoid.maximumRadius;

  for (const line of lines) {
    for (let index = 0; index < line.length - 1; index += 1) {
      const current = line[index];
      const next = line[index + 1];

      if (Math.abs(next[0] - current[0]) > 180) {
        continue;
      }

      pushLineVertex(vertices, current[0], current[1], ellipsoid, maxRadius);
      pushLineVertex(vertices, next[0], next[1], ellipsoid, maxRadius);
    }
  }

  const vao = gl.createVertexArray();
  const vertexBuffer = gl.createBuffer();

  if (!vao || !vertexBuffer) {
    throw new Error("Unable to allocate WebGL2 vector mesh");
  }

  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 3 * Float32Array.BYTES_PER_ELEMENT, 0);

  return {
    vao,
    vaoResource: resources.track("vertexArray"),
    vertexBuffer,
    vertexBufferResource: resources.track("buffer"),
    vertexCount: vertices.length / 3,
  };
}

function deleteMesh(gl: WebGL2RenderingContext, mesh: GpuMesh, resources: RendererResourceManager): void {
  gl.deleteVertexArray(mesh.vao);
  resources.release(mesh.vaoResource);
  gl.deleteBuffer(mesh.vertexBuffer);
  resources.release(mesh.vertexBufferResource);
  gl.deleteBuffer(mesh.indexBuffer);
  resources.release(mesh.indexBufferResource);

  if (mesh.texture) {
    gl.deleteTexture(mesh.texture);
    resources.release(mesh.textureResource);
  }
}

function deleteLineMesh(gl: WebGL2RenderingContext, mesh: GpuLineMesh, resources: RendererResourceManager): void {
  gl.deleteVertexArray(mesh.vao);
  resources.release(mesh.vaoResource);
  gl.deleteBuffer(mesh.vertexBuffer);
  resources.release(mesh.vertexBufferResource);
}

function pushLineVertex(
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

/**
 * Zona di morphing CDLOD per un tile terrain: (inizio, fine) in distanza
 * unit-scale. La fine coincide circa con la distanza a cui il runtime passa
 * al livello padre (tile proiettato ≈ soglia SSE di default).
 */
function terrainMorphRangeUnit(
  tile: { level: number; x: number; y: number },
  viewportFactor: number,
): [number, number] {
  const tileCount = 2 ** tile.level;
  const mercatorY = (tile.y + 0.5) / tileCount;
  const n = Math.PI * (1 - 2 * mercatorY);
  const centerLat = Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  const widthUnit = ((2 * Math.PI) / tileCount) * Math.max(0.05, Math.cos(centerLat));
  const defaultThresholdPx = 294;
  const transitionDistance = (widthUnit * Math.max(1, viewportFactor)) / defaultThresholdPx;

  return [transitionDistance * 0.6, transitionDistance * 0.92];
}

const tileFadeDurationMs = 220;

function tileFadeAlpha(entry: { readyAt?: number }, now: number): number {
  if (entry.readyAt === undefined) {
    return 1;
  }

  return Math.min(1, Math.max(0, (now - entry.readyAt) / tileFadeDurationMs));
}

function identityMatrix(): Float32Array {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

function createBaseMapTexture(gl: WebGL2RenderingContext, resources: RendererResourceManager): GpuTexture {
  return createPlaceholderTexture(gl, resources, new Uint8Array([255, 24, 24, 255]));
}

function createPlaceholderTexture(
  gl: WebGL2RenderingContext,
  resources: RendererResourceManager,
  color = new Uint8Array([18, 42, 50, 255]),
): GpuTexture {
  const texture = gl.createTexture();

  if (!texture) {
    throw new Error("Unable to allocate imagery texture");
  }

  const resource = resources.track("texture");
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    color,
  );
  gl.generateMipmap(gl.TEXTURE_2D);
  return { texture, resource };
}

function createTileTexture(gl: WebGL2RenderingContext, resources: RendererResourceManager): GpuTexture {
  const texture = createPlaceholderTexture(gl, resources);
  gl.bindTexture(gl.TEXTURE_2D, texture.texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

function createHeightmapTexture(
  gl: WebGL2RenderingContext,
  tile: TerrainHeightmapTile,
  resources: RendererResourceManager,
): GpuTexture {
  const texture = gl.createTexture();

  if (!texture) {
    throw new Error("Unable to allocate terrain heightmap texture");
  }

  const resource = resources.track("texture");
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, tile.width, tile.height, 0, gl.RED, gl.FLOAT, tile.heights);
  return { texture, resource };
}

function createDebugTileTexture(gl: WebGL2RenderingContext, resources: RendererResourceManager): GpuTexture {
  const texture = createPlaceholderTexture(gl, resources);
  gl.bindTexture(gl.TEXTURE_2D, texture.texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([255, 40, 20, 210]),
  );
  gl.generateMipmap(gl.TEXTURE_2D);
  return texture;
}

function createModelTexture(
  gl: WebGL2RenderingContext,
  image: TexImageSource,
  resources: RendererResourceManager,
): GpuTexture {
  const texture = createPlaceholderTexture(gl, resources);
  gl.bindTexture(gl.TEXTURE_2D, texture.texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.generateMipmap(gl.TEXTURE_2D);
  return texture;
}
