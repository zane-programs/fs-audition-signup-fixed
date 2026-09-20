// GLSL for the attract screen.
//
// Every material on screen — background, ink, ribbon — resolves its colour
// through the same `wipeMask()`, evaluated per pixel in screen space. That is
// what keeps a palette change in lockstep: there is one ragged edge, and
// everything on either side of it flips together.

const NOISE = /* glsl */ `
  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
      mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }
`;

const WIPE = /* glsl */ `
  uniform vec2 uRes;
  uniform float uWipe;
  uniform vec2 uWipeDir;

  // 0 = still the outgoing palette, 1 = the incoming one.
  float wipeMask() {
    float aspect = uRes.x / uRes.y;
    vec2 q = (gl_FragCoord.xy / uRes - 0.5) * vec2(aspect, 1.0);
    float across = dot(q, uWipeDir);
    float along = dot(q, vec2(-uWipeDir.y, uWipeDir.x));

    // Stretched along the stroke so the edge reads as brush bristles, not fog.
    float ragged =
      vnoise(vec2(along * 2.2, across * 0.3)) * 0.34 +
      vnoise(vec2(along * 13.0, across * 1.2)) * 0.09 +
      vnoise(vec2(along * 70.0, across * 2.5)) * 0.03;

    // Start just off one corner, finish just past the opposite one.
    float reach = length(vec2(aspect, 1.0)) * 0.5;
    float front = mix(-reach - 0.48, reach + 0.02, uWipe);
    return smoothstep(0.003, -0.003, across + ragged - front - 0.46);
  }
`;

// How many times a second the hand-drawn layer is "redrawn".
const BOIL_FPS = "9.0";

export const backgroundVertex = /* glsl */ `
  void main() {
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`;

export const backgroundFragment = /* glsl */ `
  ${NOISE}
  ${WIPE}
  uniform vec3 uBgA;
  uniform vec3 uBgB;

  void main() {
    vec3 col = mix(uBgA, uBgB, wipeMask());

    // A breath of vignette so the flat colour has some depth to it.
    vec2 p = gl_FragCoord.xy / uRes - 0.5;
    col *= 1.0 - dot(p, p) * 0.14;

    gl_FragColor = vec4(col, 1.0);
  }
`;

// --- Filled lettering (wordmark, "AUDITION FOR", START) ----------------------

export const fillVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec2 vStage;

  void main() {
    vUv = uv;
    vStage = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const fillFragment = /* glsl */ `
  ${NOISE}
  ${WIPE}
  uniform sampler2D uTex;
  uniform float uTime;
  uniform float uWordFill;   // 0..1, scribbles the wordmark in
  uniform float uTitleFill;  // 0..1, same for "AUDITION FOR"
  uniform float uStartIn;    // 0..1, START button arriving
  uniform float uHover;
  uniform vec2 uStartCenter; // in uv
  uniform float uStartTop;   // stage y above which nothing belongs to START
  uniform vec3 uInkA;
  uniform vec3 uInkB;
  uniform vec3 uAccentA;
  uniform vec3 uAccentB;

  varying vec2 vUv;
  varying vec2 vStage;

  // Diagonal pen hatching that thickens until it closes up into a solid fill.
  float scribble(vec2 p, float progress, float slant) {
    float wobble = vnoise(p * 1.7) * 0.7;
    float line = fract((p.x * slant + p.y) * 4.2 + wobble);
    return step(line, progress * 1.12);
  }

  void main() {
    float frame = floor(uTime * ${BOIL_FPS});

    // Boil: nudge the lookup by noise that re-rolls a few times a second.
    vec2 boil = vec2(
      vnoise(vStage * 1.4 + frame * 7.13),
      vnoise(vStage * 1.4 + 41.7 + frame * 3.71)
    ) - 0.5;

    bool inStart = vStage.y < uStartTop;

    vec2 uv = vUv;
    if (inStart) {
      // The button breathes a little, and leans in when hovered.
      float s = 1.0 + 0.025 * sin(uTime * 2.4) + 0.05 * uHover;
      s *= mix(0.6, 1.0, uStartIn);
      uv = uStartCenter + (uv - uStartCenter) / s;
    }
    uv += boil * 0.0028;

    vec4 t = texture2D(uTex, uv);
    float grain = vnoise(vStage * 22.0 + frame * 1.9) - 0.5;
    float e = 0.035;

    float mask = wipeMask();
    vec3 ink = mix(uInkA, uInkB, mask);
    vec3 accent = mix(uAccentA, uAccentB, mask);

    vec3 col = ink;
    float alpha = 0.0;

    if (inStart) {
      float box = smoothstep(0.5 - e, 0.5 + e, t.b + grain * 0.2);
      float label = smoothstep(0.5 - e, 0.5 + e, t.g + grain * 0.1);
      col = mix(accent + uHover * 0.12, vec3(0.98), label);
      alpha = box * smoothstep(0.0, 0.35, uStartIn);
    } else {
      float word = smoothstep(0.5 - e, 0.5 + e, t.r + grain * 0.16);
      float title = smoothstep(0.5 - e, 0.5 + e, t.g + grain * 0.16);

      // Sweep left to right so the scribble follows the pen.
      float sweep = (vStage.x + 5.0) / 10.0;
      float wp = clamp(uWordFill * 1.7 - sweep * 0.7, 0.0, 1.0);
      float tp = clamp(uTitleFill * 1.7 - sweep * 0.7, 0.0, 1.0);

      alpha = max(
        word * scribble(vStage, wp, 0.55),
        title * scribble(vStage * 1.6, tp, 0.8)
      );
    }

    if (alpha < 0.01) discard;
    gl_FragColor = vec4(col, alpha);
  }
`;

// --- Pen strokes (outlines and doodles) --------------------------------------

export const lineVertex = /* glsl */ `
  ${NOISE}
  attribute vec2 aNormal;
  attribute float aSide;
  attribute float aU;
  attribute vec4 aStroke; // seed, draw-window start, draw-window end, width

  uniform float uTime;
  uniform float uJitter;

  varying float vU;
  varying float vSide;
  varying vec2 vWindow;
  varying vec2 vStage;

  void main() {
    float frame = floor(uTime * ${BOIL_FPS});
    float seed = aStroke.x;

    vec2 p = position.xy;
    vec2 wob = vec2(
      vnoise(p * 1.9 + seed + frame * 5.3),
      vnoise(p * 1.9 + seed + 19.4 + frame * 8.9)
    ) - 0.5;
    p += wob * uJitter;

    // Pressure: heavier in the middle of a stroke, and never quite constant.
    float taper = pow(sin(clamp(aU, 0.0, 1.0) * 3.14159), 0.35);
    float pressure = 0.7 + 0.6 * vnoise(position.xy * 2.6 + seed + frame);
    float width = aStroke.w * mix(0.45, 1.0, taper) * pressure;
    p += aNormal * aSide * width * 0.5;

    vU = aU;
    vSide = aSide;
    vWindow = aStroke.yz;
    vStage = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, position.z, 1.0);
  }
`;

export const lineFragment = /* glsl */ `
  ${NOISE}
  ${WIPE}
  uniform float uDraw;  // 0..1 across the whole group
  uniform float uErase; // 0..1 across the whole group
  uniform vec3 uInkA;
  uniform vec3 uInkB;

  varying float vU;
  varying float vSide;
  varying vec2 vWindow;
  varying vec2 vStage;

  void main() {
    float span = max(vWindow.y - vWindow.x, 0.0001);
    float drawn = clamp((uDraw - vWindow.x) / span, 0.0, 1.0);
    float erased = clamp((uErase - vWindow.x) / span, 0.0, 1.0);
    if (vU > drawn || vU < erased) discard;

    // Dry edges: the pen skips where the paper is rough.
    float tooth = vnoise(vStage * 26.0);
    if (abs(vSide) > 0.62 + tooth * 0.38) discard;

    gl_FragColor = vec4(mix(uInkA, uInkB, wipeMask()), 1.0);
  }
`;

// --- Satin ribbon ------------------------------------------------------------

export const ribbonVertex = /* glsl */ `
  attribute vec3 aTangent;
  attribute vec2 aPleat; // gather, ribbon width

  varying vec3 vNormal;
  varying vec3 vTangent;
  varying vec3 vWorld;
  varying vec2 vUv;
  varying vec2 vPleat;

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vTangent = normalize(mat3(modelMatrix) * aTangent);
    vUv = uv;
    vPleat = aPleat;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

export const ribbonFragment = /* glsl */ `
  ${NOISE}
  ${WIPE}
  uniform float uTime;
  uniform vec3 uRibbonA;
  uniform vec3 uRibbonB;
  uniform vec3 uInkA;
  uniform vec3 uInkB;

  varying vec3 vNormal;
  varying vec3 vTangent;
  varying vec3 vWorld;
  varying vec2 vUv;
  varying vec2 vPleat;

  float satin(vec3 T, vec3 V, vec3 L, float tightness) {
    vec3 H = normalize(L + V);
    float th = dot(T, H);
    return pow(sqrt(max(1.0 - th * th, 0.0)), tightness);
  }

  void main() {
    float mask = wipeMask();
    vec3 base = mix(uRibbonA, uRibbonB, mask);
    vec3 ink = mix(uInkA, uInkB, mask);

    vec3 T = normalize(vTangent);
    vec3 N = normalize(vNormal);
    vec3 B = normalize(cross(N, T));

    // Gathered pleats where the bow is pinched at the knot.
    float across = vUv.y - 0.5;
    N = normalize(N + B * sin(across * 17.0) * 0.8 * vPleat.x);

    vec3 V = normalize(cameraPosition - vWorld);
    if (dot(N, V) < 0.0) N = -N;

    vec3 key = normalize(vec3(0.35, 0.75, 0.9));
    vec3 rim = normalize(vec3(-0.8, 0.1, 0.55));

    float wrap = 0.5 + 0.5 * dot(N, key);
    float sheen = satin(T, V, key, 90.0) * 0.6 + satin(T, V, rim, 40.0) * 0.14;
    sheen *= smoothstep(-0.1, 0.5, dot(N, key) + 0.35);

    vec3 lit = base * (0.3 + 0.8 * wrap * wrap);
    // A dark ribbon still needs to read as cloth, so lift its shadows a touch.
    lit += (1.0 - step(0.2, max(base.r, max(base.g, base.b)))) * 0.06 * wrap;
    vec3 col = lit + mix(base, vec3(1.0), 0.5) * sheen;

    // Inked edge, redrawn with the rest of the hand-drawn layer, so the
    // ribbon belongs to the same drawing as the lettering.
    float frame = floor(uTime * ${BOIL_FPS});
    // Measured in stage units, so the line is the same pen whether it's
    // edging the narrow streamer or a full wing of the bow.
    float fromEdge = (0.5 - abs(across)) * vPleat.y;
    float lineWidth = 0.026 + 0.022 * vnoise(vec2(vUv.x * 60.0, frame));
    float outline = smoothstep(lineWidth + 0.008, lineWidth, fromEdge);
    col = mix(col, ink, outline * 0.9);

    gl_FragColor = vec4(col, 1.0);
  }
`;
