import Phaser from 'phaser';
import { Bot } from '../ai/bot';
import { AIM, BOT, CENTER_X, CENTER_Y, COLORS, FELT, FIXED_DT, GAME_H, GAME_W, GOAL_X0, GOAL_X1, SHOT, TRAY_Y } from '../config';
import type { Team } from '../config';
import { CARD_DEFS } from '../game/cards';
import { Match } from '../game/match';
import { dragToShot } from '../game/shot';
import type { Pt, Shot } from '../game/shot';
import { simulateShot } from '../game/shotSim';
import type { WorldEvent } from '../physics/world';
import { sfx } from '../render/audio';
import { Fx } from '../render/fx';
import { FIG_TEX_SIZE, HANDLE_W, ROD_BAR_H, ROD_TEX_H, TEX } from '../render/tableArt';
import { EMOJI_FONT, addButton, addText, hex, setupCamera } from '../render/ui';
import { loadSettings } from '../settings';
import type { Settings } from '../settings';

interface CardSlot {
  bg: Phaser.GameObjects.Rectangle;
  icon: Phaser.GameObjects.Text;
  name: Phaser.GameObjects.Text;
  desc: Phaser.GameObjects.Text;
  tag: Phaser.GameObjects.Text;
}

interface BotPlan {
  bot: Bot;
  elapsed: number;
  dragT: number; // seconds spent on the fake drag, or -1 while still thinking
  dragDur: number;
  armed: boolean;
}

const CARD_W = 216;
const CARD_H = 128;
const CARD_Y = 1330;

export class MatchScene extends Phaser.Scene {
  match!: Match;
  private settings!: Settings;
  private fx!: Fx;
  private acc = 0;

  private handleL: Phaser.GameObjects.Image[] = [];
  private handleR: Phaser.GameObjects.Image[] = [];
  private figSprites: Phaser.GameObjects.Image[] = [];
  private figRadius: number[] = [];
  private ballSprite!: Phaser.GameObjects.Image;
  private aimG!: Phaser.GameObjects.Graphics;
  private ringG!: Phaser.GameObjects.Graphics;

  private scoreBlue!: Phaser.GameObjects.Text;
  private scoreRed!: Phaser.GameObjects.Text;
  private turnText!: Phaser.GameObjects.Text;
  private turnBg!: Phaser.GameObjects.Graphics;
  private hint!: Phaser.GameObjects.Text;
  private shownTurn: Team | null = null;

  private slots: CardSlot[] = [];
  private curveBtn!: { bg: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text };

  private dragStart: Pt | null = null;
  private dragCurrent: Pt | null = null;
  private overlay: Phaser.GameObjects.Container | null = null;
  private botPlan: BotPlan | null = null;
  private fakeShot: Shot | null = null;
  private prevPhase = '';
  private nearMissDone = false;

  constructor() {
    super('Match');
  }

  create(): void {
    setupCamera(this);
    this.settings = loadSettings();
    sfx.enabled = this.settings.sound;
    this.match = new Match({ goalsToWin: this.settings.goalsToWin, seed: Date.now() & 0x7fffffff });
    if (this.settings.mode === 'cpu') this.match.controllers.red = { kind: 'bot' };
    this.fx = new Fx(this);
    this.acc = 0;
    this.handleL = [];
    this.handleR = [];
    this.figSprites = [];
    this.figRadius = [];
    this.slots = [];
    this.dragStart = null;
    this.dragCurrent = null;
    this.overlay = null;
    this.botPlan = null;
    this.fakeShot = null;
    this.shownTurn = null;
    this.prevPhase = '';

    const w = this.match.world;
    this.add.image(0, 0, TEX.table).setOrigin(0, 0).setDisplaySize(GAME_W, GAME_H).setDepth(0);

    for (const rod of w.rods) {
      // the chrome bar spans the full width and never moves; only the figures slide
      this.add.image(0, rod.y, TEX.rodBar).setOrigin(0, 0.5).setDisplaySize(GAME_W, ROD_BAR_H).setDepth(1);
      const key = rod.team === 'blue' ? TEX.handleBlue : TEX.handleRed;
      this.handleL.push(this.add.image(0, rod.y, key).setOrigin(0, 0.5).setDisplaySize(HANDLE_W, ROD_TEX_H).setDepth(1));
      this.handleR.push(this.add.image(0, rod.y, key).setOrigin(0, 0.5).setDisplaySize(HANDLE_W, ROD_TEX_H).setDepth(1));
    }
    for (const f of w.figures) {
      this.figSprites.push(this.add.image(f.x, f.y, f.team === 'blue' ? TEX.figBlue : TEX.figRed).setDepth(2));
      this.figRadius.push(-1);
    }
    this.ringG = this.add.graphics().setDepth(3);
    this.ballSprite = this.add.image(w.ball.x, w.ball.y, TEX.ball).setDisplaySize(34, 34).setDepth(4);
    this.aimG = this.add.graphics().setDepth(5);

    this.createHud();
    this.createTray();

    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
    this.input.on('pointerupoutside', this.onUp, this);
    this.events.once('shutdown', () => {
      this.input.off('pointerdown', this.onDown, this);
      this.input.off('pointermove', this.onMove, this);
      this.input.off('pointerup', this.onUp, this);
      this.input.off('pointerupoutside', this.onUp, this);
      this.fx.stopTrail();
    });
    sfx.unlock(); // the player already touched the menu button
    this.input.once('pointerdown', () => sfx.unlock());
    this.sync();
  }

  // ---------------------------------------------------------------- HUD

  private createHud(): void {
    this.add.rectangle(0, 0, GAME_W, 58, 0x0c0a08, 1).setOrigin(0, 0).setDepth(10);
    this.turnBg = this.add.graphics().setDepth(11);
    const style = { fontSize: '34px' };
    this.scoreBlue = addText(this, 36, 29, 'BLUE 0', { ...style, color: hex(COLORS.blue) }).setOrigin(0, 0.5).setDepth(12);
    this.scoreRed = addText(this, GAME_W - 36, 29, 'RED 0', { ...style, color: hex(COLORS.red) }).setOrigin(1, 0.5).setDepth(12);
    this.turnText = addText(this, CENTER_X, 29, '', { fontSize: '24px', color: '#ffffff' }).setOrigin(0.5).setDepth(12);
    this.hint = addText(this, 270, 1240, '', { fontSize: '20px', color: '#f3d9a4' }).setOrigin(0.5).setDepth(12);
  }

  private teamName(t: Team): string {
    if (this.settings.mode === 'cpu') return t === 'red' ? 'CPU' : 'YOU';
    return t.toUpperCase();
  }

  private updateHud(): void {
    const m = this.match;
    this.scoreBlue.setText(`BLUE ${m.score.blue}`);
    this.scoreRed.setText(`RED ${m.score.red}`);
    if (this.shownTurn !== m.active) {
      this.shownTurn = m.active;
      const col = COLORS[m.active];
      this.turnBg.clear();
      this.turnBg.fillStyle(col, 1);
      this.turnBg.fillRoundedRect(CENTER_X - 120, 8, 240, 42, 21);
      this.turnBg.lineStyle(3, 0xffffff, 0.9);
      this.turnBg.strokeRoundedRect(CENTER_X - 120, 8, 240, 42, 21);
      const who = this.settings.mode === 'cpu' ? (m.active === 'red' ? "CPU'S TURN" : 'YOUR TURN') : `${m.active.toUpperCase()}'S TURN`;
      this.turnText.setText(who);
    }
    const bot = m.activeController.kind === 'bot';
    if (m.phase === 'Aim') {
      if (bot) this.hint.setText(this.botPlan && this.botPlan.dragT >= 0 ? 'CPU takes aim...' : 'CPU is thinking...');
      else if (m.armedCard() === 'banana') this.hint.setText('Drag back & release');
      else this.hint.setText(`Drag back & release  |  reach ${Math.round(m.reachMult() * 100)}%`);
    } else if (m.phase === 'Kickoff' || m.phase === 'NextTurn') {
      this.hint.setText(`${this.teamName(m.active)} lines up...`);
    } else {
      this.hint.setText('');
    }
  }

  // ----------------------------------------------------------- card tray

  private createTray(): void {
    this.add.rectangle(0, 1225, GAME_W, GAME_H - 1225, 0x0c0a08, 1).setOrigin(0, 0).setDepth(9);
    for (let i = 0; i < 3; i++) {
      const x = CENTER_X + (i - 1) * (CARD_W + 12);
      const bg = this.add.rectangle(x, CARD_Y, CARD_W, CARD_H, 0x2a2118).setStrokeStyle(4, 0x8a6a3a, 1).setDepth(10).setInteractive({ useHandCursor: true });
      const icon = addText(this, x - CARD_W / 2 + 12, CARD_Y - 30, '', { fontSize: '40px', fontFamily: EMOJI_FONT }).setOrigin(0, 0.5).setDepth(11);
      const name = addText(this, x - CARD_W / 2 + 62, CARD_Y - 32, '', { fontSize: '21px', color: '#ffffff' }).setOrigin(0, 0.5).setDepth(11);
      const desc = addText(this, x - CARD_W / 2 + 12, CARD_Y + 14, '', {
        fontSize: '17px',
        color: '#d8c7a5',
        wordWrap: { width: CARD_W - 24 },
        fontFamily: 'Arial, sans-serif',
      }).setOrigin(0, 0).setDepth(11);
      const tag = addText(this, x, CARD_Y + CARD_H / 2 - 4, 'ARMED - tap to cancel', { fontSize: '14px', color: '#1a1200' })
        .setOrigin(0.5, 1)
        .setDepth(12);
      bg.on('pointerdown', () => {
        if (this.match.armCard(i)) sfx.click();
      });
      this.slots.push({ bg, icon, name, desc, tag });
    }
    // banana left/right toggle
    const cbg = this.add.rectangle(595, 1240, 200, 34, 0xd9a400).setStrokeStyle(3, 0xffffff, 0.9).setDepth(12).setInteractive({ useHandCursor: true });
    const clabel = addText(this, 595, 1240, '', { fontSize: '18px', color: '#1a1200' }).setOrigin(0.5).setDepth(13);
    cbg.on('pointerdown', () => {
      this.match.setCurveDir(this.match.curveDir === 1 ? -1 : 1);
      sfx.click();
    });
    this.curveBtn = { bg: cbg, label: clabel };
  }

  private updateTray(): void {
    const m = this.match;
    const team: Team = this.settings.mode === 'cpu' ? 'blue' : m.active;
    const hand = m.hands[team];
    const mine = m.active === team && m.controllers[team].kind === 'human';
    const canTap = mine && m.phase === 'Aim' && !this.overlay;
    this.slots.forEach((s, i) => {
      const card = hand[i];
      const show = card !== undefined;
      for (const o of [s.bg, s.icon, s.name, s.desc]) o.setVisible(show);
      const armed = mine && m.armedIndex === i;
      s.tag.setVisible(show && armed);
      if (!show) {
        s.bg.disableInteractive();
        return;
      }
      const def = CARD_DEFS[card];
      s.icon.setText(def.icon);
      s.name.setText(def.name);
      s.desc.setText(def.text);
      s.bg.setFillStyle(armed ? 0xd9a400 : 0x2a2118);
      s.bg.setStrokeStyle(armed ? 6 : 4, armed ? 0xffffff : COLORS[team], 1);
      s.name.setColor(armed ? '#1a1200' : '#ffffff');
      s.desc.setColor(armed ? '#3a2a00' : '#d8c7a5');
      s.bg.setY(armed ? CARD_Y - 8 : CARD_Y);
      const dim = !canTap && !armed ? 0.55 : 1;
      s.bg.setAlpha(dim);
      s.icon.setAlpha(dim);
      s.name.setAlpha(dim);
      s.desc.setAlpha(dim);
      if (canTap) s.bg.setInteractive({ useHandCursor: true });
      else s.bg.disableInteractive();
    });
    const showCurve = canTap && m.armedCard() === 'banana';
    this.curveBtn.bg.setVisible(showCurve);
    this.curveBtn.label.setVisible(showCurve);
    if (showCurve) {
      this.curveBtn.label.setText(m.curveDir === -1 ? 'CURVE: LEFT' : 'CURVE: RIGHT');
      this.curveBtn.bg.setInteractive({ useHandCursor: true });
    } else {
      this.curveBtn.bg.disableInteractive();
    }
  }

  // -------------------------------------------------------------- input

  private canAim(): boolean {
    return this.match.canAim() && this.match.activeController.kind === 'human' && !this.overlay;
  }

  private onDown(p: Phaser.Input.Pointer): void {
    sfx.unlock();
    if (!this.canAim() || p.worldY > TRAY_Y) return;
    this.dragStart = { x: p.worldX, y: p.worldY };
    this.dragCurrent = { x: p.worldX, y: p.worldY };
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (this.dragStart) this.dragCurrent = { x: p.worldX, y: p.worldY };
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (!this.dragStart) return;
    this.dragCurrent = { x: p.worldX, y: p.worldY };
    const shot = this.currentShot();
    this.dragStart = null;
    this.dragCurrent = null;
    if (shot && shot.valid && this.canAim()) this.match.fire(shot.angle, shot.power);
  }

  private currentShot(): Shot | null {
    if (this.fakeShot) return this.fakeShot;
    if (!this.dragStart || !this.dragCurrent) return null;
    return dragToShot(this.dragStart, this.dragCurrent, this.match.basePower(), this.match.reachMult());
  }

  // ----------------------------------------------------------------- bot

  private updateBot(dt: number): void {
    const m = this.match;
    const isBotTurn = m.phase === 'Aim' && m.activeController.kind === 'bot' && !this.overlay;
    if (!isBotTurn) {
      if (this.botPlan && m.phase !== 'Aim') this.botPlan = null;
      this.fakeShot = null;
      return;
    }
    if (!this.botPlan) {
      this.botPlan = {
        bot: new Bot(m, this.settings.difficulty, (Date.now() + m.shots * 7919) & 0x7fffffff),
        elapsed: 0,
        dragT: -1,
        dragDur: Phaser.Math.FloatBetween(BOT.thinkMin, BOT.thinkMax),
        armed: false,
      };
    }
    const plan = this.botPlan;
    plan.elapsed += dt;
    if (plan.dragT < 0) {
      const ready = plan.bot.work(BOT.budgetMs);
      if (ready && plan.elapsed > 0.45) {
        const d = plan.bot.decision!;
        if (d.cardIndex !== null && m.armedIndex === null) {
          m.setCurveDir(d.curveDir);
          m.armCard(d.cardIndex);
        }
        plan.armed = true;
        plan.dragT = 0;
      }
      return;
    }
    const d = plan.bot.decision!;
    plan.dragT += dt;
    const t = Math.min(1, plan.dragT / plan.dragDur);
    const eased = 1 - Math.pow(1 - t, 2);
    const power = Math.min(d.power, m.maxPower()) * eased;
    this.fakeShot = {
      angle: d.angle,
      power,
      valid: true,
      dragLength: SHOT.maxDrag * eased,
      strength: eased,
    };
    if (t >= 1) {
      this.fakeShot = null;
      this.botPlan = null;
      m.fire(d.angle, Math.min(d.power, m.maxPower()));
    }
  }

  // --------------------------------------------------------------- loop

  update(_time: number, delta: number): void {
    const realDt = Math.min(delta / 1000, 0.1);
    this.fx.update(realDt);
    this.acc += realDt * this.fx.timeScale;
    while (this.acc >= FIXED_DT) {
      this.acc -= FIXED_DT;
      const events = this.match.update(FIXED_DT);
      for (const e of events) this.onWorldEvent(e);
    }
    this.updateBot(realDt);
    if (this.match.phase !== this.prevPhase) this.onPhaseChange(this.prevPhase, this.match.phase);
    this.prevPhase = this.match.phase;
    if (this.match.phase === 'End' && !this.overlay) this.showWinner();
    if (!this.canAim() && this.dragStart) {
      this.dragStart = null;
      this.dragCurrent = null;
    }
    this.sync();
    this.updateHud();
    this.updateTray();
    this.drawAim();
  }

  private onPhaseChange(from: string, to: string): void {
    const m = this.match;
    if (to === 'Flight') {
      const b = m.world.ball;
      const speed = m.world.ballSpeed();
      sfx.kick(speed / SHOT.maxPower);
      this.fx.burst(b.x, b.y, 0xffffff, 10, 260);
      this.fx.vibrate(25);
      this.nearMissDone = false;
      if (m.shotMods.some((x) => x.trail)) this.fx.startTrail(this.ballSprite);
    }
    if (from === 'Flight') this.fx.stopTrail();
    if (to === 'Aim') this.fx.stopTrail();
  }

  private onWorldEvent(e: WorldEvent): void {
    if (e.type === 'goal') {
      sfx.goal();
      this.showGoal(e.team);
      this.fx.burst(this.match.world.ball.x, this.match.world.ball.y, COLORS[e.team], 36, 420);
      this.fx.vibrate(120);
    } else if (e.type === 'wallHit') {
      sfx.wall(e.speed / 1500);
      if (e.speed > 400) this.fx.burst(e.x, e.y, 0xdeb887, 6);
      if (e.speed > 1000) this.fx.shake(90, 0.003);
      // brief slow motion when the ball clangs off a post
      const nearGoalLine = e.y < FELT.y0 + 45 || e.y > FELT.y1 - 45;
      const nearPost = Math.abs(e.x - GOAL_X0) < 30 || Math.abs(e.x - GOAL_X1) < 30;
      if (!this.nearMissDone && nearGoalLine && nearPost && e.speed > 300) {
        this.nearMissDone = true;
        this.fx.slowMo(0.4, 0.35);
      }
    } else if (e.type === 'figureHit') {
      sfx.hit(e.speed / 1500);
      const f = this.match.world.figures[e.figure];
      if (e.speed > 350) this.fx.burst(e.x, e.y, COLORS[f.team], 6);
      if (e.speed > 1100) this.fx.shake(90, 0.003);
    }
  }

  private sync(): void {
    const w = this.match.world;
    w.rods.forEach((rod, i) => {
      // handles creep a few px with the rod but always stay outside the wooden frame (x 20..700)
      const k = rod.maxOffset > 0 ? rod.offset / rod.maxOffset : 0;
      this.handleL[i].setPosition(2 + 2 * k, rod.y);
      this.handleR[i].setPosition(GAME_W - HANDLE_W - 2 + 2 * k, rod.y);
    });
    w.figures.forEach((f, i) => {
      const s = this.figSprites[i];
      s.setPosition(f.x, f.y);
      if (this.figRadius[i] !== f.r) {
        this.figRadius[i] = f.r;
        const size = (FIG_TEX_SIZE * f.r) / 22;
        s.setDisplaySize(size, size);
      }
    });
    this.ballSprite.setPosition(w.ball.x, w.ball.y);
  }

  // ---------------------------------------------------------- aim visuals

  private drawAim(): void {
    const g = this.aimG;
    const ring = this.ringG;
    g.clear();
    ring.clear();
    const m = this.match;
    const w = m.world;

    // glowing ring around the kicker figure
    if (m.kicker && (m.phase === 'Kickoff' || m.phase === 'NextTurn' || m.phase === 'Aim')) {
      const f = w.figures[m.kicker.figureIndex];
      const pulse = 0.5 + 0.5 * Math.sin(this.time.now / 180);
      const col = 0xffe066;
      for (let i = 4; i >= 1; i--) {
        ring.lineStyle(i * 4, col, 0.07 + 0.03 * pulse);
        ring.strokeCircle(f.x, f.y, f.r + 6 + pulse * 2);
      }
      ring.lineStyle(3, col, 0.9);
      ring.strokeCircle(f.x, f.y, f.r + 6 + pulse * 2);
    }

    const shot = this.currentShot();
    if (!shot || !shot.valid) return;
    if (!this.fakeShot && (!this.dragStart || !this.dragCurrent)) return;

    if (!this.fakeShot && this.dragStart && this.dragCurrent) {
      g.lineStyle(3, 0xffffff, 0.35);
      g.lineBetween(this.dragStart.x, this.dragStart.y, this.dragCurrent.x, this.dragCurrent.y);
      g.fillStyle(0xffffff, 0.35);
      g.fillCircle(this.dragStart.x, this.dragStart.y, 10);
    }

    const ball = w.ball;
    const dirX = Math.cos(shot.angle);
    const dirY = Math.sin(shot.angle);
    const t = shot.power / m.basePower(); // 0..1, already includes the reach penalty
    const col = this.powerColor(t);
    const len = AIM.arrowMin + t * (AIM.arrowMax - AIM.arrowMin);

    for (const d of this.previewDots(shot)) {
      g.fillStyle(0xffffff, 0.85);
      g.fillCircle(d.x, d.y, 4.5);
    }
    const sx = ball.x + dirX * (ball.r + 6);
    const sy = ball.y + dirY * (ball.r + 6);
    const ex = ball.x + dirX * (ball.r + 6 + len);
    const ey = ball.y + dirY * (ball.r + 6 + len);
    this.drawArrow(g, sx, sy, ex, ey, 0x000000, 20, 0.45);
    this.drawArrow(g, sx, sy, ex, ey, col, 12, 1);
  }

  private drawArrow(g: Phaser.GameObjects.Graphics, sx: number, sy: number, ex: number, ey: number, color: number, width: number, alpha: number): void {
    const a = Math.atan2(ey - sy, ex - sx);
    const head = width * 2.2;
    const bx = ex - Math.cos(a) * head * 0.8;
    const by = ey - Math.sin(a) * head * 0.8;
    g.lineStyle(width, color, alpha);
    g.lineBetween(sx, sy, bx, by);
    g.fillStyle(color, alpha);
    g.fillTriangle(
      ex + Math.cos(a) * (width * 0.4), ey + Math.sin(a) * (width * 0.4),
      bx + Math.cos(a + Math.PI / 2) * head * 0.7, by + Math.sin(a + Math.PI / 2) * head * 0.7,
      bx + Math.cos(a - Math.PI / 2) * head * 0.7, by + Math.sin(a - Math.PI / 2) * head * 0.7,
    );
  }

  /** green -> yellow -> red */
  private powerColor(t: number): number {
    const c = Phaser.Math.Clamp(t, 0, 1);
    const from = c < 0.5 ? new Phaser.Display.Color(60, 220, 90) : new Phaser.Display.Color(255, 220, 40);
    const to = c < 0.5 ? new Phaser.Display.Color(255, 220, 40) : new Phaser.Display.Color(255, 60, 40);
    const k = c < 0.5 ? c * 2 : (c - 0.5) * 2;
    const r = Phaser.Display.Color.Interpolate.ColorWithColor(from, to, 1, k);
    return Phaser.Display.Color.GetColor(r.r, r.g, r.b);
  }

  /**
   * Dots along the simulated path (same shot sim as the real shot, so cards and defense are included).
   * Normally stops at the first collision; with Long Sight it follows the ball through bounces.
   */
  private previewDots(shot: Shot): Pt[] {
    const m = this.match;
    if (!m.kicker) return [];
    const ctx = m.buildContext();
    const long = ctx.mods.some((x) => x.longSight);
    const maxDots = long ? 160 : AIM.previewMaxDots;
    const maxTime = long ? 5 : AIM.previewMaxSeconds;
    const dots: Pt[] = [];
    let last = { x: m.world.ball.x, y: m.world.ball.y };
    let travelled = 0;
    simulateShot(m.world, ctx, shot.angle, shot.power, (world, events) => {
      const b = world.ball;
      travelled += Math.hypot(b.x - last.x, b.y - last.y);
      last = { x: b.x, y: b.y };
      if (travelled >= AIM.previewDotSpacing) {
        travelled = 0;
        dots.push({ x: b.x, y: b.y });
      }
      if (dots.length >= maxDots || world.time - m.world.time > maxTime) return true;
      if (!long && events.length > 0) return true;
      return false;
    });
    return dots;
  }

  // ----------------------------------------------------- goal and winner

  private showGoal(team: Team): void {
    const t = addText(this, CENTER_X, CENTER_Y, 'GOAL!', {
      fontSize: '170px',
      color: '#ffffff',
      stroke: hex(COLORS[team]),
      strokeThickness: 22,
    })
      .setOrigin(0.5)
      .setDepth(20)
      .setScale(0.1)
      .setAlpha(0);
    this.fx.shake(300, 0.01);
    this.tweens.add({ targets: t, scale: 1.15, alpha: 1, duration: 320, ease: 'Back.Out' });
    this.tweens.add({ targets: t, alpha: 0, scale: 1.5, delay: 1200, duration: 450, onComplete: () => t.destroy() });
  }

  private showWinner(): void {
    const m = this.match;
    const winner = m.winner ?? 'blue';
    const cpu = this.settings.mode === 'cpu';
    const title = cpu ? (winner === 'blue' ? 'YOU\nWIN!' : 'CPU\nWINS') : `${winner.toUpperCase()}\nWINS!`;
    const c = this.add.container(0, 0).setDepth(30);
    c.add(this.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.78).setOrigin(0, 0).setInteractive());
    c.add(
      addText(this, CENTER_X, 420, title, {
        fontSize: '130px',
        color: '#ffffff',
        align: 'center',
        stroke: hex(COLORS[winner]),
        strokeThickness: 16,
      }).setOrigin(0.5),
    );
    c.add(addText(this, CENTER_X, 650, `${m.score.blue}  -  ${m.score.red}`, { fontSize: '80px', color: '#f3d9a4' }).setOrigin(0.5));
    const again = addButton(this, CENTER_X, 840, 480, 100, 'Play again', 0x2f9e44, 44, () => this.scene.restart());
    const menu = addButton(this, CENTER_X, 970, 480, 80, 'Menu', 0x444444, 36, () => this.scene.start('Menu'));
    c.add([again.bg, again.label, menu.bg, menu.label]);
    this.overlay = c;
  }
}
