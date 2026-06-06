import { afterEach, describe, expect, it, vi } from "vitest";
import { OrbitCamera } from "../../core/camera/orbit-camera";
import { Scene } from "../../core/scene/scene";
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
    expect(device.createTexture).toHaveBeenCalledWith({
      label: "OrbixJS WebGPU depth texture",
      size: [640, 360],
      format: "depth24plus",
      usage: 16,
    });
    expect(device.createTexture).toHaveBeenCalledWith({
      label: "OrbixJS WebGPU imagery texture",
      size: [1, 1],
      format: "rgba8unorm",
      usage: 22,
    });
    expect(device.createSampler).toHaveBeenCalledWith({
      label: "OrbixJS WebGPU imagery sampler",
      magFilter: "linear",
      minFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    });
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
    expect(device.commandEncoder.beginRenderPass).toHaveBeenCalledWith(
      expect.objectContaining({
        depthStencilAttachment: expect.objectContaining({
          depthClearValue: 1,
          depthLoadOp: "clear",
          depthStoreOp: "store",
        }),
      }),
    );
    expect(device.queue.submit).toHaveBeenCalledWith(["command-buffer"]);
  });

  it("uploads globe imagery into a sampled WebGPU texture", async () => {
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
    const image = { width: 512, height: 256 } as TexImageSource;

    renderer.setImagery(image);
    renderer.render({ scene: new Scene(), camera: new OrbitCamera() });

    expect(device.createTexture).toHaveBeenCalledWith({
      label: "OrbixJS WebGPU imagery texture",
      size: [512, 256],
      format: "rgba8unorm",
      usage: 22,
    });
    expect(device.queue.copyExternalImageToTexture).toHaveBeenCalledWith(
      { source: image },
      {
        texture: expect.objectContaining({
          options: expect.objectContaining({
            size: [512, 256],
          }),
        }),
      },
      [512, 256],
    );
    expect(
      device.textures.filter(
        (texture) =>
          (texture.options as { label?: string; size?: [number, number] }).label === "OrbixJS WebGPU imagery texture" &&
          (texture.options as { size?: [number, number] }).size?.[0] === 1 &&
          (texture.options as { size?: [number, number] }).size?.[1] === 1,
      ),
    ).toHaveLength(1);
    expect(device.createBindGroup).toHaveBeenLastCalledWith(
      expect.objectContaining({
        entries: expect.arrayContaining([
          expect.objectContaining({
            binding: 2,
            resource: expect.objectContaining({
              textureOptions: expect.objectContaining({ size: [512, 256] }),
            }),
          }),
        ]),
      }),
    );
    expect(device.pass.drawIndexed).toHaveBeenCalledTimes(1);
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
  const commandEncoder = {
    beginRenderPass: vi.fn(() => pass),
    finish: vi.fn(() => "command-buffer"),
  };
  const textures: Array<{ options: unknown; createView: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }> = [];
  const device = {
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
    createTexture: vi.fn((options) => {
      const texture = {
        options,
        createView: vi.fn(() => ({ textureOptions: options })),
        destroy: vi.fn(),
      };
      textures.push(texture);
      return texture;
    }),
    createSampler: vi.fn(() => "sampler"),
    createBindGroup: vi.fn((options) => ({ options })),
    commandEncoder,
    createCommandEncoder: vi.fn(() => commandEncoder),
    textures,
  };
  return device;
}
