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
  @location(1) imageryUv: vec2<f32>,
};

struct GlobeUniforms {
  viewProjection: mat4x4<f32>,
  imageryReady: f32,
  _padding0: vec3<f32>,
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
  @location(2) imageryUv: vec2<f32>
) -> VertexOutput {
  var output: VertexOutput;
  output.position = uUniforms.viewProjection * vec4<f32>(position, 1.0);
  output.normal = normal;
  output.imageryUv = imageryUv;
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
@fragment
fn main(@location(0) normal: vec3<f32>, @location(1) imageryUv: vec2<f32>) -> @location(0) vec4<f32> {
  let light = normalize(vec3<f32>(-0.25, 0.52, 0.82));
  let diffuse = max(dot(normalize(normal), light), 0.0);
  let imagery = textureSample(uImagery, uImagerySampler, imageryUv).rgb;
  let ocean = vec3<f32>(0.025, 0.32, 0.42);
  let land = vec3<f32>(0.18, 0.50, 0.28);
  let procedural = mix(ocean, land, smoothstep(-0.25, 0.65, normalize(normal).y));
  let polarMask = smoothstep(0.965, 0.998, abs(normalize(normal).y));
  let polar = select(vec3<f32>(0.72, 0.86, 0.90), vec3<f32>(0.82, 0.93, 0.94), normal.y > 0.0);
  let textured = mix(imagery, polar, polarMask);
  let surface = mix(procedural, textured, uUniforms.imageryReady);
  return vec4<f32>(surface * (0.48 + diffuse * 0.72), 1.0);
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

struct GlobeUniforms {
  viewProjection: mat4x4<f32>,
  imageryReady: f32,
  _padding0: vec3<f32>,
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
@fragment
fn main(@location(0) normal: vec3<f32>, @location(1) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let light = normalize(vec3<f32>(-0.25, 0.52, 0.82));
  let diffuse = max(dot(normalize(normal), light), 0.0);
  let imagery = textureSample(uImagery, uImagerySampler, uv).rgb;
  let edgeDistance = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  let edgeFade = smoothstep(0.0, 0.025, edgeDistance);
  return vec4<f32>(imagery * (0.42 + diffuse * 0.72), 0.86 * edgeFade);
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
