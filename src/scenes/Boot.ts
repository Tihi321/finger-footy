import Phaser from 'phaser';
import { generateTextures } from '../render/tableArt';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    generateTextures(this);
    this.scene.start(new URLSearchParams(window.location.search).has('match') ? 'Match' : 'Menu'); // ?match skips the menu (dev shortcut)
  }
}
