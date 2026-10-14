// Cards (power-ups) and the Modifier data they turn into. Modifiers are plain data so they can be
// copied freely; the physics-affecting parts are applied inside the deterministic shot sim
// (see shotSim.ts), which keeps the aim preview and the AI exact.
import { CARD } from '../config';
import type { Team } from '../config';
import { mulberry32 } from '../rng';

export type CardId = 'powerShot' | 'banana' | 'ghostBall' | 'ironWall' | 'freeze' | 'longSight';

export const ALL_CARDS: readonly CardId[] = ['powerShot', 'banana', 'ghostBall', 'ironWall', 'freeze', 'longSight'];

export interface CardDef {
  name: string;
  icon: string;
  text: string;
}

export const CARD_DEFS: Record<CardId, CardDef> = {
  powerShot: { name: 'Power Shot', icon: '⚡', text: 'Max power x1.5, fire trail' },
  banana: { name: 'Banana Kick', icon: '🍌', text: 'Ball curves left or right' },
  ghostBall: { name: 'Ghost Ball', icon: '👻', text: 'Passes through 1st rival' },
  ironWall: { name: 'Iron Wall', icon: '🛡', text: 'Your keeper x2 wide next shot' },
  freeze: { name: 'Freeze', icon: '❄', text: 'Rival rods will not track' },
  longSight: { name: 'Long Sight', icon: '🔭', text: 'Full bouncing preview' },
};

/** Effect data. `target` says whose shot is affected: the owner's own shot or the opponent's next shot. */
export interface Modifier {
  id: string;
  card?: CardId;
  owner: Team;
  target: 'own' | 'opponent';
  maxPowerMult?: number;
  /** Ball curve in rad/s (sign = direction). */
  curve?: number;
  ghostFirstFigure?: boolean;
  freezeDefense?: boolean;
  /** Radius multiplier for the owner's goalkeeper while the affected shot is in flight. */
  keeperScale?: number;
  longSight?: boolean;
  trail?: boolean;
}

export function makeModifier(card: CardId, owner: Team, curveDir: -1 | 1 = 1): Modifier {
  const base = { id: card, card, owner };
  switch (card) {
    case 'powerShot':
      return { ...base, target: 'own', maxPowerMult: CARD.powerMult, trail: true };
    case 'banana':
      return { ...base, target: 'own', curve: curveDir * CARD.curveRate };
    case 'ghostBall':
      return { ...base, target: 'own', ghostFirstFigure: true };
    case 'ironWall':
      return { ...base, target: 'opponent', keeperScale: CARD.keeperScale };
    case 'freeze':
      return { ...base, target: 'own', freezeDefense: true };
    case 'longSight':
      return { ...base, target: 'own', longSight: true };
  }
}

/** Modifiers that affect a shot taken by `shooter`. */
export function modsForShot(mods: readonly Modifier[], shooter: Team): Modifier[] {
  return mods.filter((m) => (m.target === 'own') === (m.owner === shooter));
}

export function powerMultiplier(mods: readonly Modifier[]): number {
  let p = 1;
  for (const m of mods) if (m.maxPowerMult) p *= m.maxPowerMult;
  return p;
}

/** Seeded shuffle-bag deck: every card appears once per bag, in a seeded random order. */
export class Deck {
  private rng: () => number;
  private bag: CardId[] = [];

  constructor(seed: number) {
    this.rng = mulberry32(seed);
  }

  draw(): CardId {
    if (this.bag.length === 0) {
      const b = ALL_CARDS.slice();
      for (let i = b.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [b[i], b[j]] = [b[j], b[i]];
      }
      this.bag = b;
    }
    return this.bag.pop() as CardId;
  }
}
