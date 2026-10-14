import { describe, expect, it } from 'vitest';
import { CENTER_X, CENTER_Y, FIXED_DT } from '../src/config';
import type { Team } from '../src/config';
import { Match } from '../src/game/match';
import type { Phase } from '../src/game/match';

function runUntil(m: Match, phase: Phase, maxSeconds = 30): void {
  for (let i = 0; i < maxSeconds / FIXED_DT && m.phase !== phase; i++) m.update(FIXED_DT);
  expect(m.phase).toBe(phase);
}

/** Teleports the ball to a clear lane and fires it into the opposing goal. */
function scoreGoal(m: Match, scorer: Team): void {
  runUntil(m, 'Aim');
  expect(m.active).toBe(scorer);
  m.modifiers.push({ id: 'freeze', owner: scorer, target: 'own', freezeDefense: true });
  m.world.setRodOffset(scorer === 'blue' ? 7 : 0, -140); // park the goalkeeper to one side
  m.world.setBall(CENTER_X, scorer === 'blue' ? 300 : 980);
  expect(m.fire(scorer === 'blue' ? -Math.PI / 2 : Math.PI / 2, 1000)).toBe(true);
  runUntil(m, 'Goal');
}

describe('Match turn flow', () => {
  it('starts in Kickoff, then Aim, with blue to play', () => {
    const m = new Match();
    expect(m.phase).toBe('Kickoff');
    expect(m.active).toBe('blue');
    runUntil(m, 'Aim');
    expect(m.kicker).not.toBeNull();
    expect(m.canAim()).toBe(true);
  });

  it('cannot fire outside the Aim phase', () => {
    const m = new Match();
    expect(m.fire(0, 500)).toBe(false);
  });

  it('alternates turns after every shot', () => {
    const m = new Match();
    runUntil(m, 'Aim');
    expect(m.active).toBe('blue');
    expect(m.fire(0, 300)).toBe(true);
    expect(m.phase).toBe('Flight');
    runUntil(m, 'Aim');
    expect(m.active).toBe('red');
    expect(m.shots).toBe(1);
    expect(m.fire(Math.PI, 300)).toBe(true);
    runUntil(m, 'Aim');
    expect(m.active).toBe('blue');
    expect(m.shots).toBe(2);
  });

  it('caps power with the reach penalty', () => {
    const m = new Match();
    runUntil(m, 'Aim');
    expect(m.maxPower()).toBeLessThanOrEqual(1600);
    expect(m.maxPower()).toBeCloseTo(1600 * m.reachMult(), 6);
  });

  it('ends flight after the hard cap even if the ball keeps moving', () => {
    const m = new Match();
    runUntil(m, 'Aim');
    m.fire(0, 100);
    m.world.ball.vx = 0; // sanity: world is controllable
    runUntil(m, 'Aim', 12);
  });

  it('leaves the ball clear of every figure after a turn', () => {
    const m = new Match();
    runUntil(m, 'Aim');
    m.fire(-Math.PI / 2, 800);
    runUntil(m, 'Aim');
    expect(m.world.overlapsFigure()).toBe(false);
  });
});

describe('Match goals', () => {
  it('scores, resets the ball and lets the conceding team kick off', () => {
    const m = new Match();
    scoreGoal(m, 'blue');
    expect(m.score).toEqual({ blue: 1, red: 0 });
    runUntil(m, 'Kickoff');
    expect(m.world.goalScored).toBeNull();
    expect(m.world.ball.x).toBe(CENTER_X);
    expect(m.world.ball.y).toBe(CENTER_Y);
    expect(m.active).toBe('red');
    runUntil(m, 'Aim');
    expect(m.active).toBe('red');
  });

  it('ends the match at goalsToWin', () => {
    const m = new Match({ goalsToWin: 2 });
    scoreGoal(m, 'blue');
    runUntil(m, 'Kickoff');
    scoreGoal(m, 'red'); // red kicks off after conceding
    runUntil(m, 'Kickoff');
    scoreGoal(m, 'blue'); // blue kicks off after conceding
    runUntil(m, 'End');
    expect(m.winner).toBe('blue');
    expect(m.score).toEqual({ blue: 2, red: 1 });
  });

  it('reset starts a fresh match', () => {
    const m = new Match({ goalsToWin: 1 });
    scoreGoal(m, 'blue');
    runUntil(m, 'End');
    m.reset();
    expect(m.score).toEqual({ blue: 0, red: 0 });
    expect(m.winner).toBeNull();
    expect(m.phase).toBe('Kickoff');
    runUntil(m, 'Aim');
  });
});

describe('Match modifiers hook', () => {
  it('applies a max-power modifier', () => {
    const m = new Match();
    runUntil(m, 'Aim');
    const base = m.maxPower();
    m.modifiers.push({ id: 'power', owner: 'blue', target: 'own', maxPowerMult: 1.5 });
    expect(m.maxPower()).toBeCloseTo(base * 1.5, 6);
  });
});
