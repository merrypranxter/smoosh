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
uniform sampler2D uDonor;
uniform sampler2D uFlowOther;
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
uniform int uMacroMode;
uniform float uMacroBlockPx;
uniform float uMacroTheft;
uniform float uMacroMemory;
uniform float uMacroTime;
uniform int uSliceMode;
uniform float uSliceWidthPx;
uniform float uSliceDrift;
uniform float uSliceSpeed;
uniform float uSliceTime;
uniform int uSliceOrientation;
uniform int uCollisionMode;
uniform float uCollisionImpact;
uniform float uCollisionOpposition;
uniform float uCollisionShock;
uniform int uCollisionSolo;
uniform int uInfectionMode;
uniform float uInfectionTrigger;
uniform float uInfectionSpread;
uniform float uInfectionBite;
${FLOW_COMMON}
${COLOR_COMMON}

vec2 rotate(vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

float macroHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec2 macroHash2(vec2 p) {
  return vec2(macroHash(p + 17.17), macroHash(p + 71.71));
}

void main() {
  vec2 flow = decodeFlow(texture(uFlow, vUv).xy) * uGain;

  if (uMacroMode == 1) {
    vec2 blockUv = max(uTexel * uMacroBlockPx, uTexel * 4.0);
    vec2 cell = floor(vUv / blockUv);
    vec2 local = fract(vUv / blockUv);
    float cadence = mix(8.0, 0.7, uMacroMemory);
    float epoch = floor(uMacroTime * cadence);
    float steal = step(1.0 - uMacroTheft, macroHash(cell + epoch * 0.137));
    vec2 jump = floor((macroHash2(cell + epoch * 0.311) - 0.5) * mix(2.0, 12.0, uMacroTheft));
    vec2 wholeFlow = floor(flow / blockUv + 0.5) * blockUv;
    vec2 feedbackUv = clamp((cell + jump + local) * blockUv - wholeFlow, vec2(0.0), vec2(1.0));
    vec2 donorJump = floor((macroHash2(cell + epoch * 0.193 + 9.0) - 0.5) * 8.0);
    vec2 donorUv = clamp((cell + donorJump + local) * blockUv, vec2(0.0), vec2(1.0));
    vec3 remembered = texture(uFeedback, clamp(vUv - wholeFlow, vec2(0.0), vec2(1.0))).rgb;
    vec3 stolenPast = texture(uFeedback, feedbackUv).rgb;
    vec3 stolenDonor = colorFeedSample(uDonor, donorUv, uTexel);
    float donorChoice = step(0.46, macroHash(cell + epoch * 0.257 + 33.0));
    vec3 stolen = mix(stolenPast, stolenDonor, donorChoice);
    vec3 blocks = mix(remembered, stolen, steal * (0.48 + uMacroTheft * 0.52));
    blocks *= mix(0.9, 0.999, uMacroMemory);
    vec3 src = colorFeedSample(uSource, vUv, uTexel);
    float inj = clamp(uRefresh * 0.3 + uInjectBoost * 0.38, 0.0, 1.0);
    vec3 color = mix(blocks, src, inj);
    color = mix(color, src, uBleed * 0.4);
    fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
    return;
  }

  if (uSliceMode == 1) {
    float axisTexel = uSliceOrientation == 0 ? uTexel.x : uTexel.y;
    float bandUv = max(axisTexel * uSliceWidthPx, axisTexel * 3.0);
    float axis = uSliceOrientation == 0 ? vUv.x : vUv.y;
    float band = floor(axis / bandUv);
    float stripPhase = fract(uSliceTime * uSliceSpeed * 0.34 + band * 0.173);
    float age = 1.0 - stripPhase;
    float stagger = macroHash(vec2(band, floor(uSliceTime * 0.19)));
    float signFlip = step(0.5, macroHash(vec2(band, 19.7))) * 2.0 - 1.0;
    float offset = signFlip * (0.008 + stagger * 0.115) * uSliceDrift * age;
    vec2 stripNudge = uSliceOrientation == 0 ? vec2(0.0, offset) : vec2(offset, 0.0);
    vec2 oldUv = clamp(
      vUv - flow * mix(0.25, 1.25, uSliceDrift) - stripNudge,
      vec2(0.0),
      vec2(1.0)
    );
    vec3 oldStrip = texture(uFeedback, oldUv).rgb * uPersist;
    vec3 src = colorFeedSample(uSource, vUv, uTexel);
    float writePulse = smoothstep(0.86, 0.98, stripPhase);
    float writeAmount = writePulse * (0.42 + uRefresh * 0.48);
    writeAmount *= 1.0 - uInjectBoost * 0.42;
    vec3 color = mix(oldStrip, src, writeAmount);
    float seam = smoothstep(0.86, 0.99, fract(axis / bandUv));
    color *= 1.0 - seam * uSliceDrift * 0.12;
    color = mix(color, src, uBleed * 0.32);
    fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
    return;
  }

  if (uCollisionMode == 1) {
    vec2 windA = decodeFlow(texture(uFlowOther, vUv).xy) * uGain;
    vec2 windB = flow;
    if (uCollisionSolo == 1) {
      windA = vec2(-windB.y, windB.x) * 0.88;
    }
    vec2 cooperative = windB + windA;
    vec2 opposed = windB - windA;
    vec2 crash = mix(cooperative, opposed, uCollisionOpposition);
    float disagreement = length(windB - windA);
    float headOn = 0.0;
    float lenA = length(windA);
    float lenB = length(windB);
    if (lenA > 1.0e-6 && lenB > 1.0e-6) {
      headOn = clamp(dot(windA / lenA, -windB / lenB), 0.0, 1.0);
    }
    float shock = smoothstep(0.001, 0.055, disagreement) *
      mix(0.35, 1.0, headOn) * uCollisionShock;
    vec2 normal = vec2(-crash.y, crash.x);
    float normalLength = length(normal);
    normal = normalLength > 1.0e-6 ? normal / normalLength : vec2(1.0, 0.0);
    vec2 cell = floor(vUv / (uTexel * mix(18.0, 5.0, uCollisionShock)));
    float fracture = macroHash(cell + floor(disagreement * 900.0)) - 0.5;
    vec2 shrapnel = normal * fracture * shock * 0.13;
    vec2 impactFlow = crash * mix(0.55, 2.5, uCollisionImpact);
    vec2 leftUv = clamp(vUv - impactFlow - shrapnel, vec2(0.0), vec2(1.0));
    vec2 rightUv = clamp(vUv + impactFlow * 0.42 + shrapnel, vec2(0.0), vec2(1.0));
    vec3 leftHit = texture(uFeedback, leftUv).rgb;
    vec3 rightHit = texture(uFeedback, rightUv).rgb;
    float split = step(0.5, macroHash(cell + 41.0));
    vec3 collided = mix(leftHit, rightHit, split * shock) * uPersist;
    vec3 src = colorFeedSample(uSource, vUv, uTexel);
    float inj = clamp(uRefresh * (1.0 - shock * 0.72) + uInjectBoost * 0.18, 0.0, 1.0);
    vec3 color = mix(collided, src, inj);
    color += vec3(0.08, 0.025, 0.11) * shock * uCollisionImpact;
    color = mix(color, src, uBleed * 0.38);
    fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
    return;
  }

  if (uInfectionMode == 1) {
    float reach = mix(0.004, 0.034, uInfectionSpread);
    vec4 packedCenter = texture(uFlow, vUv);
    float centerActivity = length(flow) * mix(0.45, 1.0, packedCenter.z);
    vec4 packedLeft = texture(uFlow, clamp(vUv - vec2(reach, 0.0), vec2(0.0), vec2(1.0)));
    vec4 packedRight = texture(uFlow, clamp(vUv + vec2(reach, 0.0), vec2(0.0), vec2(1.0)));
    vec4 packedDown = texture(uFlow, clamp(vUv - vec2(0.0, reach), vec2(0.0), vec2(1.0)));
    vec4 packedUp = texture(uFlow, clamp(vUv + vec2(0.0, reach), vec2(0.0), vec2(1.0)));
    float activity = max(
      centerActivity,
      max(
        length(decodeFlow(packedLeft.xy) * uGain) * mix(0.45, 1.0, packedLeft.z),
        max(
          length(decodeFlow(packedRight.xy) * uGain) * mix(0.45, 1.0, packedRight.z),
          max(
            length(decodeFlow(packedDown.xy) * uGain) * mix(0.45, 1.0, packedDown.z),
            length(decodeFlow(packedUp.xy) * uGain) * mix(0.45, 1.0, packedUp.z)
          )
        )
      )
    );
    float threshold = mix(0.0012, 0.03, uInfectionTrigger);
    float feather = mix(0.011, 0.0035, uInfectionSpread);
    float wound = smoothstep(threshold, threshold + feather, activity);
    vec2 woundCell = floor(vUv / max(uTexel * mix(18.0, 6.0, uInfectionSpread), uTexel));
    float rot = (macroHash(woundCell + floor(activity * 700.0)) - 0.5) * 1.8;
    vec2 infectionFlow = rotate(flow, rot * uInfectionSpread);
    float boost = 1.0 + uInjectBoost * 1.25;
    vec2 infectedUv = clamp(
      vUv - infectionFlow * mix(0.75, 2.65, uInfectionBite) * boost,
      vec2(0.0),
      vec2(1.0)
    );
    vec3 src = colorFeedSample(uSource, vUv, uTexel);
    vec3 infected = texture(uFeedback, infectedUv).rgb * uPersist;
    infected = mix(infected, src, uRefresh * 0.08);
    wound = clamp(wound + wound * (macroHash(woundCell + 13.0) - 0.5) * 0.24, 0.0, 1.0);
    vec3 color = mix(src, infected, wound * uInfectionBite);
    color = mix(color, src, uBleed * (1.0 - wound));
    fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
    return;
  }

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
