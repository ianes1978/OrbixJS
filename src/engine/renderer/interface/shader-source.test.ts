import { describe, expect, it } from "vitest";
import { webGpuGlobeProgram } from "../webgpu/wgsl-shaders";
import { createShaderSource } from "./shader-source";

describe("shader sources", () => {
  it("preserves backend, language and stage metadata", () => {
    const source = createShaderSource({
      id: "test.vertex",
      backend: "webgl2",
      language: "glsl300es",
      stage: "vertex",
      source: "void main() {}",
    });

    expect(source).toEqual({
      id: "test.vertex",
      backend: "webgl2",
      language: "glsl300es",
      stage: "vertex",
      source: "void main() {}",
    });
  });

  it("keeps WebGPU WGSL shader metadata separate from WebGL2 GLSL", () => {
    expect(webGpuGlobeProgram.backend).toBe("webgpu");
    expect(webGpuGlobeProgram.language).toBe("wgsl");
    expect(webGpuGlobeProgram.vertex.language).toBe("wgsl");
    expect(webGpuGlobeProgram.fragment.stage).toBe("fragment");
  });
});
