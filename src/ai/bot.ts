// AI bot: searches candidate shots on clones of the real world, using the exact same shot
// simulation as the match, and picks the best-scoring one. The search is a generator so the
// scene can spread it across frames with a time budget.
import { FELT, FELT_H, CENTER_X } from '../config';
import type { Team } from '../config';
import { makeModifier, modsForShot, powerMultiplier } from '../game/cards';
import type { CardId } from '../game/cards';
import { reachMultiplier, selectKicker } from '../game/kicker';
import type { Match } from '../game/match';
import { simulateShot } from '../game/shotSim';
import type { ShotContext, ShotResult } from '../game/shotSim';
import { opponent } from '../game/table';
import { SHOT } from '../config';
import { mulberry32 } from '../rng';

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface DifficultyParams {
  angles: number;
  powers: number;
  cardAngles: number; // coarse grid used to evaluate cards
  noiseDeg: number;
  powerNoise: number; // fraction
  cards: 'random' | 'sim';
  cardMargin: number; // score a card must add to be played
}

export const DIFFICULTY: Record<Difficulty, DifficultyParams> = {
  easy: { angles: 24, powers: 2, cardAngles: 0, noiseDeg: 8, powerNoise: 0.1, cards: 'random', cardMargin: 0 },
  medium: { angles: 48, powers: 3, cardAngles: 24, noiseDeg: 3, powerNoise: 0.04, cards: 'sim', cardMargin: 60 },
  hard: { angles: 72, powers: 4, cardAngles: 36, noiseDeg: 1, powerNoise: 0.02, cards: 'sim', cardMargin: 40 },
};

export interface BotDecision {
  angle: number; // radians (shot direction)
  power: number;
  /** Index into the bot's hand of the card to arm, or null. */
  cardIndex: number | null;
  curveDir: -1 | 1;
  score: number;
}

const GOAL_SCORE = 1000;

/** Higher is better for `team`. */
export function scoreResult(res: ShotResult, team: Team): number {
  if (res.goal) return res.goal === team ? GOAL_SCORE - res.time : -GOAL_SCORE;
  const b = res.world.ball;
  const progress = Math.min(1, Math.max(0, team === 'blue' ? (FELT.y1 - b.y) / FELT_H : (b.y - FELT.y0) / FELT_H));
  let s = progress * 100;
  // lining the ball up with the goal mouth when far up the pitch
  s += 30 * progress * Math.max(0, 1 - Math.abs(b.x - CENTER_X) / 300);
  // dangerous counter: the opponent kicker can get close to the ball while it sits near our own goal
  const k = selectKicker(res.world, opponent(team), b);
  const reach = reachMultiplier(k.distance);
  const ownness = Math.max(0, (1 - progress - 0.4) / 0.6);
  s -= 140 * reach * ownness;
  return s;
}

export class Bot {
  readonly params: DifficultyParams;
  decision: BotDecision | null = null;
  done = false;
  simulations = 0;
  private gen: Generator<void, BotDecision, void>;
  private rng: () => number;

  constructor(private match: Match, difficulty: Difficulty, seed: number) {
    this.params = DIFFICULTY[difficulty];
    this.rng = mulberry32(seed);
    this.gen = this.search();
  }

  /** Runs the search for roughly `budgetMs`. Returns true once the decision is ready. */
  work(budgetMs: number): boolean {
    if (this.done) return true;
    const t0 = performance.now();
    do {
      const r = this.gen.next();
      if (r.done) {
        this.decision = r.value;
        this.done = true;
        return true;
      }
    } while (performance.now() - t0 < budgetMs);
    return false;
  }

  /** Runs the whole search synchronously (tests). */
  runAll(): BotDecision {
    while (!this.work(1e9)) {
      /* keep going */
    }
    return this.decision!;
  }

  private maxPowerFor(ctx: ShotContext): number {
    return SHOT.maxPower * this.match.reachMult() * powerMultiplier(ctx.mods);
  }

  private powerLevels(max: number, n: number): number[] {
    if (n <= 1) return [max];
    const out: number[] = [];
    for (let i = 0; i < n; i++) out.push(max * (0.4 + (0.6 * i) / (n - 1)));
    return out;
  }

  private *bestOnGrid(
    ctx: ShotContext,
    team: Team,
    angles: number,
    powers: number,
  ): Generator<void, { angle: number; power: number; score: number }, void> {
    const levels = this.powerLevels(this.maxPowerFor(ctx), powers);
    let best = { angle: 0, power: levels[levels.length - 1], score: -Infinity };
    for (let a = 0; a < angles; a++) {
      const angle = (a / angles) * Math.PI * 2;
      for (const power of levels) {
        const res = simulateShot(this.match.world, ctx, angle, power);
        this.simulations++;
        const score = scoreResult(res, team);
        if (score > best.score) best = { angle, power, score };
        yield;
      }
    }
    return best;
  }

  private *search(): Generator<void, BotDecision, void> {
    const m = this.match;
    const team = m.active;
    const p = this.params;
    const hand = m.hands[team];

    // 1. best shot without playing a card (uses whatever is already armed/pending)
    const baseCtx = m.buildContext();
    const base = yield* this.bestOnGrid(baseCtx, team, p.angles, p.powers);
    let choice: BotDecision = { angle: base.angle, power: base.power, cardIndex: m.armedIndex, curveDir: m.curveDir, score: base.score };

    // 2. consider playing a card
    if (m.armedIndex === null && hand.length > 0) {
      if (p.cards === 'random') {
        if (this.rng() < 0.25) {
          const idx = Math.floor(this.rng() * hand.length);
          choice = { ...choice, cardIndex: idx, curveDir: this.rng() < 0.5 ? -1 : 1 };
        }
      } else {
        let bestCard = base.score + p.cardMargin;
        for (let i = 0; i < hand.length; i++) {
          const card = hand[i];
          if (card === 'longSight') continue; // purely visual
          if (card === 'ironWall') {
            // defensive: worth it when there is no real attacking chance and the ball is on our side
            const b = m.world.ball;
            const progress = team === 'blue' ? (FELT.y1 - b.y) / FELT_H : (b.y - FELT.y0) / FELT_H;
            if (base.score < 60 && progress < 0.5 && choice.cardIndex === null) {
              choice = { ...choice, cardIndex: i, score: base.score };
            }
            continue;
          }
          const dirs: (-1 | 1)[] = card === 'banana' ? [-1, 1] : [1];
          for (const dir of dirs) {
            const ctx: ShotContext = {
              shooter: team,
              kickerFigure: baseCtx.kickerFigure,
              mods: modsForShot([...baseCtx.mods, makeModifier(card as CardId, team, dir)], team),
            };
            const r = yield* this.bestOnGrid(ctx, team, p.cardAngles, 2);
            if (r.score > bestCard) {
              bestCard = r.score;
              choice = { angle: r.angle, power: r.power, cardIndex: i, curveDir: dir, score: r.score };
            }
          }
        }
      }
    }

    // 3. apply difficulty noise, but never turn a decent shot into an own goal
    const noisyAngle = choice.angle + (this.rng() * 2 - 1) * ((p.noiseDeg * Math.PI) / 180);
    const noisyPower = choice.power * (1 + (this.rng() * 2 - 1) * p.powerNoise);
    const mods: ShotContext['mods'] =
      choice.cardIndex !== null && choice.cardIndex !== m.armedIndex
        ? modsForShot([...baseCtx.mods, makeModifier(hand[choice.cardIndex], team, choice.curveDir)], team)
        : baseCtx.mods;
    const ctx: ShotContext = { shooter: team, kickerFigure: baseCtx.kickerFigure, mods };
    const maxP = this.maxPowerFor(ctx);
    const power = Math.min(noisyPower, maxP);
    const check = simulateShot(m.world, ctx, noisyAngle, power);
    this.simulations++;
    yield;
    if (check.goal && check.goal !== team) return choice; // noise would give away an own goal
    if (!check.goal && choice.score >= GOAL_SCORE - 100) return choice; // keep a scoring shot exact
    return { ...choice, angle: noisyAngle, power };
  }
}
