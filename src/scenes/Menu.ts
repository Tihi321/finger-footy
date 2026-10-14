import Phaser from 'phaser';
import { CENTER_X, GAME_H, GAME_W } from '../config';
import { sfx } from '../render/audio';
import { TEX } from '../render/tableArt';
import { addButton, addSegmented, addText, setupCamera } from '../render/ui';
import { loadSettings, saveSettings } from '../settings';
import type { Settings } from '../settings';

export class MenuScene extends Phaser.Scene {
  private settings!: Settings;

  constructor() {
    super('Menu');
  }

  create(): void {
    setupCamera(this);
    this.settings = loadSettings();
    const s = this.settings;
    const save = (): void => {
      saveSettings(s);
      sfx.enabled = s.sound;
    };
    sfx.enabled = s.sound;

    this.add.image(0, 0, TEX.table).setOrigin(0, 0).setDisplaySize(GAME_W, GAME_H);
    this.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.72).setOrigin(0, 0);

    addText(this, CENTER_X, 190, 'FINGER\nFOOTY', {
      fontSize: '120px',
      color: '#ffffff',
      align: 'center',
      stroke: '#1b3a8a',
      strokeThickness: 14,
      lineSpacing: -20,
    }).setOrigin(0.5);
    addText(this, CENTER_X, 370, 'table football, slingshot style', { fontSize: '28px', color: '#f3d9a4' }).setOrigin(0.5);

    addSegmented(this, 520, 'MODE', [
      { value: 'pass', label: 'PASS & PLAY' },
      { value: 'cpu', label: 'VS CPU' },
    ], () => s.mode, (v) => {
      s.mode = v;
      save();
      diff.refresh(v === 'cpu');
    });
    const diff = addSegmented(this, 670, 'CPU DIFFICULTY', [
      { value: 'easy', label: 'EASY' },
      { value: 'medium', label: 'MEDIUM' },
      { value: 'hard', label: 'HARD' },
    ], () => s.difficulty, (v) => {
      s.difficulty = v;
      save();
    });
    diff.refresh(s.mode === 'cpu');
    addSegmented(this, 820, 'GOALS TO WIN', [
      { value: 3, label: '3' },
      { value: 5, label: '5' },
      { value: 7, label: '7' },
    ], () => s.goalsToWin, (v) => {
      s.goalsToWin = v;
      save();
    });
    addSegmented(this, 970, 'SOUND', [
      { value: true, label: 'ON' },
      { value: false, label: 'OFF' },
    ], () => s.sound, (v) => {
      s.sound = v;
      save();
    });

    addButton(this, CENTER_X, 1150, 540, 120, 'PLAY', 0x2f9e44, 56, () => {
      sfx.unlock();
      sfx.click();
      this.scene.start('Match');
    });
    this.input.once('pointerdown', () => sfx.unlock());
  }
}
