import { createEllipsoidMesh } from "../../globe/ellipsoid/create-ellipsoid-mesh";
import { createEllipsoidTileMesh } from "../../globe/ellipsoid/create-ellipsoid-tile-mesh";
import { type QuadtreeTile } from "../../globe/imagery/quadtree-tile";
import { type Renderer, type RendererFrame } from "../interface/renderer";
import {
  globeFragmentShader,
  globeVertexShader,
  imageryTileFragmentShader,
  imageryTileVertexShader,
} from "./shaders";

type GlobeProgram = {
  program: WebGLProgram;
  uProjection: WebGLUniformLocation;
  uView: WebGLUniformLocation;
  uModel: WebGLUniformLocation;
  uImageryEnabled: WebGLUniformLocation;
  uImagery: WebGLUniformLocation;
};

type TileProgram = {
  program: WebGLProgram;
  uProjection: WebGLUniformLocation;
  uView: WebGLUniformLocation;
  uModel: WebGLUniformLocation;
  uImagery: WebGLUniformLocation;
};

type GpuMesh = {
  vao: WebGLVertexArrayObject;
  vertexBuffer: WebGLBuffer;
  indexBuffer: WebGLBuffer;
  indexCount: number;
};

type TileEntry = {
  mesh: GpuMesh;
  texture: WebGLTexture;
};

export class WebGL2Renderer implements Renderer {
  readonly supported: boolean;
  private readonly gl: WebGL2RenderingContext | null;
  private readonly program: GlobeProgram | null = null;
  private readonly tileProgram: TileProgram | null = null;
  private readonly globe: GpuMesh | null = null;
  private imageryTexture: WebGLTexture | null = null;
  private imageryEnabled = false;
  private readonly tileEntries = new Map<string, TileEntry>();
  private readonly activeTileIds = new Set<string>();

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.gl = canvas.getContext("webgl2", { antialias: true, alpha: false });
    this.supported = this.gl !== null;

    if (!this.gl) {
      return;
    }

    this.program = createGlobeProgram(this.gl);
    this.tileProgram = createTileProgram(this.gl);
    this.globe = uploadMesh(this.gl, createEllipsoidMesh());
    this.imageryTexture = createPlaceholderTexture(this.gl);
    this.gl.enable(this.gl.DEPTH_TEST);
    this.gl.enable(this.gl.CULL_FACE);
  }

  setImageryTile(tile: QuadtreeTile, image: TexImageSource): void {
    if (!this.gl) {
      return;
    }

    const existing = this.tileEntries.get(tile.id);
    const mesh = existing?.mesh ?? uploadTileMesh(this.gl, createEllipsoidTileMesh(tile));
    const texture = existing?.texture ?? createTileTexture(this.gl);

    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, false);
    this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, image);
    this.gl.generateMipmap(this.gl.TEXTURE_2D);
    this.tileEntries.set(tile.id, { mesh, texture });
  }

  setActiveImageryTiles(ids: readonly string[]): void {
    this.activeTileIds.clear();

    for (const id of ids) {
      this.activeTileIds.add(id);
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
    this.gl.bindVertexArray(this.globe.vao);

    for (const node of scene.visibleNodes) {
      this.gl.uniformMatrix4fv(this.program.uModel, false, node.modelMatrix);
      this.gl.drawElements(this.gl.TRIANGLES, this.globe.indexCount, this.gl.UNSIGNED_SHORT, 0);
    }

    this.renderImageryTiles(projection, view);
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
    this.gl.polygonOffset(-1, -1);
    this.gl.uniformMatrix4fv(this.tileProgram.uProjection, false, projection);
    this.gl.uniformMatrix4fv(this.tileProgram.uView, false, view);
    this.gl.uniformMatrix4fv(this.tileProgram.uModel, false, new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]));

    for (const id of this.activeTileIds) {
      const entry = this.tileEntries.get(id);

      if (!entry) {
        continue;
      }

      this.gl.activeTexture(this.gl.TEXTURE0);
      this.gl.bindTexture(this.gl.TEXTURE_2D, entry.texture);
      this.gl.uniform1i(this.tileProgram.uImagery, 0);
      this.gl.bindVertexArray(entry.mesh.vao);
      this.gl.drawElements(this.gl.TRIANGLES, entry.mesh.indexCount, this.gl.UNSIGNED_SHORT, 0);
    }

    this.gl.disable(this.gl.POLYGON_OFFSET_FILL);
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

  if (!uProjection || !uView || !uModel || !uImageryEnabled || !uImagery) {
    throw new Error("Missing WebGL2 uniform");
  }

  return { program, uProjection, uView, uModel, uImageryEnabled, uImagery };
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

  if (!uProjection || !uView || !uModel || !uImagery) {
    throw new Error("Missing WebGL2 tile uniform");
  }

  return { program, uProjection, uView, uModel, uImagery };
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
  };
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
