// The attract screen is composed on a 16x10 "stage" at z = 0, origin in the
// middle, y up. Everything flat (lettering, doodles, the START button) is laid
// out in these units; the ribbon flies through the space around it.

export const STAGE = { width: 16, height: 10 };

// Texture pixels per stage unit for the lettering canvas.
export const TEXTURE_PX = 192;

// Tight bounds of the two wordmark paths inside the logo's viewBox.
const WORDMARK_SRC = { x: 361.4, y: 28, width: 326.9, height: 169.5 };

export const WORDMARK = {
  width: 7.4,
  top: 1.15,
  get scale() {
    return this.width / WORDMARK_SRC.width;
  },
  get bottom() {
    return this.top - WORDMARK_SRC.height * this.scale;
  },
};

/** Logo viewBox coordinates -> stage coordinates. */
export function wordmarkToStage(sx: number, sy: number): [number, number] {
  const k = WORDMARK.scale;
  return [
    (sx - WORDMARK_SRC.x - WORDMARK_SRC.width / 2) * k,
    WORDMARK.top - (sy - WORDMARK_SRC.y) * k,
  ];
}

export const TITLE = { text: "AUDITION FOR", y: 1.88, capHeight: 0.5 };

export const BOW = { x: 0, y: 3.55, z: 0.7 };

export const START = {
  text: "START",
  x: 0,
  y: -3.85,
  width: 3.7,
  height: 1.0,
  // Anything on the lettering plane below this line belongs to the button.
  top: -3.2,
};

/** Stage coordinates -> lettering canvas pixels. */
export function stageToCanvas(x: number, y: number): [number, number] {
  return [
    (x + STAGE.width / 2) * TEXTURE_PX,
    (STAGE.height / 2 - y) * TEXTURE_PX,
  ];
}
