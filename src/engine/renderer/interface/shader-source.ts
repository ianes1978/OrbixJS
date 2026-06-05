import { type RendererBackend } from "./renderer";

export type ShaderLanguage = "glsl300es" | "wgsl";

export type ShaderStage = "vertex" | "fragment" | "compute";

export type ShaderSource = {
  id: string;
  backend: RendererBackend;
  language: ShaderLanguage;
  stage: ShaderStage;
  source: string;
};

export type ShaderProgramSource = {
  id: string;
  backend: RendererBackend;
  language: ShaderLanguage;
  vertex: ShaderSource;
  fragment: ShaderSource;
};

export function createShaderSource(source: ShaderSource): ShaderSource {
  return source;
}
