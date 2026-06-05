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
  float rim = pow(1.0 - max(dot(normal, normalize(-vPosition)), 0.0), 2.0);
  vec3 neutralBase = mix(ocean, land, landMask * 0.18);
  vec3 imagery = texture(uImagery, vImageryUv).rgb;
  float polarMask = smoothstep(0.965, 0.998, abs(geo.y));
  vec3 polarNorth = vec3(0.82, 0.93, 0.94);
  vec3 polarSouth = vec3(0.72, 0.86, 0.90);
  vec3 polar = geo.y > 0.0 ? polarNorth : polarSouth;
  vec3 imagerySurface = mix(imagery, polar, polarMask);
  vec3 surface = uImageryEnabled ? imagerySurface : mix(base, grid, line);
  vec3 color = surface * (0.28 + diffuse * 0.85) + rim * vec3(0.28, 0.72, 0.9);
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

out vec4 outColor;

void main() {
  vec3 normal = normalize(vNormal);
  vec3 light = normalize(uSunDirection);
  float diffuse = max(dot(normal, light), 0.0);
  float rim = pow(1.0 - max(dot(normal, normalize(-vPosition)), 0.0), 2.0);
  vec3 imagery = texture(uImagery, vUv).rgb;
  vec3 color = imagery * (0.42 + diffuse * 0.72) + rim * vec3(0.18, 0.45, 0.55);
  float edgeDistance = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
  float edgeFade = smoothstep(0.0, 0.025, edgeDistance);
  outColor = vec4(color, 0.86 * edgeFade);
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
