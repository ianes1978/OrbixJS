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
};

@group(0) @binding(0)
var<uniform> uViewProjection: mat4x4<f32>;

@vertex
fn main(@location(0) position: vec3<f32>, @location(1) normal: vec3<f32>) -> VertexOutput {
  var output: VertexOutput;
  output.position = uViewProjection * vec4<f32>(position, 1.0);
  output.normal = normal;
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
fn main(@location(0) normal: vec3<f32>) -> @location(0) vec4<f32> {
  let light = normalize(vec3<f32>(-0.25, 0.52, 0.82));
  let diffuse = max(dot(normalize(normal), light), 0.0);
  let ocean = vec3<f32>(0.025, 0.22, 0.32);
  let land = vec3<f32>(0.15, 0.42, 0.30);
  let surface = mix(ocean, land, smoothstep(-0.15, 0.55, normal.y));
  return vec4<f32>(surface * (0.35 + diffuse * 0.75), 1.0);
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
