import { describe, expect, it } from 'vitest';
import { Bot } from '../src/ai/bot';
import { FIXED_DT } from '../src/config';
import { Match } from '../src/game/match';
import { simulateShot } from '../src/game/shotSim';

function aimMatch(): Match {
  const m = new Match({ seed: 7 });
  for (let i = 0; i < 20 / FIXED_DT && m.phase !== 'Aim'; i++) m.update(FIXED_DT);
  expect(m.phase).toBe('Aim');
  m.hands.blue = [];
  m.hands.red = [];
  return m;
}

describe('Bot', () => {
  it('hard difficulty scores against an open net', () => {
    const m = aimMatch();
    m.world.setRodOffset(7, -140); // red keeper out of the way
    m.world.setBall(360, 300);
    const d = new Bot(m, 'hard', 1).runAll();
    const res = simulateShot(m.world, m.buildContext(), d.angle, d.power);
    expect(res.goal).toBe('blue');
    expect(d.score).toBeGreaterThan(900);
  });

  it('never chooses an own goal when it has an alternative', () => {
    const m = aimMatch();
    m.world.setRodOffset(0, -140); // own net wide open
    m.world.setBall(360, 1000);
    for (const diff of ['easy', 'medium'] as const) {
      const d = new Bot(m, diff, 3).runAll();
      const res = simulateShot(m.world, m.buildContext(), d.angle, d.power);
      expect(res.goal).not.toBe('red');
    }
  });

  it('is deterministic for a given seed', () => {
    const a = new Bot(aimMatch(), 'medium', 42).runAll();
    const b = new Bot(aimMatch(), 'medium', 42).runAll();
    expect(a).toEqual(b);
  });

  it('spreads work across calls', () => {
    const bot = new Bot(aimMatch(), 'easy', 5);
    let calls = 0;
    while (!bot.work(0)) calls++;
    expect(calls).toBeGreaterThan(10);
    expect(bot.decision).not.toBeNull();
  });

  it('can evaluate cards in hand', () => {
    const m = aimMatch();
    m.hands.blue = ['powerShot', 'freeze'];
    const d = new Bot(m, 'medium', 9).runAll();
    expect(d.cardIndex === null || d.cardIndex < 2).toBe(true);
  });
});
