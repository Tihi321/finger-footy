import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../config';
import { RES } from './res';

export const FONT = 'Arial Black, Impact, sans-serif';
export const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
export const hex = (n: number): string => '#' + n.toString(16).padStart(6, '0');

/** Makes the 720 x GAME_H logical space fill the (possibly RES x larger) canvas. */
export function setupCamera(scene: Phaser.Scene): void {
  const cam = scene.cameras.main;
  cam.setZoom(RES);
  cam.centerOn(GAME_W / 2, GAME_H / 2);
}

/** Text that is rasterised at the render resolution so it stays sharp on high-DPI screens. */
export function addText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  style: Phaser.Types.GameObjects.Text.TextStyle = {},
): Phaser.GameObjects.Text {
  return scene.add.text(x, y, text, { fontFamily: FONT, ...style, resolution: RES });
}

export interface ButtonHandle {
  bg: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  setEnabled(enabled: boolean): void;
}

export function addButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  color: number,
  fontSize: number,
  onClick: () => void,
): ButtonHandle {
  const bg = scene.add.rectangle(x, y, w, h, color).setStrokeStyle(4, 0xffffff, 0.9).setInteractive({ useHandCursor: true });
  const txt = addText(scene, x, y, label, { fontSize: `${fontSize}px`, color: '#ffffff' }).setOrigin(0.5);
  bg.on('pointerdown', () => {
    bg.setScale(0.96);
    txt.setScale(0.96);
  });
  bg.on('pointerout', () => {
    bg.setScale(1);
    txt.setScale(1);
  });
  bg.on('pointerup', () => {
    bg.setScale(1);
    txt.setScale(1);
    onClick();
  });
  return {
    bg,
    label: txt,
    setEnabled(enabled: boolean) {
      bg.setAlpha(enabled ? 1 : 0.4);
      txt.setAlpha(enabled ? 1 : 0.5);
      if (enabled) bg.setInteractive({ useHandCursor: true });
      else bg.disableInteractive();
    },
  };
}

/** A labelled row of option buttons; returns a function to refresh the highlighted option. */
export function addSegmented<T extends string | number | boolean>(
  scene: Phaser.Scene,
  y: number,
  title: string,
  options: { value: T; label: string }[],
  get: () => T,
  set: (v: T) => void,
): { refresh(enabled?: boolean): void } {
  addText(scene, 90, y - 52, title, { fontSize: '26px', color: '#f3d9a4' }).setOrigin(0, 0.5);
  const total = 540;
  const gap = 12;
  const w = (total - gap * (options.length - 1)) / options.length;
  const items = options.map((o, i) => {
    const x = 90 + i * (w + gap) + w / 2;
    const bg = scene.add.rectangle(x, y, w, 70, 0x333333).setStrokeStyle(4, 0xffffff, 0.35).setInteractive({ useHandCursor: true });
    const t = addText(scene, x, y, o.label, { fontSize: '28px', color: '#ffffff' }).setOrigin(0.5);
    bg.on('pointerup', () => {
      set(o.value);
      refresh();
    });
    return { o, bg, t };
  });
  let enabled = true;
  function refresh(en?: boolean): void {
    if (en !== undefined) enabled = en;
    for (const it of items) {
      const sel = it.o.value === get();
      it.bg.setFillStyle(sel ? 0x2f9e44 : 0x333333);
      it.bg.setStrokeStyle(4, 0xffffff, sel ? 0.95 : 0.35);
      it.bg.setAlpha(enabled ? 1 : 0.35);
      it.t.setAlpha(enabled ? 1 : 0.35);
      if (enabled) it.bg.setInteractive({ useHandCursor: true });
      else it.bg.disableInteractive();
    }
  }
  refresh();
  return { refresh };
}
