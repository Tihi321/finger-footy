// Synthesized sound effects (Web Audio). No audio files needed.

type Ctor = typeof AudioContext;

export class Sfx {
  enabled = true;
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  private lastPlay: Record<string, number> = {};

  /** Create/resume the context. Must be called from a user gesture (first touch). */
  unlock(): void {
    try {
      if (!this.ctx) {
        const C: Ctor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
        if (!C) return;
        this.ctx = new C();
        const len = this.ctx.sampleRate;
        this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        let s = 12345;
        for (let i = 0; i < len; i++) {
          s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
          d[i] = (s / 4294967296) * 2 - 1;
        }
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  private ready(name: string, minGap: number): AudioContext | null {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return null;
    const now = this.ctx.currentTime;
    if (now - (this.lastPlay[name] ?? -1) < minGap) return null;
    this.lastPlay[name] = now;
    return this.ctx;
  }

  private tone(c: AudioContext, type: OscillatorType, f0: number, f1: number, t0: number, dur: number, vol: number): void {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(c.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  private burst(c: AudioContext, t0: number, dur: number, vol: number, freq: number, q = 1): void {
    if (!this.noise) return;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const filt = c.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = freq;
    filt.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt).connect(g).connect(c.destination);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  /** Kick: a wooden "tock". */
  kick(strength = 1): void {
    const c = this.ready('kick', 0.03);
    if (!c) return;
    const t = c.currentTime;
    this.tone(c, 'sine', 320, 90, t, 0.12, 0.5 * Math.min(1, 0.4 + strength));
    this.burst(c, t, 0.05, 0.25, 1800, 2);
  }

  /** Ball against the wooden wall: a dry "clack". */
  wall(strength = 1): void {
    const c = this.ready('wall', 0.05);
    if (!c) return;
    const t = c.currentTime;
    const v = 0.15 + 0.3 * Math.min(1, strength);
    this.tone(c, 'square', 900, 400, t, 0.05, v * 0.4);
    this.burst(c, t, 0.06, v, 2600, 3);
  }

  /** Ball against a figure: a lighter, higher "tick". */
  hit(strength = 1): void {
    const c = this.ready('hit', 0.05);
    if (!c) return;
    const t = c.currentTime;
    const v = 0.15 + 0.3 * Math.min(1, strength);
    this.tone(c, 'triangle', 700, 300, t, 0.07, v);
    this.burst(c, t, 0.04, v * 0.6, 3500, 2);
  }

  /** Goal: crowd noise burst plus rising tones. */
  goal(): void {
    const c = this.ready('goal', 0.5);
    if (!c) return;
    const t = c.currentTime;
    this.burst(c, t, 1.4, 0.35, 900, 0.6);
    this.burst(c, t + 0.1, 1.0, 0.25, 1800, 0.8);
    [523, 659, 784, 1047].forEach((f, i) => this.tone(c, 'triangle', f, f * 1.01, t + i * 0.1, 0.35, 0.25));
  }

  /** Small UI blip. */
  click(): void {
    const c = this.ready('click', 0.05);
    if (!c) return;
    this.tone(c, 'sine', 600, 900, c.currentTime, 0.08, 0.2);
  }
}

/** Shared instance. */
export const sfx = new Sfx();
