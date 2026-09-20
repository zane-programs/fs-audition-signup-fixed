import * as THREE from "three";
import { BOW } from "./layout";

// One ribbon, two lives: a streamer looping lazily through the scene, and a
// bowtie. Both are described as a centreline plus a "width direction" over the
// same parameter s in 0..1, so tying the bow is just a staggered blend from
// one description to the other — the middle is pulled in first, the tails last.

const SEGMENTS = 440;

const STREAM_WIDTH = 0.52;

const WING = 2.15; // how far each wing reaches from the knot
const WING_DEPTH = 0.34; // front layer to back layer
const WING_HEIGHT = 1.95; // ribbon width at the far end of a wing
const KNOT_HEIGHT = 0.42; // ...and where it's pinched at the knot
const TAIL = 0.13; // share of the ribbon tucked away behind each wing

const smooth = (x: number) => {
  const t = Math.min(Math.max(x, 0), 1);
  return t * t * (3 - 2 * t);
};

interface BowSample {
  x: number;
  y: number;
  z: number;
  width: number;
  pleat: number;
}

function bowSample(s: number, out: BowSample) {
  out.y = 0;
  out.pleat = 0;

  if (s < TAIL || s > 1 - TAIL) {
    // Tails lie flat behind the wings, out of sight.
    const left = s < TAIL;
    const q = left ? 1 - s / TAIL : (s - (1 - TAIL)) / TAIL;
    out.x = (left ? -1 : 1) * WING * 0.8 * q;
    out.z = -WING_DEPTH * 0.85;
    out.width = KNOT_HEIGHT * 0.9;
    return;
  }

  // Each wing is a loop seen edge-on from above: out along the front, fold,
  // back along the rear. From the audience it reads as a flat flared wing.
  const left = s < 0.5;
  const q = left ? (s - TAIL) / (0.5 - TAIL) : (s - 0.5) / (0.5 - TAIL);
  const phi = q * Math.PI * 2;
  const reach = (1 - Math.cos(phi)) / 2;

  out.x = (left ? -1 : 1) * WING * reach;
  out.z = WING_DEPTH * Math.sin(phi);
  out.y = -0.09 * reach * reach;
  // Butterfly profile: flares out from the knot, fullest just shy of the
  // fold, then tucks in a little so the wing tips read as rounded.
  const flare = Math.pow(reach, 1.05) * (1 - 0.3 * smooth((reach - 0.7) / 0.3));
  out.width = KNOT_HEIGHT + (WING_HEIGHT - KNOT_HEIGHT) * flare;
  out.pleat = Math.pow(1 - reach, 0.7);
}

function streamPoint(u: number, t: number, out: THREE.Vector3) {
  out.set(
    7.1 * Math.sin(u + 0.3 + t * 0.05) + 1.5 * Math.sin(2.3 * u + 1.0),
    3.3 * Math.sin(1.7 * u + 1.1) + 0.9 * Math.cos(3.1 * u + t * 0.07) + 0.4,
    2.6 * Math.cos(1.3 * u + 0.7) + 0.25
  );
}

/** Wraps an angle into (-PI/2, PI/2]: a ribbon looks the same flipped over. */
function wrapHalfTurn(a: number) {
  a = ((a % Math.PI) + Math.PI) % Math.PI;
  return a > Math.PI / 2 ? a - Math.PI : a;
}

export class Ribbon {
  readonly group = new THREE.Group();

  private readonly geometry = new THREE.BufferGeometry();
  private readonly knot: THREE.Mesh;

  private readonly count = SEGMENTS + 1;
  private readonly centre = new Float32Array(this.count * 3);
  private readonly blend = new Float32Array(this.count);
  private readonly bowSide = new Float32Array(this.count * 3);
  private readonly widths = new Float32Array(this.count);
  private readonly twist = new Float32Array(this.count);

  private readonly position: THREE.BufferAttribute;
  private readonly normal: THREE.BufferAttribute;
  private readonly tangent: THREE.BufferAttribute;
  private readonly pleat: THREE.BufferAttribute;

  constructor(material: THREE.Material) {
    const vertexCount = this.count * 2;
    this.position = new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3);
    this.normal = new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3);
    this.tangent = new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3);
    this.pleat = new THREE.BufferAttribute(new Float32Array(vertexCount * 2), 2);
    for (const attribute of [this.position, this.normal, this.tangent, this.pleat]) {
      attribute.setUsage(THREE.DynamicDrawUsage);
    }

    const uv = new Float32Array(vertexCount * 2);
    const index: number[] = [];
    for (let i = 0; i < this.count; i++) {
      uv.set([i / SEGMENTS, 0, i / SEGMENTS, 1], i * 4);
      if (i > 0) {
        const a = (i - 1) * 2;
        index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }

    this.geometry.setAttribute("position", this.position);
    this.geometry.setAttribute("normal", this.normal);
    this.geometry.setAttribute("aTangent", this.tangent);
    this.geometry.setAttribute("aPleat", this.pleat);
    this.geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    this.geometry.setIndex(index);

    const mesh = new THREE.Mesh(this.geometry, material);
    // The ribbon roams well past its first frame's bounds.
    mesh.frustumCulled = false;
    this.group.add(mesh);

    this.knot = new THREE.Mesh(buildKnotGeometry(), material);
    this.knot.position.set(BOW.x, BOW.y, BOW.z);
    this.group.add(this.knot);
  }

  /**
   * @param time  seconds, drives the streamer's travel
   * @param tie   0 = streaming free, 1 = tied into the bow
   */
  update(time: number, tie: number) {
    const { count, centre, blend, bowSide, widths, twist } = this;
    const p = new THREE.Vector3();
    const bow: BowSample = { x: 0, y: 0, z: 0, width: 0, pleat: 0 };

    // The tied bow never sits perfectly still.
    const sway = Math.sin(time * 0.9) * 0.045 * tie;
    const cos = Math.cos(sway);
    const sin = Math.sin(sway);

    for (let i = 0; i < count; i++) {
      const s = i / SEGMENTS;
      const k = smooth(tie * 1.6 - Math.abs(s - 0.5) * 1.2);
      blend[i] = k;

      const u = s * 2.7 + time * 0.46;
      streamPoint(u, time, p);
      twist[i] = 1.4 * u + 1.2 * Math.sin(0.8 * u + time * 0.3);

      bowSample(s, bow);
      const bx = BOW.x + bow.x * cos - bow.y * sin;
      const by = BOW.y + bow.x * sin + bow.y * cos;
      const bz = BOW.z + bow.z;

      centre[i * 3] = p.x + (bx - p.x) * k;
      centre[i * 3 + 1] = p.y + (by - p.y) * k;
      centre[i * 3 + 2] = p.z + (bz - p.z) * k;

      bowSide[i * 3] = -sin;
      bowSide[i * 3 + 1] = cos;
      bowSide[i * 3 + 2] = 0;

      widths[i] = STREAM_WIDTH + (bow.width - STREAM_WIDTH) * k;
      // (how gathered the cloth is here, how wide the ribbon is here)
      this.pleat.setXY(i * 2, bow.pleat * k, widths[i]);
      this.pleat.setXY(i * 2 + 1, bow.pleat * k, widths[i]);
    }

    const T = new THREE.Vector3();
    const B0 = new THREE.Vector3();
    const N0 = new THREE.Vector3();
    const B = new THREE.Vector3();
    const N = new THREE.Vector3();
    const side = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const forward = new THREE.Vector3(0, 0, 1);

    let previousAngle = 0;
    for (let i = 0; i < count; i++) {
      const a = Math.max(i - 1, 0) * 3;
      const b = Math.min(i + 1, count - 1) * 3;
      T.set(centre[b] - centre[a], centre[b + 1] - centre[a + 1], centre[b + 2] - centre[a + 2]);
      if (T.lengthSq() < 1e-10) T.set(1, 0, 0);
      T.normalize();

      // A reference frame around the tangent to measure twist against.
      B0.copy(up).addScaledVector(T, -up.dot(T));
      if (B0.lengthSq() < 1e-4) B0.copy(forward).addScaledVector(T, -forward.dot(T));
      B0.normalize();
      N0.crossVectors(T, B0);

      // Swing from the streamer's twist to the bow's by the shorter way round.
      side.set(bowSide[i * 3], bowSide[i * 3 + 1], bowSide[i * 3 + 2]);
      const bowAngle = Math.atan2(side.dot(N0), side.dot(B0));
      let angle = twist[i] + blend[i] * wrapHalfTurn(bowAngle - twist[i]);
      // Flipped over is the same ribbon, but not the same quad: keep each
      // sample the same way up as its neighbour or the strip crosses itself.
      if (i > 0) angle += Math.PI * Math.round((previousAngle - angle) / Math.PI);
      previousAngle = angle;

      B.copy(B0).multiplyScalar(Math.cos(angle)).addScaledVector(N0, Math.sin(angle));
      N.crossVectors(T, B);

      // Ends are cut on the diagonal, the way ribbon is; one edge runs long.
      const isEnd = i === 0 || i === count - 1;
      const cut = isEnd ? widths[i] * 0.7 * (1 - blend[i]) * (i === 0 ? -1 : 1) : 0;

      const half = widths[i] / 2;
      for (let v = 0; v < 2; v++) {
        const sign = v === 0 ? -1 : 1;
        const o = i * 2 + v;
        const lead = v === 0 ? cut : 0;
        this.position.setXYZ(
          o,
          centre[i * 3] + B.x * half * sign + T.x * lead,
          centre[i * 3 + 1] + B.y * half * sign + T.y * lead,
          centre[i * 3 + 2] + B.z * half * sign + T.z * lead
        );
        this.normal.setXYZ(o, N.x, N.y, N.z);
        this.tangent.setXYZ(o, T.x, T.y, T.z);
      }
    }

    this.position.needsUpdate = true;
    this.normal.needsUpdate = true;
    this.tangent.needsUpdate = true;
    this.pleat.needsUpdate = true;

    // The knot cinches on at the very end, with a little overshoot.
    const cinch = Math.min(Math.max((tie - 0.72) / 0.28, 0), 1);
    const c = 1.70158;
    const back = 1 + (c + 1) * Math.pow(cinch - 1, 3) + c * Math.pow(cinch - 1, 2);
    this.knot.visible = cinch > 0.001;
    this.knot.scale.setScalar(Math.max(back, 0.0001));
    this.knot.rotation.z = sway;
  }

  dispose() {
    this.geometry.dispose();
    this.knot.geometry.dispose();
  }
}

/** A short band wrapped around the middle of the bow. */
function buildKnotGeometry() {
  const steps = 40;
  const width = 0.56;
  const position: number[] = [];
  const normal: number[] = [];
  const tangent: number[] = [];
  const uv: number[] = [];
  const pleat: number[] = [];
  const index: number[] = [];

  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const y = Math.sin(a) * 0.43;
    const z = Math.cos(a) * 0.47;
    // Slightly barrelled so it catches the light like a wrapped band.
    const ny = Math.sin(a) / 0.43;
    const nz = Math.cos(a) / 0.47;
    const nl = Math.hypot(ny, nz);

    for (let v = 0; v < 2; v++) {
      position.push((v - 0.5) * width, y, z);
      normal.push(0, ny / nl, nz / nl);
      tangent.push(0, Math.cos(a), -Math.sin(a));
      uv.push(i / steps, v);
      pleat.push(0, width);
    }
    if (i > 0) {
      const b = (i - 1) * 2;
      index.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normal, 3));
  geometry.setAttribute("aTangent", new THREE.Float32BufferAttribute(tangent, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute("aPleat", new THREE.Float32BufferAttribute(pleat, 2));
  geometry.setIndex(index);
  return geometry;
}
