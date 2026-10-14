// Deterministic physics world. No Phaser imports, no Math.random.
import type { RodRole, Team } from '../config';
import { FIXED_DT, PHYS } from '../config';
import { collideCircleCircle, collideCircleSegment } from './collide';
import type { Segment } from './collide';
import { clamp } from './vec';

export type { Segment } from './collide';
export type WorldParams = typeof PHYS;

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

export interface Figure {
  id: number;
  rod: number; // rod index (0 = bottom)
  slot: number; // position of the figure on its rod
  team: Team;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  ghost: boolean; // ghost figures do not collide with the ball
  baseR: number; // nominal radius (r may be scaled temporarily, e.g. Iron Wall)
}

export interface Rod {
  index: number;
  team: Team;
  role: RodRole;
  y: number;
  baseXs: number[]; // figure x positions at offset 0
  figureIds: number[];
  offset: number;
  minOffset: number;
  maxOffset: number;
  targetOffset: number; // rod slides toward this at <= maxSpeed
  maxSpeed: number;
  vel: number; // current slide velocity (px/s)
}

export interface GoalZone {
  scorer: Team; // team that scores when the ball goes in here
  side: 'top' | 'bottom';
  lineY: number;
  x0: number;
  x1: number;
}

export type WorldEvent =
  | { type: 'figureHit'; figure: number; x: number; y: number; speed: number }
  | { type: 'wallHit'; x: number; y: number; speed: number }
  | { type: 'goal'; team: Team; side: 'top' | 'bottom' };

export interface RodInit {
  team: Team;
  role: RodRole;
  y: number;
  baseXs: number[];
  minOffset: number;
  maxOffset: number;
  figureRadius: number;
}

export class World {
  params: WorldParams;
  ball: Ball;
  segments: Segment[] = [];
  figures: Figure[] = [];
  rods: Rod[] = [];
  goals: GoalZone[] = [];
  /** Team that scored, once the ball has crossed a goal line. The ball is frozen until resetBall(). */
  goalScored: Team | null = null;
  /** Extra damping (1/s) added on top of params.damping, e.g. late in a long flight. */
  extraDamping = 0;
  /** Ball curve in rad/s (Banana Kick): rotates the ball velocity every substep. */
  ballCurve = 0;
  /** When set, the ball passes through the first figure NOT of this team that it touches (Ghost Ball). */
  ghostBallFor: Team | null = null;
  time = 0;

  constructor(params: WorldParams = PHYS) {
    this.params = params;
    this.ball = { x: 0, y: 0, vx: 0, vy: 0, r: params.ballRadius };
  }

  addRod(init: RodInit): Rod {
    const index = this.rods.length;
    const rod: Rod = {
      index,
      team: init.team,
      role: init.role,
      y: init.y,
      baseXs: init.baseXs.slice(),
      figureIds: [],
      offset: 0,
      minOffset: init.minOffset,
      maxOffset: init.maxOffset,
      targetOffset: 0,
      maxSpeed: 0,
      vel: 0,
    };
    init.baseXs.forEach((bx, slot) => {
      const id = this.figures.length;
      this.figures.push({
        id,
        rod: index,
        slot,
        team: init.team,
        x: bx,
        y: init.y,
        vx: 0,
        vy: 0,
        r: init.figureRadius,
        baseR: init.figureRadius,
        ghost: false,
      });
      rod.figureIds.push(id);
    });
    this.rods.push(rod);
    return rod;
  }

  setBall(x: number, y: number, vx = 0, vy = 0): void {
    this.ball.x = x;
    this.ball.y = y;
    this.ball.vx = vx;
    this.ball.vy = vy;
  }

  resetBall(x: number, y: number): void {
    this.setBall(x, y);
    this.goalScored = null;
    this.extraDamping = 0;
  }

  ballSpeed(): number {
    return Math.hypot(this.ball.vx, this.ball.vy);
  }

  /** Stops the ball dead (used for the hard flight cap). */
  stopBall(): void {
    this.ball.vx = 0;
    this.ball.vy = 0;
  }

  /** Teleports a rod to an offset (clamped), with zero velocity. */
  setRodOffset(rodIndex: number, offset: number): number {
    const rod = this.rods[rodIndex];
    rod.offset = clamp(offset, rod.minOffset, rod.maxOffset);
    rod.targetOffset = rod.offset;
    rod.vel = 0;
    this.syncRod(rod);
    return rod.offset;
  }

  /** Orders a rod to slide to a (clamped) target offset at up to `speed` px/s. */
  slideRodTo(rodIndex: number, target: number, speed: number): void {
    const rod = this.rods[rodIndex];
    rod.targetOffset = clamp(target, rod.minOffset, rod.maxOffset);
    rod.maxSpeed = speed;
  }

  haltRods(): void {
    for (const rod of this.rods) {
      rod.targetOffset = rod.offset;
      rod.vel = 0;
      for (const id of rod.figureIds) this.figures[id].vx = 0;
    }
  }

  private syncRod(rod: Rod): void {
    for (let i = 0; i < rod.figureIds.length; i++) {
      const f = this.figures[rod.figureIds[i]];
      f.x = rod.baseXs[i] + rod.offset;
      f.vx = rod.vel;
    }
  }

  private moveRods(h: number): void {
    for (const rod of this.rods) {
      const d = rod.targetOffset - rod.offset;
      const maxMove = rod.maxSpeed * h;
      const m = d > maxMove ? maxMove : d < -maxMove ? -maxMove : d;
      rod.offset += m;
      rod.vel = m / h;
      this.syncRod(rod);
    }
  }

  /** Advances the simulation by dt (use FIXED_DT). Returns the events that happened. */
  step(dt: number = FIXED_DT): WorldEvent[] {
    const events: WorldEvent[] = [];
    const p = this.params;
    const b = this.ball;

    if (this.goalScored) {
      this.moveRods(dt);
      this.time += dt;
      return events;
    }

    let speed = Math.hypot(b.vx, b.vy);
    if (speed > p.maxBallSpeed) {
      b.vx *= p.maxBallSpeed / speed;
      b.vy *= p.maxBallSpeed / speed;
      speed = p.maxBallSpeed;
    }
    const n = clamp(Math.ceil((speed * dt) / (b.r * p.maxSubstepFraction)), 1, 64);
    const h = dt / n;

    for (let i = 0; i < n; i++) {
      this.moveRods(h);
      if (this.ballCurve !== 0) {
        const a = this.ballCurve * h;
        const c = Math.cos(a);
        const s = Math.sin(a);
        const nvx = b.vx * c - b.vy * s;
        b.vy = b.vx * s + b.vy * c;
        b.vx = nvx;
      }
      b.x += b.vx * h;
      b.y += b.vy * h;
      this.resolveContacts(events);
      const s = Math.hypot(b.vx, b.vy);
      if (s > p.maxBallSpeed) {
        b.vx *= p.maxBallSpeed / s;
        b.vy *= p.maxBallSpeed / s;
      }
      if (this.checkGoal(events)) {
        b.vx = 0;
        b.vy = 0;
        this.time += dt;
        return events;
      }
      this.updateGhosts();
    }

    // rolling friction / air damping
    const s = Math.hypot(b.vx, b.vy);
    if (s > 0) {
      let ns = s * Math.exp(-(p.damping + this.extraDamping) * dt) - p.rollDecel * dt;
      if (ns < p.stopSpeed) ns = 0;
      const k = ns / s;
      b.vx *= k;
      b.vy *= k;
    }
    this.time += dt;
    return events;
  }

  private resolveContacts(events: WorldEvent[]): void {
    const p = this.params;
    const b = this.ball;
    for (let iter = 0; iter < 2; iter++) {
      for (const f of this.figures) {
        if (f.ghost) continue;
        if (this.ghostBallFor && f.team !== this.ghostBallFor) {
          const dx = b.x - f.x;
          const dy = b.y - f.y;
          const md = b.r + f.r;
          if (dx * dx + dy * dy < md * md) {
            f.ghost = true; // pass through; solid again once the ball is clear
            this.ghostBallFor = null;
            continue;
          }
        }
        const impact = collideCircleCircle(b, f, p.restitutionFigure);
        if (iter === 0 && impact >= p.impactEventMin) {
          events.push({ type: 'figureHit', figure: f.id, x: b.x, y: b.y, speed: impact });
        }
      }
      for (const seg of this.segments) {
        const impact = collideCircleSegment(b, seg, p.restitutionWall);
        if (iter === 0 && impact >= p.impactEventMin) {
          events.push({ type: 'wallHit', x: b.x, y: b.y, speed: impact });
        }
      }
    }
  }

  private checkGoal(events: WorldEvent[]): boolean {
    const b = this.ball;
    for (const g of this.goals) {
      const crossed = g.side === 'top' ? b.y < g.lineY : b.y > g.lineY;
      if (crossed && b.x > g.x0 && b.x < g.x1) {
        this.goalScored = g.scorer;
        events.push({ type: 'goal', team: g.scorer, side: g.side });
        return true;
      }
    }
    return false;
  }

  private updateGhosts(): void {
    const b = this.ball;
    for (const f of this.figures) {
      if (!f.ghost) continue;
      const clear = b.r + f.r + this.params.ghostMargin;
      const dx = b.x - f.x;
      const dy = b.y - f.y;
      if (dx * dx + dy * dy > clear * clear) f.ghost = false;
    }
  }

  /**
   * Pushes a resting ball clear of every figure (ghost or not) and then out of walls.
   * Position-only; velocity is zeroed.
   */
  nudgeClear(): void {
    const b = this.ball;
    b.vx = 0;
    b.vy = 0;
    for (let iter = 0; iter < 8; iter++) {
      let moved = false;
      for (const f of this.figures) {
        let dx = b.x - f.x;
        let dy = b.y - f.y;
        const minD = b.r + f.r + 1;
        const d = Math.hypot(dx, dy);
        if (d < minD) {
          if (d < 1e-9) {
            dx = 0;
            dy = f.team === 'blue' ? -1 : 1;
          } else {
            dx /= d;
            dy /= d;
          }
          b.x = f.x + dx * minD;
          b.y = f.y + dy * minD;
          moved = true;
        }
      }
      for (const seg of this.segments) {
        if (collideCircleSegment(b, seg, 0) >= 0) moved = true;
      }
      if (!moved) break;
    }
    b.vx = 0;
    b.vy = 0;
  }

  overlapsFigure(): boolean {
    const b = this.ball;
    return this.figures.some((f) => Math.hypot(b.x - f.x, b.y - f.y) < b.r + f.r);
  }

  /** Deep copy that evolves completely independently. */
  clone(): World {
    const w = new World(this.params);
    w.ball = { ...this.ball };
    w.segments = this.segments.map((s) => ({ ...s }));
    w.figures = this.figures.map((f) => ({ ...f }));
    w.rods = this.rods.map((r) => ({
      ...r,
      baseXs: r.baseXs.slice(),
      figureIds: r.figureIds.slice(),
    }));
    w.goals = this.goals.map((g) => ({ ...g }));
    w.goalScored = this.goalScored;
    w.extraDamping = this.extraDamping;
    w.ballCurve = this.ballCurve;
    w.ghostBallFor = this.ghostBallFor;
    w.time = this.time;
    return w;
  }

  /** Flat numeric snapshot, handy for determinism checks. */
  snapshot(): number[] {
    const out: number[] = [this.ball.x, this.ball.y, this.ball.vx, this.ball.vy, this.time];
    for (const f of this.figures) out.push(f.x, f.vx, f.ghost ? 1 : 0);
    for (const r of this.rods) out.push(r.offset, r.targetOffset);
    return out;
  }
}
