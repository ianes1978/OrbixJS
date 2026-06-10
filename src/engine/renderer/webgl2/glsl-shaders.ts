export const globeVertexShader = `#version 300 es
in vec3 position;
in vec3 normal;
in vec3 geodeticNormal;
in vec2 imageryUv;

uniform mat4 uProjection;
uniform mat4 uView;
uniform mat4 uModel;

out vec3 vNormal;
out vec3 vGeodeticNormal;
out vec3 vPosition;
out vec2 vImageryUv;

void main() {
  vec4 worldPosition = uModel * vec4(position, 1.0);
  vPosition = worldPosition.xyz;
  vNormal = mat3(uModel) * normal;
  vGeodeticNormal = geodeticNormal;
  vImageryUv = imageryUv;
  gl_Position = uProjection * uView * worldPosition;
}
`;

export const globeFragmentShader = `#version 300 es
precision highp float;

in vec3 vNormal;
in vec3 vGeodeticNormal;
in vec3 vPosition;
in vec2 vImageryUv;

uniform bool uImageryEnabled;
uniform sampler2D uImagery;
uniform vec3 uSunDirection;
uniform bool uDebugOverlay;

out vec4 outColor;

void main() {
  vec3 normal = normalize(vNormal);
  vec3 geo = normalize(vGeodeticNormal);
  vec3 light = normalize(uSunDirection);
  float diffuse = max(dot(normal, light), 0.0);
  float latitudeBands = smoothstep(-0.3, 0.45, sin(geo.y * 8.0));
  float longitudeBands = smoothstep(-0.25, 0.35, cos(geo.x * 9.0 + geo.z * 4.0));
  float landMask = latitudeBands * longitudeBands;
  vec3 ocean = vec3(0.025, 0.22, 0.32);
  vec3 land = vec3(0.18, 0.48, 0.30);
  vec3 grid = vec3(0.42, 0.78, 0.82);
  vec3 base = mix(ocean, land, landMask * 0.55);
  float meridian = smoothstep(0.985, 1.0, abs(sin(atan(geo.z, geo.x) * 12.0)));
  float parallel = smoothstep(0.985, 1.0, abs(sin(asin(geo.y) * 12.0)));
  float line = max(meridian, parallel) * 0.18;
  float rim = pow(1.0 - max(dot(normal, normalize(-vPosition)), 0.0), 3.2);
  vec3 neutralBase = mix(ocean, land, landMask * 0.18);
  vec3 imagery = texture(uImagery, vImageryUv).rgb;
  float polarMask = smoothstep(0.965, 0.998, abs(geo.y));
  vec3 polarNorth = vec3(0.82, 0.93, 0.94);
  vec3 polarSouth = vec3(0.72, 0.86, 0.90);
  vec3 polar = geo.y > 0.0 ? polarNorth : polarSouth;
  vec3 imagerySurface = mix(imagery, polar, polarMask);
  vec3 surface = uImageryEnabled ? imagerySurface : mix(base, grid, line);
  vec3 color = surface * (0.28 + diffuse * 0.85) + rim * vec3(0.055, 0.13, 0.16);
  outColor = vec4(color, 1.0);
}
`;

export const imageryTileVertexShader = `#version 300 es
in vec3 position;
in vec3 normal;
in vec2 uv;

uniform mat4 uProjection;
uniform mat4 uView;
uniform mat4 uModel;

out vec3 vNormal;
out vec3 vPosition;
out vec2 vUv;

void main() {
  vec4 worldPosition = uModel * vec4(position, 1.0);
  vPosition = worldPosition.xyz;
  vNormal = mat3(uModel) * normal;
  vUv = uv;
  gl_Position = uProjection * uView * worldPosition;
}
`;

export const imageryTileFragmentShader = `#version 300 es
precision highp float;

in vec3 vNormal;
in vec3 vPosition;
in vec2 vUv;

uniform sampler2D uImagery;
uniform vec3 uSunDirection;
uniform bool uDebugOverlay;
uniform float uFadeAlpha;

out vec4 outColor;

void main() {
  vec3 normal = normalize(vNormal);
  vec3 light = normalize(uSunDirection);
  float diffuse = max(dot(normal, light), 0.0);
  float rim = pow(1.0 - max(dot(normal, normalize(-vPosition)), 0.0), 3.2);
  vec2 textureSizePx = vec2(textureSize(uImagery, 0));
  vec2 halfTexel = 0.5 / max(textureSizePx, vec2(1.0));
  vec2 sampleUv = clamp(vUv, halfTexel, vec2(1.0) - halfTexel);
  vec3 imagery = texture(uImagery, sampleUv).rgb;
  vec3 color = imagery * (0.42 + diffuse * 0.72) + rim * vec3(0.035, 0.09, 0.11);
  float edgeDistance = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
  float edgeLine = 1.0 - smoothstep(0.0, 0.012, edgeDistance);
  vec3 lineColor = vec3(0.36, 0.95, 1.0);
  outColor = vec4(mix(color, lineColor, uDebugOverlay ? edgeLine * 0.28 : 0.0), uFadeAlpha);
}
`;

export const terrainVertexShader = `#version 300 es
in vec3 position;
in vec2 uv;

uniform mat4 uProjection;
uniform mat4 uView;
uniform vec3 uTileKey;
uniform sampler2D uHeightmap;
uniform float uExaggeration;
uniform float uSkirtDepth;
uniform vec2 uImageryUvScale;
uniform vec2 uImageryUvOffset;
uniform vec3 uCameraPosition;
// (inizio, fine) della zona di morphing CDLOD in distanza unit-scale.
uniform vec2 uMorphRange;

out vec3 vNormal;
out vec3 vPosition;
out vec2 vUv;
out vec2 vImageryUv;

const float PI = 3.141592653589793;
const float WGS84_A = 6378137.0;
const float WGS84_B = 6356752.314245179;

float webMercatorYToLatitude(float y) {
  float n = PI * (1.0 - 2.0 * y);
  return atan(0.5 * (exp(n) - exp(-n)));
}

vec3 ellipsoidNormalAt(float lon, float lat) {
  float cosLat = cos(lat);
  return normalize(vec3(cosLat * cos(lon), sin(lat), -cosLat * sin(lon)));
}

// Forma geodetica standard WGS84 (stessa convenzione di Ellipsoid.cartographicToCartesian).
vec3 geodeticToWorld(float lon, float lat, float height) {
  float cosLat = cos(lat);
  float sinLat = sin(lat);
  float e2 = 1.0 - (WGS84_B * WGS84_B) / (WGS84_A * WGS84_A);
  float N = WGS84_A / sqrt(1.0 - e2 * sinLat * sinLat);
  vec3 world = vec3(
    (N + height) * cosLat * cos(lon),
    (N * (1.0 - e2) + height) * sinLat,
    -(N + height) * cosLat * sin(lon)
  );
  return world / WGS84_A;
}

vec3 terrainWorldAt(vec2 sampleUv) {
  float tileCount = exp2(uTileKey.x);
  float globalX = (uTileKey.y + sampleUv.x) / tileCount;
  float globalY = (uTileKey.z + sampleUv.y) / tileCount;
  float lon = globalX * PI * 2.0 - PI;
  float lat = webMercatorYToLatitude(globalY);
  float height = texture(uHeightmap, clamp(sampleUv, vec2(0.0), vec2(1.0))).r * uExaggeration;
  return geodeticToWorld(lon, lat, height);
}

// Geomorphing CDLOD: verso il bordo esterno della zona di transizione l'altezza
// scivola sul campionamento a meta' risoluzione (≈ il livello padre), cosi' il
// passaggio di LOD non produce pop verticale.
float morphedHeightAt(vec2 sampleUv, float morph) {
  vec2 heightmapSize = vec2(textureSize(uHeightmap, 0));
  vec2 texel = 1.0 / max(heightmapSize - vec2(1.0), vec2(1.0));
  vec2 coarseStep = texel * 2.0;
  vec2 snapped = round(sampleUv / coarseStep) * coarseStep;
  float fine = texture(uHeightmap, clamp(sampleUv, vec2(0.0), vec2(1.0))).r;
  float coarse = texture(uHeightmap, clamp(snapped, vec2(0.0), vec2(1.0))).r;
  return mix(fine, coarse, morph);
}

void main() {
  float tileCount = exp2(uTileKey.x);
  float globalX = (uTileKey.y + uv.x) / tileCount;
  float globalY = (uTileKey.z + uv.y) / tileCount;
  float lon = globalX * PI * 2.0 - PI;
  float lat = webMercatorYToLatitude(globalY);
  vec3 surfaceWorld = geodeticToWorld(lon, lat, 0.0);
  float cameraDistance = distance(surfaceWorld, uCameraPosition);
  float morph = clamp((cameraDistance - uMorphRange.x) / max(uMorphRange.y - uMorphRange.x, 1e-9), 0.0, 1.0);
  float height = morphedHeightAt(uv, morph) * uExaggeration - position.z * uSkirtDepth;
  vec3 ellipsoidNormal = ellipsoidNormalAt(lon, lat);
  vec3 world = geodeticToWorld(lon, lat, height);
  vec2 heightmapSize = vec2(textureSize(uHeightmap, 0));
  vec2 texel = 1.0 / max(heightmapSize - vec2(1.0), vec2(1.0));
  vec3 west = terrainWorldAt(uv - vec2(texel.x, 0.0));
  vec3 east = terrainWorldAt(uv + vec2(texel.x, 0.0));
  vec3 north = terrainWorldAt(uv - vec2(0.0, texel.y));
  vec3 south = terrainWorldAt(uv + vec2(0.0, texel.y));
  vec3 terrainNormal = normalize(cross(east - west, north - south));

  if (dot(terrainNormal, ellipsoidNormal) < 0.0) {
    terrainNormal = -terrainNormal;
  }

  vPosition = world;
  vNormal = position.z > 0.5 ? ellipsoidNormal : terrainNormal;
  vUv = uv;
  vImageryUv = uv * uImageryUvScale + uImageryUvOffset;
  gl_Position = uProjection * uView * vec4(world, 1.0);
}
`;

export const terrainFragmentShader = `#version 300 es
precision highp float;

in vec3 vNormal;
in vec3 vPosition;
in vec2 vUv;
in vec2 vImageryUv;

uniform vec3 uSunDirection;
uniform sampler2D uImagery;
uniform bool uDebugOverlay;

out vec4 outColor;

void main() {
  vec3 normal = normalize(vNormal);
  vec3 light = normalize(uSunDirection);
  float slopeLight = dot(normal, light);
  float diffuse = pow(max(slopeLight, 0.0), 1.35);
  float selfShadow = smoothstep(0.03, 0.42, slopeLight);
  float rim = pow(1.0 - max(dot(normal, normalize(-vPosition)), 0.0), 3.2);
  vec2 textureSizePx = vec2(textureSize(uImagery, 0));
  vec2 halfTexel = 0.5 / max(textureSizePx, vec2(1.0));
  vec2 sampleUv = clamp(vImageryUv, halfTexel, vec2(1.0) - halfTexel);
  vec3 imagery = texture(uImagery, sampleUv).rgb;
  vec3 litTerrain = imagery * (0.34 + diffuse * 0.92);
  vec3 shadowTerrain = imagery * vec3(0.36, 0.42, 0.50);
  vec3 color = mix(shadowTerrain, litTerrain, selfShadow) + rim * vec3(0.035, 0.09, 0.11);
  float edgeDistance = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
  float edgeLine = 1.0 - smoothstep(0.0, 0.012, edgeDistance);
  color = mix(color, vec3(0.24, 0.88, 0.82), uDebugOverlay ? edgeLine * 0.22 : 0.0);
  outColor = vec4(color, 1.0);
}
`;

export const vectorLineVertexShader = `#version 300 es
in vec3 position;

uniform mat4 uProjection;
uniform mat4 uView;
uniform mat4 uModel;

out vec3 vPosition;

void main() {
  vec4 worldPosition = uModel * vec4(position, 1.0);
  vPosition = worldPosition.xyz;
  gl_Position = uProjection * uView * worldPosition;
}
`;

export const vectorLineFragmentShader = `#version 300 es
precision highp float;

in vec3 vPosition;

uniform vec3 uCameraPosition;

out vec4 outColor;

void main() {
  float facing = dot(normalize(vPosition), normalize(uCameraPosition));
  float horizonFade = smoothstep(-0.02, 0.12, facing);

  if (horizonFade <= 0.0) {
    discard;
  }

  outColor = vec4(1.0, 0.88, 0.22, 0.82 * horizonFade);
}
`;

export const modelVertexShader = `#version 300 es
in vec3 position;
in vec2 uv;

uniform mat4 uProjection;
uniform mat4 uView;
uniform mat4 uModel;

out vec3 vPosition;
out vec2 vUv;

void main() {
  vec4 worldPosition = uModel * vec4(position, 1.0);
  vPosition = worldPosition.xyz;
  vUv = uv;
  gl_Position = uProjection * uView * worldPosition;
}
`;

export const modelFragmentShader = `#version 300 es
precision highp float;

in vec3 vPosition;
in vec2 vUv;

uniform vec4 uBaseColorFactor;
uniform bool uTextureEnabled;
uniform sampler2D uBaseColorTexture;
uniform vec3 uSunDirection;

out vec4 outColor;

void main() {
  float pulse = 0.5 + 0.5 * smoothstep(-0.2, 0.8, normalize(vPosition).y);
  float diffuse = max(dot(normalize(vPosition), normalize(uSunDirection)), 0.0);
  vec4 textureColor = uTextureEnabled ? texture(uBaseColorTexture, vUv) : vec4(1.0);
  vec4 material = uBaseColorFactor * textureColor;
  vec3 color = material.rgb * (0.38 + diffuse * 0.48 + pulse * 0.14);
  outColor = vec4(color, material.a);
}
`;
