import { Ellipsoid } from "../../core/geodesy/ellipsoid";
import { add, cross, normalize, scale, type Vec3 } from "../../core/math/vec3";
import { createEllipsoidMesh } from "../../globe/ellipsoid/create-ellipsoid-mesh";
import { createEllipsoidTileMesh } from "../../globe/ellipsoid/create-ellipsoid-tile-mesh";
import { type QuadtreeTile } from "../../globe/imagery/quadtree-tile";
import { type Renderer, type RendererFrame } from "../interface/renderer";
import {
  globeFragmentShader,
  globeVertexShader,
  imageryTileFragmentShader,
  imageryTileVertexShader,
  modelFragmentShader,
  modelVertexShader,
  vectorLineFragmentShader,
  vectorLineVertexShader,
} from "./shaders";

type GlobeProgram = {
  program: WebGLProgram;
  uProjection: WebGLUniformLocation;
  uView: WebGLUniformLocation;
  uModel: WebGLUniformLocation;
  uImageryEnabled: WebGLUniformLocation;
  uImagery: WebGLUniformLocation;
  uSunDirection: WebGLUniformLocation;
};

type TileProgram = {
  program: WebGLProgram;
  uProjection: WebGLUniformLocation;
  uView: WebGLUniformLocation;
  uModel: WebGLUniformLocation;
  uImagery: WebGLUniformLocation;
  uSunDirection: WebGLUniformLocation;
};

type VectorProgram = {
  program: WebGLProgram;
  uProjection: WebGLUniformLocation;
  uView: WebGLUniformLocation;
  uModel: WebGLUniformLocation;
  uCameraPosition: WebGLUniformLocation;
};

type ModelProgram = {
  program: WebGLProgram;
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
  vertexBuffer: WebGLBuffer;
  indexBuffer: WebGLBuffer;
  indexCount: number;
  indexType: number;
  texture?: WebGLTexture;
  textureEnabled?: boolean;
};

type GpuLineMesh = {
  vao: WebGLVertexArrayObject;
  vertexBuffer: WebGLBuffer;
  vertexCount: number;
};

type TileEntry = {
  mesh: GpuMesh;
  texture: WebGLTexture;
  ready: boolean;
};

export class WebGL2Renderer implements Renderer {
  readonly supported: boolean;
  readonly backend = "webgl2" as const;
  readonly capabilities: Renderer["capabilities"];
  private readonly gl: WebGL2RenderingContext | null;
  private readonly program: GlobeProgram | null = null;
  private readonly tileProgram: TileProgram | null = null;
  private readonly vectorProgram: VectorProgram | null = null;
  private readonly modelProgram: ModelProgram | null = null;
  private readonly globe: GpuMesh | null = null;
  private debugModel: GpuMesh | null = null;
  private imageryTexture: WebGLTexture | null = null;
  private imageryEnabled = false;
  private vectorLines: GpuLineMesh | null = null;
  private vectorLinesVisible = false;
  private debugModelVisible = false;
  private debugModelBaseColorFactor: [number, number, number, number] = [1, 0.75, 0.15, 1];
  private sunDirection: Vec3 = normalize([-0.25, 0.52, 0.82]);
  private readonly tileEntries = new Map<string, TileEntry>();
  private readonly activeTileIds = new Set<string>();

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.gl = canvas.getContext("webgl2", { antialias: true, alpha: false });
    this.supported = this.gl !== null;
    this.capabilities = this.gl
      ? {
          backend: this.backend,
          maxTextureSize: this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number,
          supportsInstancing: true,
          supportsFloatTextures: this.gl.getExtension("EXT_color_buffer_float") !== null,
        }
      : {
          backend: this.backend,
          maxTextureSize: 0,
          supportsInstancing: false,
          supportsFloatTextures: false,
        };

    if (!this.gl) {
      return;
    }

    this.program = createGlobeProgram(this.gl);
    this.tileProgram = createTileProgram(this.gl);
    this.vectorProgram = createVectorProgram(this.gl);
    this.modelProgram = createModelProgram(this.gl);
    this.globe = uploadMesh(this.gl, createEllipsoidMesh());
    this.imageryTexture = createPlaceholderTexture(this.gl);
    this.gl.enable(this.gl.DEPTH_TEST);
    this.gl.enable(this.gl.CULL_FACE);
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

  setVectorLines(lines: readonly (readonly [number, number])[][]): void {
    if (!this.gl) {
      return;
    }

    if (this.vectorLines) {
      this.gl.deleteVertexArray(this.vectorLines.vao);
      this.gl.deleteBuffer(this.vectorLines.vertexBuffer);
      this.vectorLines = null;
    }

    this.vectorLines = uploadLineMesh(this.gl, lines);
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
      this.gl.deleteVertexArray(this.debugModel.vao);
      this.gl.deleteBuffer(this.debugModel.vertexBuffer);
      this.gl.deleteBuffer(this.debugModel.indexBuffer);
      if (this.debugModel.texture) {
        this.gl.deleteTexture(this.debugModel.texture);
      }
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
    );
    this.debugModelBaseColorFactor = mesh.baseColorFactor ?? [1, 1, 1, 1];

    if (mesh.baseColorTexture) {
      this.debugModel.texture = createModelTexture(this.gl, mesh.baseColorTexture);
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

  render({ scene, camera }: RendererFrame): void {
    if (!this.gl || !this.program || !this.globe) {
      return;
    }

    this.resize();

    const aspect = this.canvas.width / this.canvas.height;
    const projection = camera.projectionMatrix(aspect);
    const view = camera.viewMatrix();

    this.gl.clearColor(0.012, 0.022, 0.028, 1);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
    this.gl.useProgram(this.program.program);
    this.gl.uniformMatrix4fv(this.program.uProjection, false, projection);
    this.gl.uniformMatrix4fv(this.program.uView, false, view);
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.imageryTexture);
    this.gl.uniform1i(this.program.uImagery, 0);
    this.gl.uniform1i(this.program.uImageryEnabled, this.imageryEnabled ? 1 : 0);
    this.gl.uniform3fv(this.program.uSunDirection, this.sunDirection);
    this.gl.bindVertexArray(this.globe.vao);

    for (const node of scene.visibleNodes) {
      this.gl.uniformMatrix4fv(this.program.uModel, false, node.modelMatrix);
      this.gl.drawElements(this.gl.TRIANGLES, this.globe.indexCount, this.globe.indexType, 0);
    }

    if (this.imageryEnabled && this.activeTileIds.size > 0) {
      this.gl.clear(this.gl.DEPTH_BUFFER_BIT);
      this.renderImageryTiles(projection, view);
    }

    this.renderVectorLines(projection, view, camera.position);
    this.renderDebugModel(projection, view);
  }

  destroy(): void {
    if (!this.gl || !this.program || !this.globe) {
      return;
    }

    this.gl.deleteVertexArray(this.globe.vao);
    this.gl.deleteBuffer(this.globe.vertexBuffer);
    this.gl.deleteBuffer(this.globe.indexBuffer);
    this.gl.deleteTexture(this.imageryTexture);
    this.gl.deleteProgram(this.program.program);

    if (this.tileProgram) {
      this.gl.deleteProgram(this.tileProgram.program);
    }

    if (this.vectorProgram) {
      this.gl.deleteProgram(this.vectorProgram.program);
    }

    if (this.modelProgram) {
      this.gl.deleteProgram(this.modelProgram.program);
    }

    if (this.debugModel) {
      this.gl.deleteVertexArray(this.debugModel.vao);
      this.gl.deleteBuffer(this.debugModel.vertexBuffer);
      this.gl.deleteBuffer(this.debugModel.indexBuffer);
      if (this.debugModel.texture) {
        this.gl.deleteTexture(this.debugModel.texture);
      }
    }

    if (this.vectorLines) {
      this.gl.deleteVertexArray(this.vectorLines.vao);
      this.gl.deleteBuffer(this.vectorLines.vertexBuffer);
    }

    for (const entry of this.tileEntries.values()) {
      this.gl.deleteVertexArray(entry.mesh.vao);
      this.gl.deleteBuffer(entry.mesh.vertexBuffer);
      this.gl.deleteBuffer(entry.mesh.indexBuffer);
      this.gl.deleteTexture(entry.texture);
    }
  }

  private renderImageryTiles(projection: Float32Array, view: Float32Array): void {
    if (!this.gl || !this.tileProgram) {
      return;
    }

    this.gl.useProgram(this.tileProgram.program);
    this.gl.enable(this.gl.POLYGON_OFFSET_FILL);
    this.gl.enable(this.gl.BLEND);
    this.gl.depthMask(false);
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
    this.gl.polygonOffset(-1, -1);
    this.gl.uniformMatrix4fv(this.tileProgram.uProjection, false, projection);
    this.gl.uniformMatrix4fv(this.tileProgram.uView, false, view);
    this.gl.uniformMatrix4fv(this.tileProgram.uModel, false, new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]));
    this.gl.uniform3fv(this.tileProgram.uSunDirection, this.sunDirection);

    for (const id of this.activeTileIds) {
      const entry = this.tileEntries.get(id);

      if (!entry?.ready) {
        continue;
      }

      this.gl.activeTexture(this.gl.TEXTURE0);
      this.gl.bindTexture(this.gl.TEXTURE_2D, entry.texture);
      this.gl.uniform1i(this.tileProgram.uImagery, 0);
      this.gl.bindVertexArray(entry.mesh.vao);
      this.gl.drawElements(this.gl.TRIANGLES, entry.mesh.indexCount, entry.mesh.indexType, 0);
    }

    this.gl.depthMask(true);
    this.gl.disable(this.gl.BLEND);
    this.gl.disable(this.gl.POLYGON_OFFSET_FILL);
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

    const entry = {
      mesh: uploadTileMesh(this.gl, createEllipsoidTileMesh(tile)),
      texture: createDebugTileTexture(this.gl),
      ready: false,
    };
    this.tileEntries.set(tile.id, entry);
    return entry;
  }
}

function createGlobeProgram(gl: WebGL2RenderingContext): GlobeProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, globeVertexShader);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, globeFragmentShader);
  const program = gl.createProgram();

  if (!program) {
    throw new Error("Unable to create WebGL2 program");
  }

  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.bindAttribLocation(program, 0, "position");
  gl.bindAttribLocation(program, 1, "normal");
  gl.bindAttribLocation(program, 2, "geodeticNormal");
  gl.bindAttribLocation(program, 3, "imageryUv");
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);

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

  return { program, uProjection, uView, uModel, uImageryEnabled, uImagery, uSunDirection };
}

function createTileProgram(gl: WebGL2RenderingContext): TileProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, imageryTileVertexShader);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, imageryTileFragmentShader);
  const program = gl.createProgram();

  if (!program) {
    throw new Error("Unable to create WebGL2 tile program");
  }

  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.bindAttribLocation(program, 0, "position");
  gl.bindAttribLocation(program, 1, "normal");
  gl.bindAttribLocation(program, 2, "uv");
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? "Unable to link WebGL2 tile program");
  }

  const uProjection = gl.getUniformLocation(program, "uProjection");
  const uView = gl.getUniformLocation(program, "uView");
  const uModel = gl.getUniformLocation(program, "uModel");
  const uImagery = gl.getUniformLocation(program, "uImagery");
  const uSunDirection = gl.getUniformLocation(program, "uSunDirection");

  if (!uProjection || !uView || !uModel || !uImagery || !uSunDirection) {
    throw new Error("Missing WebGL2 tile uniform");
  }

  return { program, uProjection, uView, uModel, uImagery, uSunDirection };
}

function createVectorProgram(gl: WebGL2RenderingContext): VectorProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vectorLineVertexShader);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, vectorLineFragmentShader);
  const program = gl.createProgram();

  if (!program) {
    throw new Error("Unable to create WebGL2 vector program");
  }

  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.bindAttribLocation(program, 0, "position");
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);

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

  return { program, uProjection, uView, uModel, uCameraPosition };
}

function createModelProgram(gl: WebGL2RenderingContext): ModelProgram {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, modelVertexShader);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, modelFragmentShader);
  const program = gl.createProgram();

  if (!program) {
    throw new Error("Unable to create WebGL2 model program");
  }

  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.bindAttribLocation(program, 0, "position");
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);

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
    uProjection,
    uView,
    uModel,
    uBaseColorFactor,
    uTextureEnabled,
    uBaseColorTexture,
    uSunDirection,
  };
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);

  if (!shader) {
    throw new Error("Unable to create WebGL2 shader");
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? "Unable to compile WebGL2 shader");
  }

  return shader;
}

function uploadMesh(gl: WebGL2RenderingContext, mesh: ReturnType<typeof createEllipsoidMesh>): GpuMesh {
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
    vertexBuffer,
    indexBuffer,
    indexCount: mesh.indices.length,
    indexType: gl.UNSIGNED_SHORT,
  };
}

function uploadTileMesh(
  gl: WebGL2RenderingContext,
  mesh: ReturnType<typeof createEllipsoidTileMesh>,
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
    vertexBuffer,
    indexBuffer,
    indexCount: mesh.indices.length,
    indexType: gl.UNSIGNED_SHORT,
  };
}

function uploadSimpleMesh(
  gl: WebGL2RenderingContext,
  mesh: { vertices: Float32Array; indices: Uint16Array | Uint32Array },
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
    vertexBuffer,
    indexBuffer,
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
  const maxRadius = ellipsoid.maximumRadius;
  const center = scalePosition(ellipsoid.cartographicToCartesian({ lon, lat, height: placement.height }), maxRadius);
  const up = normalize(center);
  const east = normalize(cross([0, 1, 0], up));
  const north = normalize(cross(up, east));
  const unitScale = placement.scale / maxRadius;
  const vertices: number[] = [];

  for (let index = 0; index < positions.length; index += 3) {
    const localX = positions[index];
    const localY = positions[index + 1];
    const localZ = positions[index + 2];
    const worldPosition = add(
      add(add(center, scale(east, localX * unitScale)), scale(up, localY * unitScale)),
      scale(north, localZ * unitScale),
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
    vertexBuffer,
    vertexCount: vertices.length / 3,
  };
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

function scalePosition(position: Vec3, maxRadius: number): [number, number, number] {
  return [position[0] / maxRadius, position[1] / maxRadius, position[2] / maxRadius];
}

function identityMatrix(): Float32Array {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

function createPlaceholderTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const texture = gl.createTexture();

  if (!texture) {
    throw new Error("Unable to allocate imagery texture");
  }

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
    new Uint8Array([18, 42, 50, 255]),
  );
  gl.generateMipmap(gl.TEXTURE_2D);
  return texture;
}

function createTileTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const texture = createPlaceholderTexture(gl);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

function createDebugTileTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const texture = createPlaceholderTexture(gl);
  gl.bindTexture(gl.TEXTURE_2D, texture);
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

function createModelTexture(gl: WebGL2RenderingContext, image: TexImageSource): WebGLTexture {
  const texture = createPlaceholderTexture(gl);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.generateMipmap(gl.TEXTURE_2D);
  return texture;
}
