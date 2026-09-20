import * as THREE from "three";
import { WORDMARK_PATHS } from "../../../components/fsWordmark";
import {
  STAGE,
  START,
  TEXTURE_PX,
  TITLE,
  WORDMARK,
  stageToCanvas,
  wordmarkToStage,
} from "./layout";

type Point = [number, number];

export interface Stroke {
  points: Point[];
  width: number;
  closed?: boolean;
}

// Deterministic, so the doodles look the same every time the kiosk resets.
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Stroke geometry
// ---------------------------------------------------------------------------

/**
 * Turns pen strokes into one ribbon-quad mesh. GL lines are a pixel wide and
 * can't vary, so each stroke is a strip the vertex shader fattens, tapers and
 * jitters. Strokes are drawn one after another: each gets a window inside the
 * group's 0..1 draw progress, sized by its length.
 */
export function buildStrokeGeometry(
  strokes: Stroke[],
  { z = 0.02, overlap = 0.35 } = {}
): THREE.BufferGeometry {
  const lengths = strokes.map(({ points }) => {
    let len = 0;
    for (let i = 1; i < points.length; i++) {
      len += Math.hypot(
        points[i][0] - points[i - 1][0],
        points[i][1] - points[i - 1][1]
      );
    }
    return Math.max(len, 0.001);
  });
  const total = lengths.reduce((a, b) => a + b, 0);
  // Overlapping windows: the next stroke starts before the last one lands.
  const stretch = 1 + overlap;

  const position: number[] = [];
  const normal: number[] = [];
  const side: number[] = [];
  const u: number[] = [];
  const stroke: number[] = [];
  const index: number[] = [];

  let cursor = 0;
  strokes.forEach(({ points, width, closed }, strokeIndex) => {
    const n = points.length;
    if (n < 2) return;

    const share = lengths[strokeIndex] / total;
    const t0 = cursor / stretch;
    const t1 = Math.min((cursor + share * stretch) / stretch, 1);
    cursor += share;
    const seed = strokeIndex * 13.7;

    const base = position.length / 3;
    let travelled = 0;

    for (let i = 0; i < n; i++) {
      const prev = points[closed ? (i - 1 + n) % n : Math.max(i - 1, 0)];
      const next = points[closed ? (i + 1) % n : Math.min(i + 1, n - 1)];
      let tx = next[0] - prev[0];
      let ty = next[1] - prev[1];
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;

      if (i > 0) {
        travelled += Math.hypot(
          points[i][0] - points[i - 1][0],
          points[i][1] - points[i - 1][1]
        );
      }
      const along = travelled / lengths[strokeIndex];

      for (const s of [-1, 1]) {
        position.push(points[i][0], points[i][1], z);
        normal.push(-ty, tx);
        side.push(s);
        u.push(along);
        stroke.push(seed, t0, t1, width);
      }

      if (i > 0) {
        const a = base + (i - 1) * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(position, 3)
  );
  geometry.setAttribute("aNormal", new THREE.Float32BufferAttribute(normal, 2));
  geometry.setAttribute("aSide", new THREE.Float32BufferAttribute(side, 1));
  geometry.setAttribute("aU", new THREE.Float32BufferAttribute(u, 1));
  geometry.setAttribute("aStroke", new THREE.Float32BufferAttribute(stroke, 4));
  geometry.setIndex(index);
  return geometry;
}

// ---------------------------------------------------------------------------
// Wordmark outlines
// ---------------------------------------------------------------------------

/**
 * Traces the real logo outlines into pen strokes, ordered the way you'd
 * letter them: left to right, a letter's counter right after the letter.
 */
export function wordmarkStrokes(): Stroke[] {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.style.position = "absolute";
  document.body.appendChild(svg);

  const strokes: Stroke[] = [];

  try {
    for (const d of WORDMARK_PATHS) {
      const contours = d
        .split(/(?=M)/)
        .map((sub) => sub.trim())
        .filter(Boolean)
        .map((sub) => {
          const path = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "path"
          );
          path.setAttribute("d", sub);
          svg.appendChild(path);

          const length = path.getTotalLength();
          const count = Math.max(Math.ceil(length / 1.4), 8);
          const points: Point[] = [];
          let minX = Infinity;
          for (let i = 0; i < count; i++) {
            const p = path.getPointAtLength((i / count) * length);
            minX = Math.min(minX, p.x);
            points.push(wordmarkToStage(p.x, p.y));
          }
          // Close the loop explicitly so the draw-on finishes where it began.
          points.push(points[0]);
          return { points, minX };
        });

      contours.sort((a, b) => a.minX - b.minX);
      for (const { points } of contours) {
        strokes.push({ points, width: 0.05, closed: true });
      }
    }
  } finally {
    svg.remove();
  }

  return strokes;
}

// ---------------------------------------------------------------------------
// Doodles
// ---------------------------------------------------------------------------

function curve(control: Point[], steps = 28): Point[] {
  // Catmull-Rom through the control points: quick to author, always smooth.
  const pts: Point[] = [];
  const at = (i: number) =>
    control[Math.min(Math.max(i, 0), control.length - 1)];
  for (let seg = 0; seg < control.length - 1; seg++) {
    const [p0, p1, p2, p3] = [at(seg - 1), at(seg), at(seg + 1), at(seg + 2)];
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      pts.push([0, 1].map((k) =>
        0.5 *
        (2 * p1[k] +
          (-p0[k] + p2[k]) * t +
          (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
          (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)
      ) as Point);
    }
  }
  pts.push(control[control.length - 1]);
  return pts;
}

/** A hand never draws the line it meant to. */
function unsteady(points: Point[], rand: () => number, amount = 0.04): Point[] {
  const phaseX = rand() * 10;
  const phaseY = rand() * 10;
  const freq = 2 + rand() * 3;
  return points.map(([x, y], i) => {
    const t = i / points.length;
    return [
      x + Math.sin(t * freq * Math.PI + phaseX) * amount,
      y + Math.cos(t * (freq + 1.3) * Math.PI + phaseY) * amount,
    ];
  });
}

function sparkle(cx: number, cy: number, r: number, rand: () => number): Stroke[] {
  // A four-pointed star in one pass of the pen, its sides bowed inwards.
  const tilt = (rand() - 0.5) * 0.35;
  const control: Point[] = [];
  for (let i = 0; i <= 8; i++) {
    const angle = Math.PI / 2 + tilt + (i * Math.PI) / 4;
    const isPoint = i % 2 === 0;
    const reach = isPoint ? (i % 4 === 0 ? r : r * 0.74) : r * 0.2;
    control.push([cx + Math.cos(angle) * reach, cy + Math.sin(angle) * reach]);
  }

  const points: Point[] = [];
  for (let i = 0; i < control.length - 1; i++) {
    // Straight runs between points keep the tips sharp.
    const [ax, ay] = control[i];
    const [bx, by] = control[i + 1];
    for (let step = 0; step < 6; step++) {
      const t = step / 6;
      points.push([ax + (bx - ax) * t, ay + (by - ay) * t]);
    }
  }
  // Overshoot the start a touch, like a pen that doesn't quite stop in time.
  points.push(control[0], [
    control[0][0] + (control[1][0] - control[0][0]) * 0.18,
    control[0][1] + (control[1][1] - control[0][1]) * 0.18,
  ]);

  return [{ points: unsteady(points, rand, r * 0.025), width: 0.055 }];
}

function musicNote(cx: number, cy: number, s: number, rand: () => number): Stroke[] {
  const head: Point[] = [];
  for (let i = 0; i <= 26; i++) {
    // Overshoot the loop a little, the way a quick pen does.
    const a = (i / 22) * Math.PI * 2 + 0.6;
    head.push([
      cx + Math.cos(a) * 0.3 * s * Math.cos(0.45) - Math.sin(a) * 0.2 * s * Math.sin(0.45),
      cy + Math.cos(a) * 0.3 * s * Math.sin(0.45) + Math.sin(a) * 0.2 * s * Math.cos(0.45),
    ]);
  }
  const stemX = cx + 0.27 * s;
  const stemTop = cy + 1.25 * s;
  return [
    { points: unsteady(head, rand, 0.015 * s), width: 0.075 },
    {
      points: unsteady(
        curve([[stemX, cy + 0.08 * s], [stemX + 0.02 * s, cy + 0.7 * s], [stemX, stemTop]], 8),
        rand,
        0.02 * s
      ),
      width: 0.065,
    },
    {
      points: unsteady(
        curve(
          [
            [stemX, stemTop],
            [stemX + 0.4 * s, stemTop - 0.28 * s],
            [stemX + 0.5 * s, stemTop - 0.62 * s],
            [stemX + 0.34 * s, stemTop - 0.9 * s],
          ],
          8
        ),
        rand,
        0.015 * s
      ),
      width: 0.075,
    },
  ];
}

function burst(cx: number, cy: number, from: number, to: number, rand: () => number): Stroke[] {
  // Comic-book "ta-da" ticks fanned around a point.
  const strokes: Stroke[] = [];
  const count = 5;
  for (let i = 0; i < count; i++) {
    const a = from + ((to - from) * i) / (count - 1);
    const inner = 0.55 + rand() * 0.1;
    const outer = inner + 0.4 + (i % 2) * 0.28;
    strokes.push({
      points: unsteady(
        curve(
          [
            [cx + Math.cos(a) * inner, cy + Math.sin(a) * inner],
            [cx + Math.cos(a) * outer, cy + Math.sin(a) * outer],
          ],
          6
        ),
        rand,
        0.02
      ),
      width: 0.075,
    });
  }
  return strokes;
}

function arrowAtStart(rand: () => number, mirrored: boolean): Stroke[] {
  const m = mirrored ? -1 : 1;
  const tipX = m * (START.width / 2 + 0.35);
  const tipY = START.y + 0.05;
  const shaft = curve(
    [
      [m * 5.6, -1.9],
      [m * 5.9, -2.9],
      [m * 4.6, -3.75],
      [m * 3.4, -3.55],
      [tipX, tipY],
    ],
    16
  );
  return [
    { points: unsteady(shaft, rand, 0.05), width: 0.085 },
    {
      points: unsteady(
        curve([[tipX + m * 0.5, tipY + 0.42], [tipX, tipY], [tipX + m * 0.62, tipY - 0.22]], 8),
        rand,
        0.02
      ),
      width: 0.085,
    },
  ];
}

function underline(rand: () => number, passes: number): Stroke[] {
  const y = WORDMARK.bottom - 0.22;
  const half = WORDMARK.width / 2;
  const strokes: Stroke[] = [];
  for (let i = 0; i < passes; i++) {
    const dir = i % 2 === 0 ? 1 : -1;
    const yy = y - i * 0.13;
    strokes.push({
      points: unsteady(
        curve(
          [
            [-dir * (half - 0.2), yy + 0.04],
            [-dir * half * 0.3, yy - 0.06],
            [dir * half * 0.35, yy + 0.05],
            [dir * (half + 0.1 - i * 0.6), yy - 0.02],
          ],
          14
        ),
        rand,
        0.03
      ),
      width: 0.09 - i * 0.015,
    });
  }
  return strokes;
}

/** One set of doodles per palette scene. */
export function doodleSets(): Stroke[][] {
  const sets: Stroke[][] = [];

  {
    const rand = seeded(11);
    sets.push([
      ...underline(rand, 1),
      ...sparkle(-5.3, 0.7, 0.62, rand),
      ...sparkle(5.1, 0.95, 0.48, rand),
      ...sparkle(-4.55, -1.75, 0.34, rand),
      ...sparkle(6.2, -0.55, 0.3, rand),
      ...sparkle(-6.4, -0.6, 0.26, rand),
      ...arrowAtStart(rand, false),
    ]);
  }

  {
    const rand = seeded(23);
    sets.push([
      ...underline(rand, 2),
      ...musicNote(-5.5, -0.6, 1.05, rand),
      ...musicNote(5.0, 0.0, 0.85, rand),
      ...musicNote(6.3, -1.5, 0.6, rand),
      ...musicNote(-6.5, 1.0, 0.55, rand),
      ...arrowAtStart(rand, true),
    ]);
  }

  {
    const rand = seeded(37);
    sets.push([
      ...underline(rand, 1),
      ...burst(-4.1, -0.6, Math.PI * 0.72, Math.PI * 1.28, rand).map((s) => ({
        ...s,
        points: s.points.map(([x, y]) => [x - 0.2, y] as Point),
      })),
      ...burst(4.1, -0.6, -Math.PI * 0.28, Math.PI * 0.28, rand).map((s) => ({
        ...s,
        points: s.points.map(([x, y]) => [x + 0.2, y] as Point),
      })),
      ...sparkle(-6.0, 1.6, 0.36, rand),
      ...sparkle(6.1, 1.5, 0.42, rand),
      ...arrowAtStart(rand, false),
    ]);
  }

  return sets;
}

// ---------------------------------------------------------------------------
// Lettering texture
// ---------------------------------------------------------------------------

function trackedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  baseline: number,
  tracking: number
) {
  const widths = Array.from(text).map((ch) => ctx.measureText(ch).width);
  const total =
    widths.reduce((a, b) => a + b, 0) + tracking * (text.length - 1);
  let x = cx - total / 2;
  Array.from(text).forEach((ch, i) => {
    ctx.fillText(ch, x, baseline);
    // Fatten the hairlines: a loaded brush doesn't do thin serifs, and the
    // shader's threshold would eat them.
    ctx.strokeText(ch, x, baseline);
    x += widths[i] + tracking;
  });
}

/**
 * Paints every filled shape into one texture, one channel each:
 *   R  the wordmark        G  lettering ("AUDITION FOR", "START")
 *   B  the START button's slab
 * Shapes are blurred slightly so the shader can threshold them like a distance
 * field, which is what lets their edges wobble without going soft.
 */
export function paintLettering(canvas: HTMLCanvasElement) {
  canvas.width = STAGE.width * TEXTURE_PX;
  canvas.height = STAGE.height * TEXTURE_PX;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = "lighter";
  if ("filter" in ctx) ctx.filter = "blur(3px)";

  // Wordmark
  {
    const [ox, oy] = wordmarkToStage(0, 0);
    const [px, py] = stageToCanvas(ox, oy);
    const k = WORDMARK.scale * TEXTURE_PX;
    ctx.save();
    ctx.setTransform(k, 0, 0, k, px, py);
    ctx.fillStyle = "#f00";
    for (const d of WORDMARK_PATHS) ctx.fill(new Path2D(d));
    ctx.restore();
  }

  ctx.fillStyle = "#0f0";
  ctx.strokeStyle = "#0f0";
  ctx.lineJoin = "round";
  ctx.lineWidth = TEXTURE_PX * 0.028;
  ctx.textBaseline = "alphabetic";

  // "AUDITION FOR" — Playfair's caps stand about 0.71em tall.
  {
    const size = (TITLE.capHeight * TEXTURE_PX) / 0.708;
    ctx.font = `900 ${size}px "Playfair Display", Georgia, serif`;
    const [cx, cy] = stageToCanvas(0, TITLE.y - TITLE.capHeight / 2);
    trackedText(ctx, TITLE.text, cx, cy, size * 0.2);
  }

  // START
  {
    const cap = START.height * 0.44;
    const size = (cap * TEXTURE_PX) / 0.708;
    ctx.font = `900 ${size}px "Playfair Display", Georgia, serif`;
    const [cx, cy] = stageToCanvas(START.x, START.y - cap / 2);
    trackedText(ctx, START.text, cx, cy, size * 0.22);

    // The slab is cut by hand: no two corners agree.
    const hw = START.width / 2;
    const hh = START.height / 2;
    const corners: Point[] = [
      [-hw - 0.04, hh - 0.03],
      [hw + 0.02, hh + 0.05],
      [hw + 0.07, -hh + 0.02],
      [-hw + 0.03, -hh - 0.05],
    ];
    ctx.fillStyle = "#00f";
    ctx.beginPath();
    corners.forEach(([x, y], i) => {
      const [px, py] = stageToCanvas(START.x + x, START.y + y);
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fill();
  }
}
