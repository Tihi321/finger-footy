import { describe, expect, it } from 'vitest';
import { FELT, FIXED_DT, GOAL_DEPTH, PHYS } from '../src/config';
import { simulateStep } from '../src/game/defense';
import { createWorld } from '../src/game/table';
import { World } from '../src/physics/world';
import type { WorldEvent } from '../src/physics/world';

const frictionless = { ...PHYS, damping: 0, rollDecel: 0, stopSpeed: 0 };

/** The standard table without rods or figures, so only walls and goals matter. */
function emptyTable(): World {
  const w = createWorld();
  w.rods = [];
  w.figures = [];
  return w;
}

function run(w: World, steps: number): WorldEvent[] {
  const all: WorldEvent[] = [];
  for (let i = 0; i < steps; i++) all.push(...w.step(FIXED_DT));
  return all;
}

describe('wall collisions', () => {
  it('reflects the normal component and loses energy', () => {
    const w = new World(frictionless);
    w.segments = [{ ax: 100, ay: -1000, bx: 100, by: 1000 }];
    w.setBall(50, 0, 500, 300);
    const before = w.ballSpeed();
    const events = run(w, 120);
    expect(events.some((e) => e.type === 'wallHit')).toBe(true);
    expect(w.ball.vx).toBeCloseTo(-400, 3); // restitution 0.8
    expect(w.ball.vy).toBeCloseTo(300, 3); // tangential component preserved
    expect(w.ballSpeed()).toBeLessThan(before);
  });
});

describe('moving figures', () => {
  it('a sliding rod imparts velocity to the ball', () => {
    const w = new World(frictionless);
    w.addRod({ team: 'blue', role: 'ATK', y: 100, baseXs: [100], minOffset: -500, maxOffset: 500, figureRadius: 22 });
    w.setBall(160, 100);
    w.slideRodTo(0, 300, 600);
    run(w, 60);
    expect(w.ball.vx).toBeGreaterThan(600);
    expect(Math.abs(w.ball.vy)).toBeLessThan(1);
  });

  it('a stationary figure reflects the ball', () => {
    const w = new World(frictionless);
    w.addRod({ team: 'red', role: 'ATK', y: 100, baseXs: [300], minOffset: 0, maxOffset: 0, figureRadius: 22 });
    w.setBall(200, 100, 400, 0);
    run(w, 120);
    expect(w.ball.vx).toBeLessThan(0);
  });

  it('ghost figures are ignored until the ball is clear', () => {
    const w = new World(frictionless);
    w.addRod({ team: 'red', role: 'ATK', y: 100, baseXs: [100], minOffset: 0, maxOffset: 0, figureRadius: 22 });
    w.figures[0].ghost = true;
    w.setBall(110, 100, 300, 0);
    run(w, 240);
    expect(w.ball.vx).toBeCloseTo(300, 3);
    expect(w.figures[0].ghost).toBe(false);
  });
});

describe('goals', () => {
  it('detects a goal at the top for blue', () => {
    const w = emptyTable();
    w.setBall(360, 400, 0, -1200);
    const events = run(w, 240);
    const goal = events.find((e) => e.type === 'goal');
    expect(goal).toEqual({ type: 'goal', team: 'blue', side: 'top' });
    expect(w.goalScored).toBe('blue');
    expect(w.ball.y).toBeLessThan(FELT.y0);
    expect(w.ball.y).toBeGreaterThan(FELT.y0 - GOAL_DEPTH);
  });

  it('detects a goal at the bottom for red', () => {
    const w = emptyTable();
    w.setBall(360, 900, 0, 1200);
    const events = run(w, 240);
    expect(events.find((e) => e.type === 'goal')).toEqual({ type: 'goal', team: 'red', side: 'bottom' });
  });

  it('does not count a shot that hits the post', () => {
    for (const x of [262, 458, 250, 470]) {
      const w = emptyTable();
      w.setBall(x, 400, 0, -1500);
      const events = run(w, 480);
      expect(events.some((e) => e.type === 'goal')).toBe(false);
      expect(w.goalScored).toBeNull();
      expect(w.ball.y).toBeGreaterThan(FELT.y0);
    }
  });
});

describe('tunneling', () => {
  it('never passes through a thin wall at max speed', () => {
    const w = new World(frictionless);
    w.segments = [{ ax: 100, ay: -5000, bx: 100, by: 5000 }];
    w.setBall(0, 0, PHYS.maxBallSpeed, 0);
    run(w, 120);
    expect(w.ball.x).toBeLessThan(100);
  });

  it('keeps the ball inside the table at max speed from every angle', () => {
    for (let a = 0; a < 72; a++) {
      const w = emptyTable();
      const ang = (a / 72) * Math.PI * 2;
      w.setBall(360, 640, Math.cos(ang) * PHYS.maxBallSpeed, Math.sin(ang) * PHYS.maxBallSpeed);
      for (let i = 0; i < 600 && !w.goalScored; i++) {
        w.step(FIXED_DT);
        expect(w.ball.x).toBeGreaterThan(FELT.x0 - 1);
        expect(w.ball.x).toBeLessThan(FELT.x1 + 1);
        expect(w.ball.y).toBeGreaterThan(FELT.y0 - GOAL_DEPTH - 1);
        expect(w.ball.y).toBeLessThan(FELT.y1 + GOAL_DEPTH + 1);
      }
    }
  });
});

describe('determinism', () => {
  it('two clones given the same shot end in identical states', () => {
    const base = createWorld();
    base.setBall(300, 700);
    const a = base.clone();
    const b = base.clone();
    for (const w of [a, b]) {
      w.ball.vx = 700;
      w.ball.vy = -1100;
    }
    const sa = { world: a, defending: 'red' as const };
    const sb = { world: b, defending: 'red' as const };
    for (let i = 0; i < 900; i++) {
      simulateStep(sa);
      simulateStep(sb);
    }
    expect(a.snapshot()).toEqual(b.snapshot());
  });

  it('clones are independent of the original', () => {
    const base = createWorld();
    base.setBall(300, 700, 500, 500);
    const before = base.snapshot();
    const c = base.clone();
    run(c, 300);
    expect(base.snapshot()).toEqual(before);
    expect(c.snapshot()).not.toEqual(before);
  });
});

describe('rest', () => {
  it('the ball eventually comes to rest', () => {
    const w = createWorld();
    w.setBall(360, 640, 600, -900);
    let steps = 0;
    while (w.ballSpeed() > 0 && steps < 120 * 30) {
      w.step(FIXED_DT);
      steps++;
    }
    expect(w.ballSpeed()).toBe(0);
    expect(steps).toBeLessThan(120 * 15);
  });
});

describe('nudgeClear', () => {
  it('moves a resting ball out of a figure', () => {
    const w = createWorld();
    const f = w.figures[0];
    w.setBall(f.x + 5, f.y + 3);
    expect(w.overlapsFigure()).toBe(true);
    w.nudgeClear();
    expect(w.overlapsFigure()).toBe(false);
  });
});
