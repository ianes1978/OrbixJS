import { describe, expect, it } from "vitest";
import {
  findPreprocessJob,
  parsePreprocessManifest,
  PREPROCESS_MANIFEST_SCHEMA_VERSION,
  serializePreprocessManifest,
} from "./preprocess-manifest";

describe("parsePreprocessManifest", () => {
  it("parses versioned preprocessing jobs", () => {
    const manifest = parsePreprocessManifest({
      schemaVersion: PREPROCESS_MANIFEST_SCHEMA_VERSION,
      jobs: [
        {
          id: "south-tyrol-dtm-heightmap",
          type: "terrain-heightmap",
          title: "South Tyrol DTM 2.5m heightmap",
          inputs: [
            {
              id: "source-layer",
              url: "https://example.test/layer.json",
              format: "civis-layer-json",
              crs: "EPSG:25832",
            },
          ],
          outputs: [
            {
              id: "runtime-heightmap",
              url: "terrain/south-tyrol/manifest.json",
              format: "orbix-heightmap-manifest",
              crs: "EPSG:25832",
              tileMatrixSet: "EPSG_25832",
            },
          ],
          crs: "EPSG:25832",
          extent: { west: 590000, south: 5120000, east: 750000, north: 5220000, crs: "EPSG:25832" },
          parameters: { tileSize: 256, noData: null, quantize: true },
          provenance: { tool: "orbix-preprocess", toolVersion: "0.1.0" },
          attribution: "Autonomous Province of Bolzano/Bozen",
          license: "To be verified before runtime use",
        },
      ],
    });

    expect(findPreprocessJob(manifest, "south-tyrol-dtm-heightmap")).toMatchObject({
      type: "terrain-heightmap",
      crs: "EPSG:25832",
      parameters: { tileSize: 256, noData: null, quantize: true },
    });
  });

  it("rejects unsupported job types", () => {
    expect(() =>
      parsePreprocessManifest({
        schemaVersion: PREPROCESS_MANIFEST_SCHEMA_VERSION,
        jobs: [
          {
            id: "bad",
            type: "unknown",
            inputs: [{ id: "input", url: "input.tif", format: "geotiff" }],
            outputs: [{ id: "output", url: "output.json", format: "manifest" }],
            provenance: { tool: "test" },
          },
        ],
      }),
    ).toThrow("Unsupported PreprocessJob type");
  });

  it("rejects nested parameters", () => {
    expect(() =>
      parsePreprocessManifest({
        schemaVersion: PREPROCESS_MANIFEST_SCHEMA_VERSION,
        jobs: [
          {
            id: "bad",
            type: "terrain-heightmap",
            inputs: [{ id: "input", url: "input.tif", format: "geotiff" }],
            outputs: [{ id: "output", url: "output.json", format: "manifest" }],
            parameters: { nested: { noData: -9999 } },
            provenance: { tool: "test" },
          },
        ],
      }),
    ).toThrow("Invalid PreprocessManifest parameter");
  });

  it("serializes deterministically", () => {
    expect(
      serializePreprocessManifest({
        schemaVersion: PREPROCESS_MANIFEST_SCHEMA_VERSION,
        jobs: [
          {
            id: "job",
            type: "tileset",
            inputs: [{ id: "input", url: "tileset.json", format: "3d-tiles" }],
            outputs: [{ id: "output", url: "validated.json", format: "3d-tiles" }],
            provenance: { tool: "test" },
          },
        ],
      }),
    ).toContain('"schemaVersion": "0.1"');
  });
});
