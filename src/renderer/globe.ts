type GlobeDemo = {
  supported: boolean;
  destroy: () => void;
};

type ProgramInfo = {
  program: WebGLProgram;
  position: number;
  normal: number;
  uProjection: WebGLUniformLocation;
  uView: WebGLUniformLocation;
  uModel: WebGLUniformLocation;
};

const vertexShaderSource = `#version 300 es
in vec3 position;
in vec3 normal;

uniform mat4 uProjection;
uniform mat4 uView;
uniform mat4 uModel;

out vec3 vNormal;
out vec3 vPosition;

void main() {
  vec4 worldPosition = uModel * vec4(position, 1.0);
  vPosition = worldPosition.xyz;
  vNormal = mat3(uModel) * normal;
  gl_Position = uProjection * uView * worldPosition;
}
`;

const fragmentShaderSource = `#version 300 es
precision highp float;

in vec3 vNormal;
in vec3 vPosition;

out vec4 outColor;

void main() {
  vec3 normal = normalize(vNormal);
  vec3 light = normalize(vec3(-0.3, 0.5, 0.8));
  float diffuse = max(dot(normal, light), 0.0);
  float rim = pow(1.0 - max(dot(normal, normalize(-vPosition)), 0.0), 2.0);
  vec3 ocean = vec3(0.02, 0.24, 0.36);
  vec3 land = vec3(0.16, 0.48, 0.32);
  float bands = smoothstep(-0.15, 0.25, sin(vPosition.y * 8.0) * cos(vPosition.x * 5.0));
  vec3 base = mix(ocean, land, bands * 0.45);
  vec3 color = base * (0.28 + diffuse * 0.82) + rim * vec3(0.35, 0.75, 0.95);
  outColor = vec4(color, 1.0);
}
`;

export function createGlobeDemo(canvas: HTMLCanvasElement): GlobeDemo {
  const gl = canvas.getContext("webgl2", { antialias: true });

  if (!gl) {
    const fallback = canvas.getContext("2d");
    fallback?.fillText("WebGL2 non disponibile", 24, 48);
    return { supported: false, destroy: () => undefined };
  }

  const program = createProgramInfo(gl);
  const mesh = createSphere(gl, 72, 36);
  let frame = 0;
  let disposed = false;

  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);

  const render = (time: number) => {
    if (disposed) {
      return;
    }

    resizeCanvas(canvas, gl);

    const aspect = canvas.width / canvas.height;
    const projection = perspective((45 * Math.PI) / 180, aspect, 0.1, 100);
    const view = lookAt([0, 0.3, 3.2], [0, 0, 0], [0, 1, 0]);
    const model = rotateY(identity(), time * 0.00008);

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.015, 0.025, 0.035, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(program.program);
    gl.uniformMatrix4fv(program.uProjection, false, projection);
    gl.uniformMatrix4fv(program.uView, false, view);
    gl.uniformMatrix4fv(program.uModel, false, model);
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_SHORT, 0);

    frame = requestAnimationFrame(render);
  };

  frame = requestAnimationFrame(render);

  return {
    supported: true,
    destroy: () => {
      disposed = true;
      cancelAnimationFrame(frame);
      gl.deleteVertexArray(mesh.vao);
      gl.deleteBuffer(mesh.vertexBuffer);
      gl.deleteBuffer(mesh.indexBuffer);
      gl.deleteProgram(program.program);
    },
  };
}

function createProgramInfo(gl: WebGL2RenderingContext): ProgramInfo {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
  const program = gl.createProgram();

  if (!program) {
    throw new Error("Unable to create WebGL program");
  }

  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? "Unable to link WebGL program");
  }

  const uProjection = gl.getUniformLocation(program, "uProjection");
  const uView = gl.getUniformLocation(program, "uView");
  const uModel = gl.getUniformLocation(program, "uModel");

  if (!uProjection || !uView || !uModel) {
    throw new Error("Missing WebGL uniform location");
  }

  return {
    program,
    position: gl.getAttribLocation(program, "position"),
    normal: gl.getAttribLocation(program, "normal"),
    uProjection,
    uView,
    uModel,
  };
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);

  if (!shader) {
    throw new Error("Unable to create WebGL shader");
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? "Unable to compile WebGL shader");
  }

  return shader;
}

function createSphere(gl: WebGL2RenderingContext, longitudeBands: number, latitudeBands: number) {
  const vertices: number[] = [];
  const indices: number[] = [];

  for (let lat = 0; lat <= latitudeBands; lat += 1) {
    const theta = (lat * Math.PI) / latitudeBands;
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);

    for (let lon = 0; lon <= longitudeBands; lon += 1) {
      const phi = (lon * 2 * Math.PI) / longitudeBands;
      const x = Math.cos(phi) * sinTheta;
      const y = cosTheta;
      const z = Math.sin(phi) * sinTheta;
      vertices.push(x, y, z, x, y, z);
    }
  }

  for (let lat = 0; lat < latitudeBands; lat += 1) {
    for (let lon = 0; lon < longitudeBands; lon += 1) {
      const first = lat * (longitudeBands + 1) + lon;
      const second = first + longitudeBands + 1;
      indices.push(first, second, first + 1, second, second + 1, first + 1);
    }
  }

  const vao = gl.createVertexArray();
  const vertexBuffer = gl.createBuffer();
  const indexBuffer = gl.createBuffer();

  if (!vao || !vertexBuffer || !indexBuffer) {
    throw new Error("Unable to create sphere buffers");
  }

  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

  return {
    vao,
    vertexBuffer,
    indexBuffer,
    indexCount: indices.length,
  };
}

function resizeCanvas(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext) {
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.floor(canvas.clientWidth * pixelRatio));
  const height = Math.max(1, Math.floor(canvas.clientHeight * pixelRatio));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);
  }
}

function identity(): Float32Array {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
}

function rotateY(matrix: Float32Array, radians: number): Float32Array {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  matrix[0] = c;
  matrix[2] = -s;
  matrix[8] = s;
  matrix[10] = c;
  return matrix;
}

function perspective(fovy: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1.0 / Math.tan(fovy / 2);
  const rangeInv = 1 / (near - far);

  return new Float32Array([
    f / aspect,
    0,
    0,
    0,
    0,
    f,
    0,
    0,
    0,
    0,
    (near + far) * rangeInv,
    -1,
    0,
    0,
    near * far * rangeInv * 2,
    0,
  ]);
}

function lookAt(eye: Vec3, target: Vec3, up: Vec3): Float32Array {
  const z = normalize(subtract(eye, target));
  const x = normalize(cross(up, z));
  const y = cross(z, x);

  return new Float32Array([
    x[0],
    y[0],
    z[0],
    0,
    x[1],
    y[1],
    z[1],
    0,
    x[2],
    y[2],
    z[2],
    0,
    -dot(x, eye),
    -dot(y, eye),
    -dot(z, eye),
    1,
  ]);
}

type Vec3 = [number, number, number];

function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
}
