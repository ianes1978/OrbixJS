import { createShaderSource, type ShaderProgramSource } from "../interface/shader-source";

export const webGpuGlobeVertexShader = createShaderSource({
  id: "webgpu.globe.vertex",
  backend: "webgpu",
  language: "wgsl",
  stage: "vertex",
  source: `
struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) normal: vec3<f32>,
  @location(1) uv: vec2<f32>,
};

struct GlobeUniforms {
  viewProjection: mat4x4<f32>,
  imageryState: vec4<f32>,
};

@group(0) @binding(0)
var<uniform> uUniforms: GlobeUniforms;
@group(0) @binding(1)
var uImagerySampler: sampler;
@group(0) @binding(2)
var uImagery: texture_2d<f32>;

@vertex
fn main(
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) geodeticNormal: vec3<f32>,
  @location(3) uv: vec2<f32>
) -> VertexOutput {
  var output: VertexOutput;
  output.position = uUniforms.viewProjection * vec4<f32>(position, 1.0);
  output.normal = geodeticNormal;
  output.uv = uv;
  return output;
}
`,
});

export const webGpuGlobeFragmentShader = createShaderSource({
  id: "webgpu.globe.fragment",
  backend: "webgpu",
  language: "wgsl",
  stage: "fragment",
  source: `
struct GlobeUniforms {
  viewProjection: mat4x4<f32>,
  imageryState: vec4<f32>,
};

@group(0) @binding(0)
var<uniform> uUniforms: GlobeUniforms;
@group(0) @binding(1)
var uImagerySampler: sampler;
@group(0) @binding(2)
var uImagery: texture_2d<f32>;

@fragment
fn main(@location(0) normal: vec3<f32>, @location(1) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let light = normalize(vec3<f32>(-0.25, 0.52, 0.82));
  let diffuse = max(dot(normalize(normal), light), 0.0);
  let ocean = vec3<f32>(0.025, 0.32, 0.42);
  let land = vec3<f32>(0.18, 0.50, 0.28);
  let unitNormal = normalize(normal);
  let procedural = mix(ocean, land, smoothstep(-0.25, 0.65, unitNormal.y));
  let polarMask = smoothstep(0.965, 0.998, abs(unitNormal.y));
  let polar = select(vec3<f32>(0.72, 0.86, 0.90), vec3<f32>(0.82, 0.93, 0.94), normal.y > 0.0);
  let surface = mix(procedural, polar, polarMask);
  let imagery = textureSample(uImagery, uImagerySampler, uv).rgb;
  let baseColor = mix(surface, imagery, uUniforms.imageryState.x);
  return vec4<f32>(baseColor * (0.48 + diffuse * 0.72), 1.0);
}
`,
});

export const webGpuGlobeProgram: ShaderProgramSource = {
  id: "webgpu.globe",
  backend: "webgpu",
  language: "wgsl",
  vertex: webGpuGlobeVertexShader,
  fragment: webGpuGlobeFragmentShader,
};

export const webGpuImageryTileVertexShader = createShaderSource({
  id: "webgpu.imageryTile.vertex",
  backend: "webgpu",
  language: "wgsl",
  stage: "vertex",
  source: `
struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) normal: vec3<f32>,
  @location(1) uv: vec2<f32>,
};

struct TileUniforms {
  viewProjection: mat4x4<f32>,
  imageryState: vec4<f32>,
};

@group(0) @binding(0)
var<uniform> uUniforms: TileUniforms;

@vertex
fn main(
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) uv: vec2<f32>
) -> VertexOutput {
  var output: VertexOutput;
  output.position = uUniforms.viewProjection * vec4<f32>(position, 1.0);
  output.normal = normal;
  output.uv = uv;
  return output;
}
`,
});

export const webGpuImageryTileFragmentShader = createShaderSource({
  id: "webgpu.imageryTile.fragment",
  backend: "webgpu",
  language: "wgsl",
  stage: "fragment",
  source: `
struct TileUniforms {
  viewProjection: mat4x4<f32>,
  imageryState: vec4<f32>,
};

@group(0) @binding(0)
var<uniform> uUniforms: TileUniforms;
@group(0) @binding(1)
var uImagerySampler: sampler;
@group(0) @binding(2)
var uImagery: texture_2d<f32>;

@fragment
fn main(@location(0) normal: vec3<f32>, @location(1) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let light = normalize(vec3<f32>(-0.25, 0.52, 0.82));
  let diffuse = max(dot(normalize(normal), light), 0.0);
  let imagery = textureSample(uImagery, uImagerySampler, uv).rgb;
  let edgeDistance = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  let edgeLine = 1.0 - smoothstep(0.0, 0.012, edgeDistance);
  let color = imagery * (0.42 + diffuse * 0.72);
  let lineColor = vec3<f32>(0.36, 0.95, 1.0);
  return vec4<f32>(mix(color, lineColor, edgeLine * 0.28 * uUniforms.imageryState.y), 1.0);
}
`,
});

export const webGpuImageryTileProgram: ShaderProgramSource = {
  id: "webgpu.imageryTile",
  backend: "webgpu",
  language: "wgsl",
  vertex: webGpuImageryTileVertexShader,
  fragment: webGpuImageryTileFragmentShader,
};

export const webGpuTerrainVertexShader = createShaderSource({
  id: "webgpu.terrain.vertex",
  backend: "webgpu",
  language: "wgsl",
  stage: "vertex",
  source: `
struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) normal: vec3<f32>,
  @location(1) worldPosition: vec3<f32>,
  @location(2) uv: vec2<f32>,
  @location(3) imageryUv: vec2<f32>,
};

struct TerrainUniforms {
  viewProjection: mat4x4<f32>,
  imageryState: vec4<f32>,
};

struct TerrainTileUniforms {
  tileKey: vec4<f32>,
  params: vec4<f32>,
  imageryUv: vec4<f32>,
};

@group(0) @binding(0)
var<uniform> uUniforms: TerrainUniforms;
@group(0) @binding(3)
var uHeightmap: texture_2d<f32>;
@group(0) @binding(4)
var<uniform> uTerrain: TerrainTileUniforms;

const PI = 3.141592653589793;
const WGS84_A = 6378137.0;
const WGS84_B = 6356752.314245179;

fn webMercatorYToLatitude(y: f32) -> f32 {
  let n = PI * (1.0 - 2.0 * y);
  return atan(0.5 * (exp(n) - exp(-n)));
}

fn ellipsoidNormalAt(lon: f32, lat: f32) -> vec3<f32> {
  let cosLat = cos(lat);
  return normalize(vec3<f32>(cosLat * cos(lon), sin(lat), -cosLat * sin(lon)));
}

fn sampleTerrainHeight(sampleUv: vec2<f32>) -> f32 {
  let dimensions = vec2<i32>(textureDimensions(uHeightmap));
  let maxCoord = max(dimensions - vec2<i32>(1, 1), vec2<i32>(1, 1));
  let coord = vec2<i32>(round(clamp(sampleUv, vec2<f32>(0.0), vec2<f32>(1.0)) * vec2<f32>(maxCoord)));
  return textureLoad(uHeightmap, clamp(coord, vec2<i32>(0, 0), maxCoord), 0).r * uTerrain.tileKey.w;
}

fn terrainWorldAt(sampleUv: vec2<f32>) -> vec3<f32> {
  let tileCount = exp2(uTerrain.tileKey.x);
  let globalX = (uTerrain.tileKey.y + sampleUv.x) / tileCount;
  let globalY = (uTerrain.tileKey.z + sampleUv.y) / tileCount;
  let lon = globalX * PI * 2.0 - PI;
  let lat = webMercatorYToLatitude(globalY);
  let height = sampleTerrainHeight(sampleUv);
  let normal = ellipsoidNormalAt(lon, lat);
  return normal * vec3<f32>(WGS84_A + height, WGS84_B + height, WGS84_A + height) / WGS84_A;
}

@vertex
fn main(
  @location(0) patchPosition: vec3<f32>,
  @location(1) _normal: vec3<f32>,
  @location(2) uv: vec2<f32>
) -> VertexOutput {
  let tileCount = exp2(uTerrain.tileKey.x);
  let globalX = (uTerrain.tileKey.y + uv.x) / tileCount;
  let globalY = (uTerrain.tileKey.z + uv.y) / tileCount;
  let lon = globalX * PI * 2.0 - PI;
  let lat = webMercatorYToLatitude(globalY);
  let height = sampleTerrainHeight(uv) - patchPosition.z * uTerrain.params.x;
  let ellipsoidNormal = ellipsoidNormalAt(lon, lat);
  let world = ellipsoidNormal * vec3<f32>(WGS84_A + height, WGS84_B + height, WGS84_A + height) / WGS84_A;
  let dimensions = vec2<f32>(textureDimensions(uHeightmap));
  let texel = 1.0 / max(dimensions - vec2<f32>(1.0), vec2<f32>(1.0));
  let west = terrainWorldAt(uv - vec2<f32>(texel.x, 0.0));
  let east = terrainWorldAt(uv + vec2<f32>(texel.x, 0.0));
  let north = terrainWorldAt(uv - vec2<f32>(0.0, texel.y));
  let south = terrainWorldAt(uv + vec2<f32>(0.0, texel.y));
  var terrainNormal = normalize(cross(east - west, north - south));

  if (dot(terrainNormal, ellipsoidNormal) < 0.0) {
    terrainNormal = -terrainNormal;
  }

  var output: VertexOutput;
  output.position = uUniforms.viewProjection * vec4<f32>(world, 1.0);
  output.normal = select(terrainNormal, ellipsoidNormal, patchPosition.z > 0.5);
  output.worldPosition = world;
  output.uv = uv;
  output.imageryUv = uv * uTerrain.imageryUv.xy + uTerrain.imageryUv.zw;
  return output;
}
`,
});

export const webGpuTerrainFragmentShader = createShaderSource({
  id: "webgpu.terrain.fragment",
  backend: "webgpu",
  language: "wgsl",
  stage: "fragment",
  source: `
struct TerrainUniforms {
  viewProjection: mat4x4<f32>,
  imageryState: vec4<f32>,
};

@group(0) @binding(0)
var<uniform> uUniforms: TerrainUniforms;
@group(0) @binding(1)
var uImagerySampler: sampler;
@group(0) @binding(2)
var uImagery: texture_2d<f32>;

@fragment
fn main(
  @location(0) normal: vec3<f32>,
  @location(1) worldPosition: vec3<f32>,
  @location(2) uv: vec2<f32>,
  @location(3) imageryUv: vec2<f32>
) -> @location(0) vec4<f32> {
  let light = normalize(vec3<f32>(-0.25, 0.52, 0.82));
  let unitNormal = normalize(normal);
  let diffuse = max(dot(unitNormal, light), 0.0);
  let rim = pow(1.0 - max(dot(unitNormal, normalize(-worldPosition)), 0.0), 3.2);
  var color = textureSample(uImagery, uImagerySampler, imageryUv).rgb * (0.42 + diffuse * 0.72) + rim * vec3<f32>(0.035, 0.09, 0.11);
  let edgeDistance = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  let edgeLine = 1.0 - smoothstep(0.0, 0.012, edgeDistance);
  color = mix(color, vec3<f32>(0.24, 0.88, 0.82), select(0.0, edgeLine * 0.22, uUniforms.imageryState.y > 0.5));
  return vec4<f32>(color, 1.0);
}
`,
});

export const webGpuTerrainProgram: ShaderProgramSource = {
  id: "webgpu.terrain",
  backend: "webgpu",
  language: "wgsl",
  vertex: webGpuTerrainVertexShader,
  fragment: webGpuTerrainFragmentShader,
};

export const webGpuVectorLineVertexShader = createShaderSource({
  id: "webgpu.vectorLine.vertex",
  backend: "webgpu",
  language: "wgsl",
  stage: "vertex",
  source: `
struct VectorUniforms {
  viewProjection: mat4x4<f32>,
};

@group(0) @binding(0)
var<uniform> uUniforms: VectorUniforms;

@vertex
fn main(@location(0) position: vec3<f32>) -> @builtin(position) vec4<f32> {
  return uUniforms.viewProjection * vec4<f32>(position, 1.0);
}
`,
});

export const webGpuVectorLineFragmentShader = createShaderSource({
  id: "webgpu.vectorLine.fragment",
  backend: "webgpu",
  language: "wgsl",
  stage: "fragment",
  source: `
@fragment
fn main() -> @location(0) vec4<f32> {
  return vec4<f32>(1.0, 0.86, 0.12, 0.86);
}
`,
});

export const webGpuVectorLineProgram: ShaderProgramSource = {
  id: "webgpu.vectorLine",
  backend: "webgpu",
  language: "wgsl",
  vertex: webGpuVectorLineVertexShader,
  fragment: webGpuVectorLineFragmentShader,
};

export const webGpuModelVertexShader = createShaderSource({
  id: "webgpu.model.vertex",
  backend: "webgpu",
  language: "wgsl",
  stage: "vertex",
  source: `
struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) worldPosition: vec3<f32>,
  @location(1) uv: vec2<f32>,
};

struct ModelUniforms {
  viewProjection: mat4x4<f32>,
  baseColor: vec4<f32>,
};

@group(0) @binding(0)
var<uniform> uUniforms: ModelUniforms;

@vertex
fn main(@location(0) position: vec3<f32>, @location(1) uv: vec2<f32>) -> VertexOutput {
  var output: VertexOutput;
  output.position = uUniforms.viewProjection * vec4<f32>(position, 1.0);
  output.worldPosition = position;
  output.uv = uv;
  return output;
}
`,
});

export const webGpuModelFragmentShader = createShaderSource({
  id: "webgpu.model.fragment",
  backend: "webgpu",
  language: "wgsl",
  stage: "fragment",
  source: `
struct ModelUniforms {
  viewProjection: mat4x4<f32>,
  baseColor: vec4<f32>,
};

@group(0) @binding(0)
var<uniform> uUniforms: ModelUniforms;

@fragment
fn main(@location(0) worldPosition: vec3<f32>, @location(1) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let light = normalize(vec3<f32>(-0.25, 0.52, 0.82));
  let normal = normalize(worldPosition);
  let diffuse = max(dot(normal, light), 0.0);
  let uvTint = vec3<f32>(0.92 + uv.x * 0.08, 0.90 + uv.y * 0.10, 1.0);
  return vec4<f32>(uUniforms.baseColor.rgb * uvTint * (0.42 + diffuse * 0.78), uUniforms.baseColor.a);
}
`,
});

export const webGpuModelProgram: ShaderProgramSource = {
  id: "webgpu.model",
  backend: "webgpu",
  language: "wgsl",
  vertex: webGpuModelVertexShader,
  fragment: webGpuModelFragmentShader,
};
