import { REACH } from '../config';
import type { Team } from '../config';
import type { World } from '../physics/world';
import { clamp } from '../physics/vec';

export interface KickerSelection {
  rodIndex: number;
  figureIndex: number; // index into world.figures
  slot: number; // index on the rod
  targetOffset: number; // rod offset that brings the figure closest to the ball
  distance: number; // figure-to-ball distance once the rod has slid there
}

/** Distance-based power multiplier: 1.0 when near, falling linearly to REACH.minMult at REACH.max. */
export function reachMultiplier(distance: number): number {
  if (distance <= REACH.near) return 1;
  if (distance >= REACH.max) return REACH.minMult;
  const t = (distance - REACH.near) / (REACH.max - REACH.near);
  return 1 + (REACH.minMult - 1) * t;
}

/**
 * The figure of `team` that gets closest to `ballPos` once its rod slides.
 * Ties are broken by the shortest slide, then by lowest figure index.
 */
export function selectKicker(world: World, team: Team, ballPos: { x: number; y: number }): KickerSelection {
  let best: KickerSelection | null = null;
  let bestMove = Infinity;
  for (const rod of world.rods) {
    if (rod.team !== team) continue;
    for (let slot = 0; slot < rod.baseXs.length; slot++) {
      const target = clamp(ballPos.x - rod.baseXs[slot], rod.minOffset, rod.maxOffset);
      const fx = rod.baseXs[slot] + target;
      const distance = Math.hypot(fx - ballPos.x, rod.y - ballPos.y);
      const move = Math.abs(target - rod.offset);
      if (!best || distance < best.distance - 1e-6 || (Math.abs(distance - best.distance) <= 1e-6 && move < bestMove)) {
        best = { rodIndex: rod.index, figureIndex: rod.figureIds[slot], slot, targetOffset: target, distance };
        bestMove = move;
      }
    }
  }
  if (!best) throw new Error(`no rods for team ${team}`);
  return best;
}
