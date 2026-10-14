import { describe, expect, it } from 'vitest';
import { CARD, CENTER_X, FIXED_DT, PHYS, SHOT } from '../src/config';
import { Deck, makeModifier, modsForShot } from '../src/game/cards';
import { Match } from '../src/game/match';
import type { Phase } from '../src/game/match';
import { simulateShot } from '../src/game/shotSim';
import { World } from '../src/physics/world';

function runUntil(m: Match, phase: Phase, maxSeconds = 30): void {
  for (let i = 0; i < maxSeconds / FIXED_DT && m.phase !== phase; i++) m.update(FIXED_DT);
  expect(m.phase).toBe(phase);
}

describe('hands and draws', () => {
  it('each team starts with one card', () => {
    const m = new Match({ seed: 1 });
    expect(m.hands.blue).toHaveLength(CARD.startCards);
    expect(m.hands.red).toHaveLength(CARD.startCards);
  });

  it('draws one card every second turn of your own', () => {
    const m = new Match({ seed: 1 });
    runUntil(m, 'Aim'); // blue turn 1: no draw
    expect(m.hands.blue).toHaveLength(1);
    m.fire(0, 200);
    runUntil(m, 'Aim'); // red turn 1
    expect(m.hands.red).toHaveLength(1);
    m.fire(Math.PI, 200);
    runUntil(m, 'Aim'); // blue turn 2: draws
    expect(m.hands.blue).toHaveLength(2);
    expect(m.hands.red).toHaveLength(1);
    m.fire(0, 200);
    runUntil(m, 'Aim'); // red turn 2: draws
    expect(m.hands.red).toHaveLength(2);
  });

  it('caps the hand at the maximum', () => {
    const m = new Match({ seed: 1 });
    for (let i = 0; i < 10; i++) m.drawCard('blue');
    expect(m.hands.blue).toHaveLength(CARD.maxHand);
  });

  it('gives the conceding team a catch-up card', () => {
    const m = new Match({ seed: 1 });
    runUntil(m, 'Aim');
    m.hands.red = [];
    m.world.setRodOffset(7, -140);
    m.world.setBall(CENTER_X, 300);
    m.modifiers.push(makeModifier('freeze', 'blue'));
    m.fire(-Math.PI / 2, 1000);
    runUntil(m, 'Goal');
    expect(m.hands.red).toHaveLength(1);
  });

  it('the seeded deck is deterministic and cycles through every card', () => {
    const a = new Deck(5);
    const b = new Deck(5);
    const drawn = Array.from({ length: 6 }, () => a.draw());
    expect(drawn).toEqual(Array.from({ length: 6 }, () => b.draw()));
    expect(new Set(drawn).size).toBe(6);
  });

  it('arming toggles and only works during Aim; a played card leaves the hand', () => {
    const m = new Match({ seed: 1 });
    expect(m.armCard(0)).toBe(false); // still positioning
    runUntil(m, 'Aim');
    m.hands.blue = ['powerShot'];
    expect(m.armCard(0)).toBe(true);
    expect(m.armedCard()).toBe('powerShot');
    expect(m.armCard(0)).toBe(true);
    expect(m.armedCard()).toBeNull();
    m.armCard(0);
    m.fire(0, 500);
    expect(m.hands.blue).toHaveLength(0);
  });
});

describe('card effects', () => {
  it('Power Shot raises max power', () => {
    const m = new Match({ seed: 1 });
    runUntil(m, 'Aim');
    m.hands.blue = ['powerShot'];
    const before = m.maxPower();
    m.armCard(0);
    expect(m.maxPower()).toBeCloseTo(before * CARD.powerMult, 6);
    expect(m.maxPower()).toBeGreaterThan(SHOT.maxPower * 0.5);
  });

  it('Freeze stops the defending rods tracking', () => {
    const m = new Match({ seed: 1 });
    runUntil(m, 'Aim');
    m.hands.blue = ['freeze'];
    expect(m.trackingTeam()).toBe('red');
    m.armCard(0);
    expect(m.trackingTeam()).toBeNull();
    const rod = m.world.rods[4]; // red MID
    const before = rod.offset;
    m.fire(Math.PI / 2 + 0.6, 900);
    for (let i = 0; i < 60; i++) m.update(FIXED_DT);
    expect(rod.offset).toBe(before);
  });

  it('defenders do move without Freeze', () => {
    const m = new Match({ seed: 1 });
    runUntil(m, 'Aim');
    m.world.setBall(560, 640);
    const before = m.world.rods[4].offset;
    m.fire(-Math.PI / 2, 300);
    for (let i = 0; i < 30; i++) m.update(FIXED_DT);
    expect(m.world.rods[4].offset).not.toBe(before);
  });

  it('Ghost Ball passes through exactly one opposing figure', () => {
    const build = (): World => {
      const w = new World({ ...PHYS, damping: 0, rollDecel: 0, stopSpeed: 0 });
      w.addRod({ team: 'red', role: 'ATK', y: 300, baseXs: [200], minOffset: 0, maxOffset: 0, figureRadius: 22 });
      w.addRod({ team: 'red', role: 'ATK', y: 200, baseXs: [200], minOffset: 0, maxOffset: 0, figureRadius: 22 });
      w.addRod({ team: 'blue', role: 'ATK', y: 400, baseXs: [200], minOffset: 0, maxOffset: 0, figureRadius: 22 });
      w.setBall(200, 340);
      return w;
    };
    const minY = (ghost: boolean): number => {
      let lowest = Infinity;
      const mods = ghost ? [makeModifier('ghostBall', 'blue')] : [];
      simulateShot(build(), { shooter: 'blue', kickerFigure: 2, mods }, -Math.PI / 2, 500, (w) => {
        lowest = Math.min(lowest, w.ball.y);
        return w.time > 1.2;
      });
      return lowest;
    };
    expect(minY(false)).toBeGreaterThan(330); // bounced off the first figure (contact at y=336)
    const g = minY(true);
    expect(g).toBeLessThan(300); // went through the first figure
    expect(g).toBeGreaterThan(230); // but the second one blocked it (contact at y=236)
  });

  it('Iron Wall only applies to the opponent next shot, then expires', () => {
    const m = new Match({ seed: 1 });
    runUntil(m, 'Aim');
    m.hands.blue = ['ironWall'];
    const gk = m.world.figures[m.world.rods[0].figureIds[0]];
    m.armCard(0);
    m.fire(0, 200); // blue shot: keeper unaffected
    expect(gk.r).toBe(gk.baseR);
    expect(m.modifiers.map((x) => x.card)).toEqual(['ironWall']);
    runUntil(m, 'Aim'); // red to shoot
    expect(m.active).toBe('red');
    expect(modsForShot(m.modifiers, 'red')).toHaveLength(1);
    m.world.setBall(CENTER_X, 640);
    m.fire(Math.PI, 200);
    expect(gk.r).toBe(gk.baseR * CARD.keeperScale);
    expect(m.modifiers).toHaveLength(0);
    runUntil(m, 'Aim');
    expect(gk.r).toBe(gk.baseR);
  });

  it('Banana Kick curves the ball', () => {
    const m = new Match({ seed: 1 });
    runUntil(m, 'Aim');
    const straight = simulateShot(m.world, m.buildContext(), -Math.PI / 2, 800);
    const curved = simulateShot(m.world, m.buildContext(makeModifier('banana', 'blue', 1)), -Math.PI / 2, 800);
    expect(Math.abs(curved.world.ball.x - straight.world.ball.x)).toBeGreaterThan(20);
  });

  it('simulateShot is deterministic with modifiers', () => {
    const m = new Match({ seed: 1 });
    runUntil(m, 'Aim');
    const ctx = m.buildContext(makeModifier('banana', 'blue', -1));
    const a = simulateShot(m.world, ctx, -1.2, 900);
    const b = simulateShot(m.world, ctx, -1.2, 900);
    expect(a.world.snapshot()).toEqual(b.world.snapshot());
  });
});
