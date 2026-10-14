// The single shared "take a shot and run it to rest" code path. Both the real Match and
// everything that simulates ahead (aim preview, AI bot) go through these functions.
import { FLOW } from '../config';
import type { Team } from '../config';
import type { World, WorldEvent } from '../physics/world';
import type { Modifier } from './cards';
import { simulateStep } from './defense';
import { opponent } from './table';

export interface ShotContext {
  shooter: Team;
  kickerFigure: number; // index into world.figures
  /** Modifiers already filtered to this shot (see modsForShot). */
  mods: Modifier[];
}

export interface FlightState {
  time: number;
}

export type FlightOutcome = 'flying' | 'goal' | 'settled';

export interface FlightStepResult {
  events: WorldEvent[];
  outcome: FlightOutcome;
  goal: Team | null;
}

/** Team whose rods track the ball during this shot, or null when frozen. */
export function trackingTeamFor(ctx: ShotContext): Team | null {
  return ctx.mods.some((m) => m.freezeDefense) ? null : opponent(ctx.shooter);
}

/** Applies the shot to the world: ghosts the kicker, sets modifier effects, gives the ball its velocity. */
export function launchShot(world: World, ctx: ShotContext, angle: number, power: number): void {
  world.figures[ctx.kickerFigure].ghost = true;
  world.ballCurve = 0;
  world.ghostBallFor = null;
  for (const m of ctx.mods) {
    if (m.curve) world.ballCurve += m.curve;
    if (m.ghostFirstFigure) world.ghostBallFor = ctx.shooter;
    if (m.keeperScale) {
      for (const f of world.figures) {
        if (f.team === m.owner && world.rods[f.rod].role === 'GK') {
          f.r = f.baseR * m.keeperScale;
          const dx = world.ball.x - f.x;
          const dy = world.ball.y - f.y;
          const md = world.ball.r + f.r;
          if (dx * dx + dy * dy < md * md) f.ghost = true; // do not swallow a ball that is already close
        }
      }
    }
  }
  world.ball.vx = Math.cos(angle) * power;
  world.ball.vy = Math.sin(angle) * power;
  world.extraDamping = 0;
}

/** Clears per-shot effects (curve, ghost ball, enlarged keepers). */
export function finishShot(world: World): void {
  world.ballCurve = 0;
  world.ghostBallFor = null;
  for (const f of world.figures) f.r = f.baseR;
}

/** One fixed step of flight: defense tracking + physics + the turn-end rules. */
export function stepFlight(world: World, ctx: ShotContext, fs: FlightState, dt: number): FlightStepResult {
  const events = simulateStep({ world, defending: trackingTeamFor(ctx) }, dt);
  fs.time += dt;
  for (const e of events) {
    if (e.type === 'goal') return { events, outcome: 'goal', goal: e.team };
  }
  if (fs.time > FLOW.extraDampAfter) world.extraDamping = FLOW.extraDamping;
  if (fs.time >= FLOW.hardCap) world.stopBall();
  if (world.ballSpeed() < FLOW.settleSpeed) {
    world.stopBall();
    return { events, outcome: 'settled', goal: null };
  }
  return { events, outcome: 'flying', goal: null };
}

export interface ShotResult {
  world: World; // the simulated clone at the end of the shot
  goal: Team | null;
  time: number;
}

/**
 * Simulates a full shot on a clone of `base` until it settles, scores or hits the hard cap.
 * `onStep` may return true to stop early (used by the aim preview).
 */
export function simulateShot(
  base: World,
  ctx: ShotContext,
  angle: number,
  power: number,
  onStep?: (world: World, events: WorldEvent[]) => boolean | void,
  dt: number = 1 / 120,
): ShotResult {
  const world = base.clone();
  launchShot(world, ctx, angle, power);
  const fs: FlightState = { time: 0 };
  let goal: Team | null = null;
  const maxSteps = Math.ceil((FLOW.hardCap + 1) / dt);
  for (let i = 0; i < maxSteps; i++) {
    const r = stepFlight(world, ctx, fs, dt);
    if (r.outcome === 'goal') {
      goal = r.goal;
      break;
    }
    if (onStep && onStep(world, r.events) === true) break;
    if (r.outcome === 'settled') break;
  }
  finishShot(world);
  return { world, goal, time: fs.time };
}
