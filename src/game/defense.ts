import { DEFENSE, FIXED_DT } from '../config';
import type { Team } from '../config';
import type { Rod, World, WorldEvent } from '../physics/world';
import { clamp } from '../physics/vec';

/** Offset for `rod` that aligns its nearest-reachable figure with x (shortest slide wins ties). */
export function trackingOffset(rod: Rod, x: number): number {
  let bestErr = Infinity;
  let bestMove = Infinity;
  let best = rod.offset;
  for (let slot = 0; slot < rod.baseXs.length; slot++) {
    const target = clamp(x - rod.baseXs[slot], rod.minOffset, rod.maxOffset);
    const err = Math.abs(rod.baseXs[slot] + target - x);
    const move = Math.abs(target - rod.offset);
    if (err < bestErr - 1 || (Math.abs(err - bestErr) <= 1 && move < bestMove)) {
      bestErr = err;
      bestMove = move;
      best = target;
    }
  }
  return best;
}

/** Points the defending team's rods at the ball x. Attacking rods are left alone. */
export function applyDefense(world: World, defending: Team): void {
  for (const rod of world.rods) {
    if (rod.team !== defending) continue;
    world.slideRodTo(rod.index, trackingOffset(rod, world.ball.x), rod.role === 'GK' ? DEFENSE.gkSpeed : DEFENSE.speed);
  }
}

export interface SimState {
  world: World;
  /** Team whose rods track the ball this step, or null for no tracking (aim, kickoff, frozen). */
  defending: Team | null;
}

/**
 * The one deterministic step used by the scene, the aim preview and (later) the AI:
 * defense tracking followed by world.step.
 */
export function simulateStep(state: SimState, dt: number = FIXED_DT): WorldEvent[] {
  if (state.defending) applyDefense(state.world, state.defending);
  return state.world.step(dt);
}
