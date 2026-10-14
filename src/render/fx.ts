// Juice: particles, screen shake, slow motion, fire trail, vibration.
import Phaser from 'phaser';
import { TEX } from './tableArt';

export class Fx {
  /** Multiplier applied to the simulation clock by the scene (1 = normal). */
  timeScale = 1;
  private slowLeft = 0; // real seconds of slow motion remaining
  private trail: Phaser.GameObjects.Particles.ParticleEmitter | null = null;

  constructor(private scene: Phaser.Scene) {}

  /** Little spark burst, e.g. on a kick or a hard hit. */
  burst(x: number, y: number, color: number, count: number, speed = 220): void {
    const e = this.scene.add.particles(x, y, TEX.spark, {
      speed: { min: speed * 0.3, max: speed },
      angle: { min: 0, max: 360 },
      lifespan: { min: 200, max: 480 },
      scale: { start: 0.9, end: 0 },
      tint: color,
      blendMode: 'ADD',
      emitting: false,
    });
    e.setDepth(6);
    e.explode(count);
    this.scene.time.delayedCall(700, () => e.destroy());
  }

  shake(durationMs: number, intensity: number): void {
    this.scene.cameras.main.shake(durationMs, intensity);
  }

  /** Brief slow motion (real-time duration). */
  slowMo(seconds = 0.4, scale = 0.35): void {
    this.slowLeft = seconds;
    this.timeScale = scale;
  }

  /** Call every frame with the real delta in seconds. */
  update(realDt: number): void {
    if (this.slowLeft > 0) {
      this.slowLeft -= realDt;
      if (this.slowLeft <= 0) this.timeScale = 1;
    }
  }

  /** Fire trail that follows the ball (Power Shot). */
  startTrail(target: Phaser.GameObjects.Image): void {
    this.stopTrail();
    const e = this.scene.add.particles(0, 0, TEX.spark, {
      follow: target,
      frequency: 14,
      lifespan: 380,
      speed: { min: 10, max: 60 },
      angle: { min: 0, max: 360 },
      scale: { start: 1.3, end: 0 },
      alpha: { start: 0.9, end: 0 },
      tint: [0xfff1a0, 0xffa030, 0xff4a1a],
      blendMode: 'ADD',
    });
    e.setDepth(3);
    this.trail = e;
  }

  stopTrail(): void {
    if (!this.trail) return;
    const t = this.trail;
    this.trail = null;
    t.stop();
    this.scene.time.delayedCall(450, () => t.destroy());
  }

  vibrate(ms: number): void {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(ms);
    } catch {
      /* unsupported */
    }
  }
}
