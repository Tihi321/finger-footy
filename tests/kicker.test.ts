import { describe, expect, it } from 'vitest';
import { REACH, SHOT } from '../src/config';
import { selectKicker, reachMultiplier } from '../src/game/kicker';
import { dragToShot } from '../src/game/shot';
import { createWorld } from '../src/game/table';

describe('selectKicker', () => {
  it('picks the nearest rod and figure', () => {
    const w = createWorld();
    const k = selectKicker(w, 'blue', { x: 360, y: 640 });
    expect(k.rodIndex).toBe(3); // blue MID, 60px below the ball
    expect(k.figureIndex).toBe(w.rods[3].figureIds[2]); // centre figure
    expect(k.targetOffset).toBeCloseTo(0, 6);
    expect(k.distance).toBeCloseTo(60, 6);
  });

  it('works for red', () => {
    const w = createWorld();
    const k = selectKicker(w, 'red', { x: 360, y: 640 });
    expect(k.rodIndex).toBe(4); // red MID
    expect(w.rods[k.rodIndex].team).toBe('red');
  });

  it('slides a figure sideways to line up with the ball', () => {
    const w = createWorld();
    const k = selectKicker(w, 'blue', { x: 450, y: 700 });
    expect(k.rodIndex).toBe(3);
    const rod = w.rods[3];
    expect(rod.baseXs[k.slot] + k.targetOffset).toBeCloseTo(450, 6);
    expect(k.distance).toBeCloseTo(0, 6);
  });

  it('clamps the target offset to the rod range', () => {
    const w = createWorld();
    const k = selectKicker(w, 'blue', { x: 74, y: 1060 });
    expect(k.rodIndex).toBe(1); // DEF can reach further than the GK
    expect(k.targetOffset).toBe(w.rods[1].minOffset);
    expect(k.targetOffset).toBeGreaterThanOrEqual(w.rods[1].minOffset);
  });

  it('never returns a figure of the other team', () => {
    const w = createWorld();
    for (let x = 80; x < 660; x += 40) {
      for (let y = 140; y < 1160; y += 90) {
        for (const team of ['blue', 'red'] as const) {
          const k = selectKicker(w, team, { x, y });
          expect(w.figures[k.figureIndex].team).toBe(team);
          const rod = w.rods[k.rodIndex];
          expect(k.targetOffset).toBeGreaterThanOrEqual(rod.minOffset);
          expect(k.targetOffset).toBeLessThanOrEqual(rod.maxOffset);
        }
      }
    }
  });
});

describe('rod geometry', () => {
  it('figures together can cover the full felt width', () => {
    const w = createWorld();
    for (const rod of w.rods) {
      if (rod.role === 'GK') continue;
      const lo = rod.baseXs[0] + rod.minOffset;
      const hi = rod.baseXs[rod.baseXs.length - 1] + rod.maxOffset;
      expect(lo).toBeCloseTo(60 + 22, 6);
      expect(hi).toBeCloseTo(660 - 22, 6);
    }
  });

  it('setRodOffset clamps and moves every figure', () => {
    const w = createWorld();
    const rod = w.rods[3];
    const applied = w.setRodOffset(3, 9999);
    expect(applied).toBe(rod.maxOffset);
    rod.figureIds.forEach((id, i) => expect(w.figures[id].x).toBeCloseTo(rod.baseXs[i] + rod.maxOffset, 6));
  });
});

describe('reachMultiplier', () => {
  it('hits its endpoints', () => {
    expect(reachMultiplier(0)).toBe(1);
    expect(reachMultiplier(REACH.near)).toBe(1);
    expect(reachMultiplier(REACH.max)).toBe(REACH.minMult);
    expect(reachMultiplier(1000)).toBe(REACH.minMult);
  });
  it('is linear in between', () => {
    expect(reachMultiplier((REACH.near + REACH.max) / 2)).toBeCloseTo(0.75, 6);
  });
});

describe('dragToShot', () => {
  it('shoots opposite to the drag', () => {
    const s = dragToShot({ x: 100, y: 100 }, { x: 100, y: 200 }, 1000, 1);
    expect(s.valid).toBe(true);
    expect(s.angle).toBeCloseTo(-Math.PI / 2, 6);
    const r = dragToShot({ x: 100, y: 100 }, { x: 50, y: 100 }, 1000, 1);
    expect(Math.cos(r.angle)).toBeCloseTo(1, 6);
  });
  it('clamps the drag and applies the reach multiplier', () => {
    const s = dragToShot({ x: 0, y: 0 }, { x: 0, y: 5000 }, 1000, 0.5);
    expect(s.dragLength).toBe(SHOT.maxDrag);
    expect(s.power).toBeCloseTo(500, 6);
  });
  it('is invalid below the minimum drag', () => {
    expect(dragToShot({ x: 0, y: 0 }, { x: SHOT.minDrag - 1, y: 0 }, 1000, 1).valid).toBe(false);
  });
});
