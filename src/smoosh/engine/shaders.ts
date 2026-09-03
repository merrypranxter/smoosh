export const VERT = `#version 300 es
precision highp float;
const vec2 POS[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
out vec2 vUv;
void main() {
  vec2 p = POS[gl_VertexID];
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}
`;

const FLOW_COMMON = `
const float FLOW_RANGE = 0.40;
vec2 encodeFlow(vec2 f) {
  return clamp(f / FLOW_RANGE * 0.5 + 0.5, 0.0, 1.0);
}
vec2 decodeFlow(vec2 e) {
  return (e - 0.5) * 2.0 * FLOW_RANGE;
}
float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}
`;

const COLOR_COMMON = `
uniform int uColorActive;
uniform int uColorEffect;
uniform float uColorSaturation;
uniform float uColorVibrance;
uniform float uColorSharpness;

float colorLuma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

vec3 colorFeed(vec3 c) {
  if (uColorActive == 0) return c;

  if (uColorEffect == 1) {
    c = vec3(colorLuma(c));
  } else if (uColorEffect == 2) {
    c = 1.0 - c;
  } else if (uColorEffect == 3) {
    c = floor(c * 5.0 + 0.5) / 5.0;
  } else if (uColorEffect == 4) {
    c = 1.0 - abs(c * 2.0 - 1.0);
  } else if (uColorEffect == 5) {
    float y = colorLuma(c);
    vec3 bands = 0.5 + 0.5 * cos(6.2831853 * (y + vec3(0.00, 0.34, 0.67)));
    c = mix(bands, bands * (0.55 + c * 0.75), 0.48);
  }

  float y = colorLuma(c);
  float chroma = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  float vibrance = 1.0 + uColorVibrance * (1.0 - chroma);
  return clamp(mix(vec3(y), c, uColorSaturation * vibrance), 0.0, 1.0);
}

vec3 colorFeedSample(sampler2D tex, vec2 uv, vec2 texel) {
  vec3 c = texture(tex, uv).rgb;
  if (uColorActive == 1 && uColorSharpness > 0.001) {
    vec3 blur = (
      texture(tex, uv + vec2(texel.x, 0.0)).rgb +
      texture(tex, uv - vec2(texel.x, 0.0)).rgb +
      texture(tex, uv + vec2(0.0, texel.y)).rgb +
      texture(tex, uv - vec2(0.0, texel.y)).rgb
    ) * 0.25;
    c += (c - blur) * uColorSharpness * 1.8;
  }
  return colorFeed(clamp(c, 0.0, 1.0));
}
`;

export const FLOW_FRAG = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uCurr;
uniform sampler2D uPrev;
uniform vec2 uTexel;
uniform float uThreshold;
uniform int uRadius;
${FLOW_COMMON}
${COLOR_COMMON}

void main() {
  float Ix2 = 0.0;
  float Iy2 = 0.0;
  float Ixy = 0.0;
  float Ixt = 0.0;
  float Iyt = 0.0;
  int r = uRadius;

  for (int j = -4; j <= 4; j++) {
    if (j < -r || j > r) continue;
    for (int i = -4; i <= 4; i++) {
      if (i < -r || i > r) continue;
      vec2 o = vec2(float(i), float(j)) * uTexel;
      vec2 uv = vUv + o;
      float c = luma(colorFeed(texture(uCurr, uv).rgb));
      float p = luma(colorFeed(texture(uPrev, uv).rgb));
      float cx = luma(colorFeed(texture(uCurr, uv + vec2(uTexel.x, 0.0)).rgb));
      float cy = luma(colorFeed(texture(uCurr, uv + vec2(0.0, uTexel.y)).rgb));
      float px = luma(colorFeed(texture(uPrev, uv + vec2(uTexel.x, 0.0)).rgb));
      float py = luma(colorFeed(texture(uPrev, uv + vec2(0.0, uTexel.y)).rgb));
      float Ix = 0.5 * ((cx - c) + (px - p));
      float Iy = 0.5 * ((cy - c) + (py - p));
      float It = c - p;
      float sharpGain = 1.0 + uColorSharpness * 2.4;
      Ix *= sharpGain;
      Iy *= sharpGain;
      It *= 1.0 + uColorSharpness * 0.7;
      Ix2 += Ix * Ix;
      Iy2 += Iy * Iy;
      Ixy += Ix * Iy;
      Ixt += Ix * It;
      Iyt += Iy * It;
    }
  }

  float det = Ix2 * Iy2 - Ixy * Ixy;
  float trace = Ix2 + Iy2;
  float conf = det / (trace * trace + 1.0e-6);
  vec2 flow = vec2(0.0);

  if (det > uThreshold && trace > 1.0e-5) {
    flow.x = (Ixy * Iyt - Iy2 * Ixt) / det;
    flow.y = (Ixy * Ixt - Ix2 * Iyt) / det;
  }

  flow *= uTexel;
  float mag = length(flow);
  flow *= mag / (mag + 0.004);
  flow = clamp(flow, vec2(-FLOW_RANGE), vec2(FLOW_RANGE));
  fragColor = vec4(encodeFlow(flow), clamp(conf, 0.0, 1.0), 1.0);
}
`;

export const SMOOTH_FRAG = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uNew;
uniform sampler2D uOld;
uniform float uSens;
uniform float uKeep;
uniform vec2 uTexel;
${FLOW_COMMON}

void main() {
  vec4 n = texture(uNew, vUv);
  vec4 o = texture(uOld, vUv);
  vec2 nFlow = decodeFlow(n.xy);
  vec2 oFlow = decodeFlow(o.xy);
  vec2 nL = decodeFlow(texture(uNew, vUv - vec2(uTexel.x, 0.0)).xy);
  vec2 nR = decodeFlow(texture(uNew, vUv + vec2(uTexel.x, 0.0)).xy);
  vec2 nD = decodeFlow(texture(uNew, vUv - vec2(0.0, uTexel.y)).xy);
  vec2 nU = decodeFlow(texture(uNew, vUv + vec2(0.0, uTexel.y)).xy);
  vec2 spatial = (nFlow * 2.0 + nL + nR + nD + nU) / 6.0;
  float mag = length(spatial);
  float gate = step(uSens, n.z) * step(uSens * 0.25, mag);
  vec2 flowed = mix(oFlow * uKeep, spatial, 0.38 * gate + 0.04);
  float conf = mix(o.z * 0.88, n.z, 0.42);
  fragColor = vec4(encodeFlow(flowed), conf, 1.0);
}
`;

export const MOSH_FRAG = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uFeedback;
uniform sampler2D uSource;
uniform sampler2D uFlow;
uniform vec2 uTexel;
uniform float uRefresh;
uniform float uPersist;
uniform float uGain;
uniform float uBleed;
uniform float uZoom;
uniform float uRot;
uniform float uTear;
uniform float uSplit;
uniform float uInjectBoost;
uniform int uChromaMode;
${FLOW_COMMON}
${COLOR_COMMON}

vec2 rotate(vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

void main() {
  vec2 flow = decodeFlow(texture(uFlow, vUv).xy) * uGain;

  vec2 fdx = dFdx(flow);
  vec2 fdy = dFdy(flow);
  float edge = length(fdx) + length(fdy);
  vec2 perp = vec2(-flow.y, flow.x);
  float plen = length(perp);
  vec2 tear = plen > 1.0e-6 ? (perp / plen) * edge * uTear : vec2(0.0);

  vec2 centered = vUv - 0.5;
  centered = rotate(centered * uZoom, uRot);
  vec2 base = centered + 0.5;
  vec2 sampleUv = clamp(base - flow + tear, vec2(-0.05), vec2(1.05));

  vec4 sR;
  vec4 sG;
  vec4 sB;
  if (uChromaMode == 1) {
    vec2 rainbowNudge = plen > 1.0e-6 ? (perp / plen) * uTexel * 2.5 : vec2(0.0);
    vec2 redUv = clamp(base - flow * 1.35 + tear + rainbowNudge, vec2(-0.05), vec2(1.05));
    vec2 greenUv = clamp(base - flow + tear, vec2(-0.05), vec2(1.05));
    vec2 blueUv = clamp(base - flow * 0.65 + tear - rainbowNudge, vec2(-0.05), vec2(1.05));
    sR = texture(uFeedback, redUv);
    sG = texture(uFeedback, greenUv);
    sB = texture(uFeedback, blueUv);
  } else {
    sR = texture(uFeedback, sampleUv - flow * uSplit);
    sG = texture(uFeedback, sampleUv);
    sB = texture(uFeedback, sampleUv + flow * uSplit);
  }
  vec3 warped = vec3(sR.r, sG.g, sB.b) * uPersist;

  vec3 src = colorFeedSample(uSource, vUv, uTexel);
  float inj = clamp(uRefresh + uInjectBoost, 0.0, 1.0);
  vec3 color = mix(warped, src, inj);
  color = mix(color, src, uBleed);
  fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

export const MIX_FRAG = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uA;
uniform sampler2D uB;
uniform float uMix;
uniform vec2 uTexel;
${COLOR_COMMON}
void main() {
  vec3 a = colorFeedSample(uA, vUv, uTexel);
  vec3 b = texture(uB, vUv).rgb;
  fragColor = vec4(mix(a, b, uMix), 1.0);
}
`;

export const BLIT_FRAG = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform int uSymmetryEnabled;
uniform float uSymmetryAxis;
uniform int uSymmetrySide;
${COLOR_COMMON}
void main() {
  vec2 uv = vUv;
  if (uSymmetryEnabled == 1) {
    bool reflectRight = uSymmetrySide == 0 && uv.x > uSymmetryAxis;
    bool reflectLeft = uSymmetrySide == 1 && uv.x < uSymmetryAxis;
    if (reflectRight || reflectLeft) uv.x = 2.0 * uSymmetryAxis - uv.x;
    uv.x = clamp(uv.x, 0.0, 1.0);
  }
  fragColor = vec4(colorFeedSample(uTex, uv, uTexel), 1.0);
}
`;
