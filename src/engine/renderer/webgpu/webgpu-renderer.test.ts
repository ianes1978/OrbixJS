import { afterEach, describe, expect, it, vi } from "vitest";
import { OrbitCamera } from "../../core/camera/orbit-camera";
import { Scene } from "../../core/scene/scene";
import { createQuadtreeTile } from "../../globe/imagery/quadtree-tile";
import { WebGPURenderer } from "./webgpu-renderer";

describe("WebGPURenderer", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("initializes a WebGPU device and canvas context", async () => {
    vi.stubGlobal("window", { devicePixelRatio: 1 });
    const configure = vi.fn();
    const device = createDeviceMock();
    const canvas = createCanvasMock({ configure });
    const gpu = {
      getPreferredCanvasFormat: () => "rgba8unorm",
      requestAdapter: vi.fn(async () => ({
        limits: { maxTextureDimension2D: 8192 },
        features: { has: (feature: string) => feature === "float32-filterable" },
        requestDevice: vi.fn(async () => device),
      })),
    };

    const renderer = new WebGPURenderer(canvas, { gpu });

    await expect(renderer.initialize()).resolves.toBe(true);

    expect(renderer.supported).toBe(true);
    expect(renderer.ready).toBe(true);
    expect(renderer.capabilities.maxTextureSize).toBe(8192);
    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(360);
    expect(device.createRenderPipeline).toHaveBeenCalled();
    expect(device.createBindGroup).toHaveBeenCalled();
    expect(device.createTexture).toHaveBeenCalledWith(
      expect.objectContaining({
        label: "OrbixJS WebGPU placeholder imagery",
        size: [1, 1],
      }),
    );
    expect(device.createSampler).toHaveBeenCalled();
    expect(configure).toHaveBeenCalledWith({
      device,
      format: "rgba8unorm",
      alphaMode: "opaque",
    });

    renderer.destroy();
    expect(renderer.ready).toBe(false);
    expect(device.destroy).toHaveBeenCalled();
  });

  it("renders the globe through a WebGPU render pass", async () => {
    vi.stubGlobal("window", { devicePixelRatio: 1 });
    const device = createDeviceMock();
    const canvas = createCanvasMock();
    const gpu = {
      getPreferredCanvasFormat: () => "rgba8unorm",
      requestAdapter: vi.fn(async () => ({
        requestDevice: vi.fn(async () => device),
      })),
    };
    const renderer = new WebGPURenderer(canvas, { gpu });

    await renderer.initialize();
    renderer.render({ scene: new Scene(), camera: new OrbitCamera() });

    expect(device.pass.setPipeline).toHaveBeenCalled();
    expect(device.pass.setBindGroup).toHaveBeenCalled();
    expect(device.pass.setVertexBuffer).toHaveBeenCalled();
    expect(device.pass.setIndexBuffer).toHaveBeenCalledWith(expect.anything(), "uint16");
    expect(device.pass.drawIndexed).toHaveBeenCalledWith(expect.any(Number));
    expect(device.queue.submit).toHaveBeenCalledWith(["command-buffer"]);
  });

  it("uploads globe imagery and refreshes the WebGPU bind group", async () => {
    vi.stubGlobal("window", { devicePixelRatio: 1 });
    const device = createDeviceMock();
    const canvas = createCanvasMock();
    const gpu = {
      getPreferredCanvasFormat: () => "rgba8unorm",
      requestAdapter: vi.fn(async () => ({
        requestDevice: vi.fn(async () => device),
      })),
    };
    const renderer = new WebGPURenderer(canvas, { gpu });
    const image = { width: 512, height: 256 } as TexImageSource;

    await renderer.initialize();
    const bindGroupsBefore = device.createBindGroup.mock.calls.length;
    renderer.setImagery(image);

    expect(device.createTexture).toHaveBeenLastCalledWith(
      expect.objectContaining({
        label: "OrbixJS WebGPU globe imagery",
        size: [512, 256],
      }),
    );
    expect(device.queue.copyExternalImageToTexture).toHaveBeenCalledWith(
      { source: image },
      { texture: expect.anything() },
      [512, 256],
    );
    expect(device.createBindGroup.mock.calls.length).toBeGreaterThan(bindGroupsBefore);
  });

  it("renders active imagery tiles after the globe", async () => {
    vi.stubGlobal("window", { devicePixelRatio: 1 });
    const device = createDeviceMock();
    const canvas = createCanvasMock();
    const gpu = {
      getPreferredCanvasFormat: () => "rgba8unorm",
      requestAdapter: vi.fn(async () => ({
        requestDevice: vi.fn(async () => device),
      })),
    };
    const renderer = new WebGPURenderer(canvas, { gpu });
    const tile = createQuadtreeTile(1, 1, 2);
    const image = { width: 256, height: 256 } as TexImageSource;

    await renderer.initialize();
    renderer.setImageryTile(tile, image);
    renderer.setActiveImageryTiles([tile.id]);
    renderer.render({ scene: new Scene(), camera: new OrbitCamera() });

    expect(device.pass.drawIndexed).toHaveBeenCalledTimes(2);
    expect(device.pass.setPipeline).toHaveBeenCalledTimes(2);
    expect(device.queue.copyExternalImageToTexture).toHaveBeenCalledWith(
      { source: image },
      { texture: expect.anything() },
      [256, 256],
    );
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
    getContext: (contextId: string) =>
      contextId === "webgpu"
        ? {
            configure,
            unconfigure,
            getCurrentTexture: () => ({
              createView: vi.fn(() => "texture-view"),
            }),
          }
        : null,
  } as unknown as HTMLCanvasElement;
}

function createDeviceMock() {
  const pass = {
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    setVertexBuffer: vi.fn(),
    setIndexBuffer: vi.fn(),
    drawIndexed: vi.fn(),
    end: vi.fn(),
  };
  return {
    queue: {
      writeBuffer: vi.fn(),
      copyExternalImageToTexture: vi.fn(),
      submit: vi.fn(),
    },
    pass,
    destroy: vi.fn(),
    createShaderModule: vi.fn((options) => ({ options })),
    createRenderPipeline: vi.fn(() => ({
      getBindGroupLayout: vi.fn(() => "bind-group-layout"),
    })),
    createBuffer: vi.fn((options) => ({ options, destroy: vi.fn() })),
    createTexture: vi.fn((options) => ({ options, createView: vi.fn(() => ({ texture: options })), destroy: vi.fn() })),
    createSampler: vi.fn((options) => ({ options })),
    createBindGroup: vi.fn((options) => ({ options })),
    createCommandEncoder: vi.fn(() => ({
      beginRenderPass: vi.fn(() => pass),
      finish: vi.fn(() => "command-buffer"),
    })),
  };
}
