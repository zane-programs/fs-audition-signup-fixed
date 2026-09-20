import * as THREE from "three";
import { STAGE, START } from "./layout";
import {
  buildStrokeGeometry,
  doodleSets,
  paintLettering,
  wordmarkStrokes,
} from "./ink";
import { Ribbon } from "./ribbon";
import {
  backgroundFragment,
  backgroundVertex,
  fillFragment,
  fillVertex,
  lineFragment,
  lineVertex,
  ribbonFragment,
  ribbonVertex,
} from "./shaders";

// Colours are authored and blended as plain sRGB; nothing here is physically
// lit, so there's no linear workflow to protect.
THREE.ColorManagement.enabled = false;

interface Palette {
  bg: number;
  ink: number;
  ribbon: number;
}

const RED = 0xd4111e;
const BLACK = 0x000000;
const WHITE = 0xfbfbfb;

const PALETTES: Palette[] = [
  { bg: BLACK, ink: WHITE, ribbon: RED },
  { bg: RED, ink: WHITE, ribbon: 0x0b0b0b },
  { bg: WHITE, ink: 0x0a0a0a, ribbon: RED },
];

// Each palette gets one "scene". The bow is tied at the end of a scene and
// held across the cut, so the wipe to the next palette passes over the whole
// lockup — bow, lettering, button — at once.
const SCENE_SECONDS = 13;
const WIPE_SECONDS = 2.2;
const UNTIE = [2.6, 4.8];
const TIE = [9.2, 11.6];
const DOODLE_DRAW = [1.5, 3.9];
const DOODLE_ERASE = [11.0, 12.5];

// The opening: lettered in from nothing, once per visit to the screen.
const INTRO = {
  title: [0.2, 1.5],
  outline: [0.7, 3.6],
  fill: [2.4, 4.4],
  start: [4.2, 4.9],
  doodles: [4.9, 7.2],
};

const WIPE_ANGLES = [-0.35, 2.75, 0.5, 3.6, -0.9, 2.2];

const ramp = (t: number, [from, to]: number[]) =>
  Math.min(Math.max((t - from) / (to - from), 0), 1);
const ease = (t: number) => t * t * (3 - 2 * t);

export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export default class AttractScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(32, 1, 1, 80);
  private readonly ribbon: Ribbon;

  private readonly letteringCanvas = document.createElement("canvas");
  private readonly letteringTexture: THREE.CanvasTexture;

  private readonly fillMaterial: THREE.ShaderMaterial;
  private readonly outlineMaterial: THREE.ShaderMaterial;
  private readonly doodles: { mesh: THREE.Mesh; material: THREE.ShaderMaterial }[];
  private readonly disposables: { dispose: () => void }[] = [];

  // Shared by reference across every material, so one write updates them all.
  private readonly shared = {
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uWipe: { value: 0 },
    uWipeDir: { value: new THREE.Vector2(1, 0) },
    uBgA: { value: new THREE.Color(PALETTES[0].bg) },
    uBgB: { value: new THREE.Color(PALETTES[0].bg) },
    uInkA: { value: new THREE.Color(PALETTES[0].ink) },
    uInkB: { value: new THREE.Color(PALETTES[0].ink) },
    uRibbonA: { value: new THREE.Color(PALETTES[0].ribbon) },
    uRibbonB: { value: new THREE.Color(PALETTES[0].ribbon) },
  };

  private frameHandle = 0;
  private startedAt = 0;
  private sceneIndex = 0;
  private cameraDistance = 20;
  private hover = 0;
  private hoverTarget = 0;
  private lastFrame = 0;
  private disposed = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setClearColor(PALETTES[0].bg);

    const { shared } = this;

    // Background
    const background = new THREE.Mesh(
      this.track(new THREE.PlaneGeometry(2, 2)),
      this.track(
        new THREE.ShaderMaterial({
          vertexShader: backgroundVertex,
          fragmentShader: backgroundFragment,
          uniforms: {
            uRes: shared.uRes,
            uWipe: shared.uWipe,
            uWipeDir: shared.uWipeDir,
            uBgA: shared.uBgA,
            uBgB: shared.uBgB,
          },
          depthTest: false,
          depthWrite: false,
        })
      )
    );
    background.frustumCulled = false;
    background.renderOrder = -10;
    this.scene.add(background);

    // Filled lettering
    paintLettering(this.letteringCanvas);
    this.letteringTexture = this.track(
      new THREE.CanvasTexture(this.letteringCanvas)
    );
    this.letteringTexture.minFilter = THREE.LinearFilter;
    this.letteringTexture.generateMipmaps = false;

    this.fillMaterial = this.track(
      new THREE.ShaderMaterial({
        vertexShader: fillVertex,
        fragmentShader: fillFragment,
        uniforms: {
          uTex: { value: this.letteringTexture },
          uTime: shared.uTime,
          uRes: shared.uRes,
          uWipe: shared.uWipe,
          uWipeDir: shared.uWipeDir,
          uInkA: shared.uInkA,
          uInkB: shared.uInkB,
          uAccentA: shared.uRibbonA,
          uAccentB: shared.uRibbonB,
          uWordFill: { value: 0 },
          uTitleFill: { value: 0 },
          uStartIn: { value: 0 },
          uHover: { value: 0 },
          uStartCenter: {
            value: new THREE.Vector2(
              START.x / STAGE.width + 0.5,
              START.y / STAGE.height + 0.5
            ),
          },
          uStartTop: { value: START.top },
        },
        transparent: true,
      })
    );
    this.scene.add(
      new THREE.Mesh(
        this.track(new THREE.PlaneGeometry(STAGE.width, STAGE.height)),
        this.fillMaterial
      )
    );

    // Pen strokes
    const lineMaterial = () =>
      this.track(
        new THREE.ShaderMaterial({
          vertexShader: lineVertex,
          fragmentShader: lineFragment,
          uniforms: {
            uTime: shared.uTime,
            uRes: shared.uRes,
            uWipe: shared.uWipe,
            uWipeDir: shared.uWipeDir,
            uInkA: shared.uInkA,
            uInkB: shared.uInkB,
            uJitter: { value: 0.026 },
            uDraw: { value: 0 },
            uErase: { value: 0 },
          },
          side: THREE.DoubleSide,
        })
      );

    this.outlineMaterial = lineMaterial();
    this.outlineMaterial.uniforms.uJitter.value = 0.022;
    this.scene.add(
      new THREE.Mesh(
        this.track(buildStrokeGeometry(wordmarkStrokes(), { overlap: 0.15 })),
        this.outlineMaterial
      )
    );

    this.doodles = doodleSets().map((strokes) => {
      const material = lineMaterial();
      const mesh = new THREE.Mesh(
        this.track(buildStrokeGeometry(strokes)),
        material
      );
      mesh.visible = false;
      this.scene.add(mesh);
      return { mesh, material };
    });

    // Ribbon
    this.ribbon = new Ribbon(
      this.track(
        new THREE.ShaderMaterial({
          vertexShader: ribbonVertex,
          fragmentShader: ribbonFragment,
          uniforms: {
            uTime: shared.uTime,
            uRes: shared.uRes,
            uWipe: shared.uWipe,
            uWipeDir: shared.uWipeDir,
            uRibbonA: shared.uRibbonA,
            uRibbonB: shared.uRibbonB,
            uInkA: shared.uInkA,
            uInkB: shared.uInkB,
          },
          side: THREE.DoubleSide,
        })
      )
    );
    this.scene.add(this.ribbon.group);

    // The lettering uses a webfont; repaint once it has actually arrived.
    document.fonts
      ?.load('900 64px "Playfair Display"')
      .then(() => {
        if (this.disposed) return;
        paintLettering(this.letteringCanvas);
        this.letteringTexture.needsUpdate = true;
      })
      .catch(() => {});

    this.resize();
  }

  private track<T extends { dispose: () => void }>(resource: T): T {
    this.disposables.push(resource);
    return resource;
  }

  start() {
    this.startedAt = performance.now();
    this.lastFrame = this.startedAt;
    const loop = (now: number) => {
      this.frameHandle = requestAnimationFrame(loop);
      this.render(now);
    };
    this.frameHandle = requestAnimationFrame(loop);
  }

  setHover(hovering: boolean) {
    this.hoverTarget = hovering ? 1 : 0;
  }

  resize() {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
    this.renderer.getDrawingBufferSize(this.shared.uRes.value);

    // Pull back far enough that the whole stage fits, whatever the aspect.
    const aspect = width / height;
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const margin = 1.06;
    this.cameraDistance = Math.max(
      (STAGE.height * margin) / 2 / tan,
      (STAGE.width * margin) / 2 / (tan * aspect)
    );
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Where the START button currently sits, in CSS pixels over the canvas. */
  getStartRect(): ScreenRect {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const corner = new THREE.Vector3();
    const project = (x: number, y: number) => {
      corner.set(x, y, 0).project(this.camera);
      return [(corner.x * 0.5 + 0.5) * width, (0.5 - corner.y * 0.5) * height];
    };
    const [left, top] = project(
      START.x - START.width / 2,
      START.y + START.height / 2
    );
    const [right, bottom] = project(
      START.x + START.width / 2,
      START.y - START.height / 2
    );
    return { left, top, width: right - left, height: bottom - top };
  }

  private setPalette(from: Palette, to: Palette) {
    const { shared } = this;
    shared.uBgA.value.set(from.bg);
    shared.uBgB.value.set(to.bg);
    shared.uInkA.value.set(from.ink);
    shared.uInkB.value.set(to.ink);
    shared.uRibbonA.value.set(from.ribbon);
    shared.uRibbonB.value.set(to.ribbon);
  }

  private render(now: number) {
    // A frame's timestamp can predate the moment start() was called.
    const t = Math.max(now - this.startedAt, 0) / 1000;
    const dt = Math.min((now - this.lastFrame) / 1000, 0.1);
    this.lastFrame = now;

    const sceneIndex = Math.floor(t / SCENE_SECONDS);
    const local = t - sceneIndex * SCENE_SECONDS;
    const isIntro = sceneIndex === 0;

    if (sceneIndex !== this.sceneIndex) {
      this.sceneIndex = sceneIndex;
      const angle = WIPE_ANGLES[sceneIndex % WIPE_ANGLES.length];
      this.shared.uWipeDir.value.set(Math.cos(angle), Math.sin(angle));
      this.setPalette(
        PALETTES[(sceneIndex - 1) % PALETTES.length],
        PALETTES[sceneIndex % PALETTES.length]
      );
    }

    this.shared.uTime.value = t;
    this.shared.uWipe.value = isIntro
      ? 0
      : ease(ramp(local, [0, WIPE_SECONDS]));

    // Lettering
    const fill = this.fillMaterial.uniforms;
    fill.uTitleFill.value = ramp(t, INTRO.title);
    fill.uWordFill.value = ramp(t, INTRO.fill);
    fill.uStartIn.value = ease(ramp(t, INTRO.start));
    this.hover += (this.hoverTarget - this.hover) * Math.min(dt * 12, 1);
    fill.uHover.value = this.hover;
    this.outlineMaterial.uniforms.uDraw.value = ramp(t, INTRO.outline);

    // Doodles: only the current scene's set is on stage.
    const active = sceneIndex % this.doodles.length;
    this.doodles.forEach(({ mesh, material }, i) => {
      mesh.visible = i === active;
      if (!mesh.visible) return;
      material.uniforms.uDraw.value = ramp(
        local,
        isIntro ? INTRO.doodles : DOODLE_DRAW
      );
      material.uniforms.uErase.value = ramp(local, DOODLE_ERASE);
    });

    // Ribbon
    const untied = isIntro ? 1 : ease(ramp(local, UNTIE));
    const tie = (1 - untied) + ease(ramp(local, TIE));
    this.ribbon.update(t, Math.min(tie, 1));

    // A slow drift, so the ribbon's depth reads against the flat lettering.
    this.camera.position.set(
      Math.sin(t * 0.23) * 1.1,
      Math.sin(t * 0.31 + 1.0) * 0.55,
      this.cameraDistance
    );
    this.camera.lookAt(0, 0, 0);

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameHandle);
    this.ribbon.dispose();
    this.disposables.forEach((d) => d.dispose());
    this.renderer.dispose();
  }
}
