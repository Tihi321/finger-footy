// Procedural art for the foosball table. Everything is drawn with Phaser Graphics and
// baked into textures, so no asset pipeline is needed.
import Phaser from 'phaser';
import {
  BALL_R, CENTER_X, CENTER_Y, CHAMFER, FELT, GAME_H, GAME_W, GOAL_DEPTH, GOAL_W, GOAL_X0, GOAL_X1,
} from '../config';
import type { Team } from '../config';
import { RES } from './res';

export const TEX = {
  table: 'table',
  ball: 'ball',
  spark: 'spark',
  rodBar: 'rod_bar',
  handleBlue: 'handle_blue',
  handleRed: 'handle_red',
  figBlue: 'fig_blue',
  figRed: 'fig_red',
} as const;

export const FRAME = { x0: 20, y0: 60, x1: 700, y1: 1220 } as const;
export const FIG_TEX_SIZE = 64;
export const ROD_TEX_H = 22;
export const ROD_BAR_H = 10;
export const HANDLE_W = 16;

const WOOD = 0x8a5527;
const WOOD_DARK = 0x5b3516;
const WOOD_LIGHT = 0xb27a43;
const FELT_A = 0x2e7d3b;
const FELT_B = 0x338a41;

/** Tiny deterministic PRNG so the generated art is identical every run. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeGraphics(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  return scene.make.graphics({ x: 0, y: 0 }, false);
}

function feltPolygon(): Phaser.Geom.Point[] {
  const { x0, y0, x1, y1 } = FELT;
  const c = CHAMFER;
  return [
    new Phaser.Geom.Point(x0 + c, y0),
    new Phaser.Geom.Point(x1 - c, y0),
    new Phaser.Geom.Point(x1, y0 + c),
    new Phaser.Geom.Point(x1, y1 - c),
    new Phaser.Geom.Point(x1 - c, y1),
    new Phaser.Geom.Point(x0 + c, y1),
    new Phaser.Geom.Point(x0, y1 - c),
    new Phaser.Geom.Point(x0, y0 + c),
  ];
}

function drawTable(scene: Phaser.Scene): void {
  const g = makeGraphics(scene);
  const rnd = lcg(1234);

  // floor
  g.fillStyle(0x14110e, 1);
  g.fillRect(0, 0, GAME_W, GAME_H);

  // drop shadow
  g.fillStyle(0x000000, 0.35);
  g.fillRoundedRect(FRAME.x0 + 6, FRAME.y0 + 8, FRAME.x1 - FRAME.x0, FRAME.y1 - FRAME.y0, 22);

  // wooden frame
  g.fillStyle(WOOD, 1);
  g.fillRoundedRect(FRAME.x0, FRAME.y0, FRAME.x1 - FRAME.x0, FRAME.y1 - FRAME.y0, 22);
  // wood grain
  for (let i = 0; i < 260; i++) {
    const x = FRAME.x0 + 6 + rnd() * (FRAME.x1 - FRAME.x0 - 12);
    const y = FRAME.y0 + 6 + rnd() * (FRAME.y1 - FRAME.y0 - 12);
    const len = 20 + rnd() * 90;
    const dark = rnd() < 0.6;
    g.lineStyle(1 + rnd() * 1.5, dark ? WOOD_DARK : WOOD_LIGHT, 0.18 + rnd() * 0.2);
    const horizontal = y < FELT.y0 || y > FELT.y1;
    if (horizontal) g.lineBetween(x, y, x + len, y + (rnd() - 0.5) * 3);
    else g.lineBetween(x, y, x + (rnd() - 0.5) * 3, y + len);
  }
  // bevel
  g.lineStyle(3, WOOD_LIGHT, 0.8);
  g.strokeRoundedRect(FRAME.x0 + 2, FRAME.y0 + 2, FRAME.x1 - FRAME.x0 - 4, FRAME.y1 - FRAME.y0 - 4, 20);
  g.lineStyle(3, WOOD_DARK, 0.9);
  g.strokeRoundedRect(FRAME.x0, FRAME.y0, FRAME.x1 - FRAME.x0, FRAME.y1 - FRAME.y0, 22);

  // goal pockets (dark recesses behind the goal lines)
  const pockets = [
    { y: FELT.y0 - GOAL_DEPTH, h: GOAL_DEPTH },
    { y: FELT.y1, h: GOAL_DEPTH },
  ];
  for (const p of pockets) {
    g.fillStyle(0x0d0d0d, 1);
    g.fillRect(GOAL_X0, p.y, GOAL_W, p.h);
    g.lineStyle(1, 0x555555, 0.7);
    for (let x = GOAL_X0; x <= GOAL_X1; x += 10) g.lineBetween(x, p.y, x, p.y + p.h);
    for (let y = p.y; y <= p.y + p.h; y += 10) g.lineBetween(GOAL_X0, y, GOAL_X1, y);
    g.lineStyle(4, 0xdddddd, 1);
    g.strokeRect(GOAL_X0, p.y, GOAL_W, p.h);
  }

  // felt with subtle stripes
  g.fillStyle(FELT_A, 1);
  g.fillPoints(feltPolygon(), true);
  const stripeH = (FELT.y1 - FELT.y0) / 16;
  for (let i = 0; i < 16; i += 2) {
    g.fillStyle(FELT_B, 1);
    g.fillRect(FELT.x0, FELT.y0 + i * stripeH, FELT.x1 - FELT.x0, stripeH);
  }
  // re-cut the chamfered corners with wood
  const c = CHAMFER;
  const corners: [number, number, number, number, number, number][] = [
    [FELT.x0, FELT.y0, FELT.x0 + c, FELT.y0, FELT.x0, FELT.y0 + c],
    [FELT.x1, FELT.y0, FELT.x1 - c, FELT.y0, FELT.x1, FELT.y0 + c],
    [FELT.x0, FELT.y1, FELT.x0 + c, FELT.y1, FELT.x0, FELT.y1 - c],
    [FELT.x1, FELT.y1, FELT.x1 - c, FELT.y1, FELT.x1, FELT.y1 - c],
  ];
  g.fillStyle(WOOD, 1);
  for (const t of corners) g.fillTriangle(t[0], t[1], t[2], t[3], t[4], t[5]);
  // felt speckle
  for (let i = 0; i < 700; i++) {
    const x = FELT.x0 + rnd() * (FELT.x1 - FELT.x0);
    const y = FELT.y0 + rnd() * (FELT.y1 - FELT.y0);
    g.fillStyle(rnd() < 0.5 ? 0x000000 : 0xffffff, 0.035);
    g.fillRect(x, y, 2, 2);
  }

  // inner edge of the felt
  g.lineStyle(5, 0x2b1809, 0.9);
  g.strokePoints(feltPolygon(), true);
  g.lineStyle(2, 0xffffff, 0.12);
  g.strokePoints(feltPolygon(), true);
  // reopen the goal mouths in the frame line
  for (const y of [FELT.y0, FELT.y1]) {
    g.fillStyle(0x0d0d0d, 1);
    g.fillRect(GOAL_X0 + 2, y - 3, GOAL_W - 4, 6);
  }

  // pitch lines
  const lineA = 0.85;
  g.lineStyle(4, 0xffffff, lineA);
  const inset = 16;
  // outline between chamfers and goal mouths
  g.lineBetween(FELT.x0 + inset, FELT.y0 + inset + c / 2, FELT.x0 + inset, FELT.y1 - inset - c / 2);
  g.lineBetween(FELT.x1 - inset, FELT.y0 + inset + c / 2, FELT.x1 - inset, FELT.y1 - inset - c / 2);
  g.lineBetween(FELT.x0 + inset + c / 2, FELT.y0 + inset, GOAL_X0, FELT.y0 + inset);
  g.lineBetween(GOAL_X1, FELT.y0 + inset, FELT.x1 - inset - c / 2, FELT.y0 + inset);
  g.lineBetween(FELT.x0 + inset + c / 2, FELT.y1 - inset, GOAL_X0, FELT.y1 - inset);
  g.lineBetween(GOAL_X1, FELT.y1 - inset, FELT.x1 - inset - c / 2, FELT.y1 - inset);
  // halfway line and centre circle
  g.lineBetween(FELT.x0 + inset, CENTER_Y, FELT.x1 - inset, CENTER_Y);
  g.strokeCircle(CENTER_X, CENTER_Y, 78);
  g.fillStyle(0xffffff, lineA);
  g.fillCircle(CENTER_X, CENTER_Y, 7);
  // boxes
  const bigW = 340;
  const bigD = 150;
  const smallW = GOAL_W + 40;
  const smallD = 60;
  g.strokeRect(CENTER_X - bigW / 2, FELT.y0 + inset, bigW, bigD - inset);
  g.strokeRect(CENTER_X - smallW / 2, FELT.y0 + inset, smallW, smallD - inset);
  g.strokeRect(CENTER_X - bigW / 2, FELT.y1 - bigD, bigW, bigD - inset);
  g.strokeRect(CENTER_X - smallW / 2, FELT.y1 - smallD, smallW, smallD - inset);
  // penalty spots
  g.fillCircle(CENTER_X, FELT.y0 + 105, 5);
  g.fillCircle(CENTER_X, FELT.y1 - 105, 5);

  // goal posts
  for (const y of [FELT.y0, FELT.y1]) {
    for (const x of [GOAL_X0, GOAL_X1]) {
      g.fillStyle(0xf0f0f0, 1);
      g.fillCircle(x, y, 6);
      g.lineStyle(2, 0x777777, 1);
      g.strokeCircle(x, y, 6);
    }
  }

  bake(g, TEX.table, GAME_W, GAME_H);
  g.destroy();
}

/** Static chrome bar spanning the full table width (it never moves; only the figures slide). */
function drawRodBar(scene: Phaser.Scene): void {
  const g = makeGraphics(scene);
  const w = GAME_W;
  const bands = [0x6b6f75, 0xaeb3ba, 0xe9edf2, 0xffffff, 0xd0d5db, 0x8d9299, 0x5d6167];
  const bandH = ROD_BAR_H / bands.length;
  bands.forEach((col, i) => {
    g.fillStyle(col, 1);
    g.fillRect(0, i * bandH, w, bandH + 0.4);
  });
  bake(g, TEX.rodBar, w, ROD_BAR_H);
  g.destroy();
}

/** Coloured grip that sticks out beside the frame. */
function drawHandle(scene: Phaser.Scene, key: string, team: Team): void {
  const g = makeGraphics(scene);
  const w = HANDLE_W;
  const h = ROD_TEX_H;
  const grip = team === 'blue' ? 0x1f56c4 : 0xc2321f;
  const gripLight = team === 'blue' ? 0x5c93ff : 0xff7a63;
  g.fillStyle(0x222222, 1);
  g.fillRoundedRect(0, 1, w, h - 2, 5);
  g.fillStyle(grip, 1);
  g.fillRoundedRect(1, 2, w - 2, h - 4, 4);
  g.fillStyle(gripLight, 0.55);
  g.fillRoundedRect(2, 3, w - 4, 4, 2);
  g.lineStyle(1.5, 0x000000, 0.35);
  for (let i = 4; i < w - 2; i += 4) g.lineBetween(i, 3, i, h - 3);
  bake(g, key, w, h);
  g.destroy();
}

function drawFigure(scene: Phaser.Scene, key: string, team: Team): void {
  const g = makeGraphics(scene);
  const c = FIG_TEX_SIZE / 2;
  const main = team === 'blue' ? 0x2f6fe0 : 0xe0432e;
  const dark = team === 'blue' ? 0x15347a : 0x7a1c10;
  const light = team === 'blue' ? 0x8db6ff : 0xff9a85;
  const dir = team === 'blue' ? -1 : 1; // blue attacks up, red attacks down

  // shadow
  g.fillStyle(0x000000, 0.3);
  g.fillEllipse(c + 3, c + 4, 46, 32);

  // boots, pointing toward the opponent goal
  g.fillStyle(0x111111, 1);
  g.fillEllipse(c - 10, c + dir * 18, 11, 15);
  g.fillEllipse(c + 10, c + dir * 18, 11, 15);
  g.fillStyle(0xf4f4f4, 1);
  g.fillEllipse(c - 10, c + dir * 20, 8, 6);
  g.fillEllipse(c + 10, c + dir * 20, 8, 6);

  // body (shoulders seen from above)
  g.fillStyle(dark, 1);
  g.fillEllipse(c, c, 46, 32);
  g.fillStyle(main, 1);
  g.fillEllipse(c, c, 42, 28);
  g.fillStyle(light, 0.5);
  g.fillEllipse(c - 5, c - 5, 24, 9);
  // shirt stripe
  g.fillStyle(0xffffff, 0.85);
  g.fillRect(c - 15, c - 2, 30, 4);

  // head
  g.fillStyle(0x000000, 0.25);
  g.fillCircle(c + 1, c + 1, 10);
  g.fillStyle(0xf1c9a0, 1);
  g.fillCircle(c, c, 9);
  // hair
  g.fillStyle(0x3a2515, 1);
  g.fillCircle(c, c - dir * 1, 7.5);
  g.fillStyle(0xf1c9a0, 1);
  g.fillEllipse(c, c + dir * 4, 11, 6);
  g.lineStyle(1.5, 0x000000, 0.4);
  g.strokeCircle(c, c, 9);

  bake(g, key, FIG_TEX_SIZE, FIG_TEX_SIZE);
  g.destroy();
}

function drawBall(scene: Phaser.Scene): void {
  const size = BALL_R * 2 + 6;
  const c = size / 2;
  const g = makeGraphics(scene);
  g.fillStyle(0x000000, 0.3);
  g.fillCircle(c + 2, c + 3, BALL_R);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(c, c, BALL_R);
  g.fillStyle(0x222222, 1);
  g.fillCircle(c, c, 4.5);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    g.fillCircle(c + Math.cos(a) * 10, c + Math.sin(a) * 10, 2.8);
  }
  g.fillStyle(0xffffff, 0.45);
  g.fillCircle(c - 4, c - 5, 4);
  g.lineStyle(2, 0x333333, 1);
  g.strokeCircle(c, c, BALL_R);
  bake(g, TEX.ball, size, size);
  g.destroy();
}

/** Generates every texture used by the game. Call once from the Boot scene. */
export function generateTextures(scene: Phaser.Scene): void {
  drawTable(scene);
  drawRodBar(scene);
  drawHandle(scene, TEX.handleBlue, 'blue');
  drawHandle(scene, TEX.handleRed, 'red');
  drawFigure(scene, TEX.figBlue, 'blue');
  drawFigure(scene, TEX.figRed, 'red');
  drawBall(scene);
  drawSpark(scene);
}

/** Soft white dot used for particles. */
function drawSpark(scene: Phaser.Scene): void {
  const g = makeGraphics(scene);
  g.fillStyle(0xffffff, 0.25);
  g.fillCircle(8, 8, 8);
  g.fillStyle(0xffffff, 0.6);
  g.fillCircle(8, 8, 5.5);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(8, 8, 3);
  bake(g, TEX.spark, 16, 16);
  g.destroy();
}

/** Bakes a graphics object into a texture at RES x resolution (display it with setDisplaySize). */
function bake(g: Phaser.GameObjects.Graphics, key: string, w: number, h: number): void {
  g.setScale(RES);
  g.generateTexture(key, Math.ceil(w * RES), Math.ceil(h * RES));
}
