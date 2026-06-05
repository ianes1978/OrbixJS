import { afterEach, describe, expect, it, vi } from "vitest";
import { WebGPURenderer } from "./webgpu-renderer";

describe("WebGPURenderer", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("initializes a WebGPU device and canvas context", async () => {
    vi.stubGlobal("window", { devicePixelRatio: 1 });
    const configure = vi.fn();
    const destroy = vi.fn();
    const canvas = createCanvasMock({ configure });
    const gpu = {
      getPreferredCanvasFormat: () => "rgba8unorm",
      requestAdapter: vi.fn(async () => ({
        limits: { maxTextureDimension2D: 8192 },
        features: { has: (feature: string) => feature === "float32-filterable" },
        requestDevice: vi.fn(async () => ({ destroy })),
      })),
    };

    const renderer = new WebGPURenderer(canvas, { gpu });

    await expect(renderer.initialize()).resolves.toBe(true);

    expect(renderer.supported).toBe(true);
    expect(renderer.ready).toBe(true);
    expect(renderer.capabilities.maxTextureSize).toBe(8192);
    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(360);
    expect(configure).toHaveBeenCalledWith({
      device: expect.objectContaining({ destroy }),
      format: "rgba8unorm",
      alphaMode: "opaque",
    });

    renderer.destroy();
    expect(renderer.ready).toBe(false);
    expect(destroy).toHaveBeenCalled();
  });

  it("reports unsupported when WebGPU is unavailable", async () => {
    vi.stubGlobal("window", { devicePixelRatio: 1 });
    const renderer = new WebGPURenderer(createCanvasMock());

    expect(renderer.supported).toBe(false);
    await expect(renderer.initialize()).resolves.toBe(false);
  });
});

function createCanvasMock({ configure = vi.fn(), unconfigure = vi.fn() } = {}): HTMLCanvasElement {
  return {
    clientWidth: 640,
    clientHeight: 360,
    width: 0,
    height: 0,
    getContext: (contextId: string) => (contextId === "webgpu" ? { configure, unconfigure } : null),
  } as unknown as HTMLCanvasElement;
}
