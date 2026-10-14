// Pure TS match state machine. No Phaser.
import { CARD, CENTER_X, CENTER_Y, FIXED_DT, FLOW, SHOT } from '../config';
import type { Team } from '../config';
import type { World, WorldEvent } from '../physics/world';
import { Deck, makeModifier, modsForShot, powerMultiplier } from './cards';
import type { CardId, Modifier } from './cards';
import { simulateStep } from './defense';
import type { SimState } from './defense';
import { reachMultiplier, selectKicker } from './kicker';
import type { KickerSelection } from './kicker';
import { finishShot, launchShot, stepFlight } from './shotSim';
import type { FlightState, ShotContext } from './shotSim';
import { createWorld, opponent } from './table';

export type { Modifier } from './cards';
export type Phase = 'Kickoff' | 'Aim' | 'Flight' | 'Settle' | 'Goal' | 'NextTurn' | 'End';

/** A turn can be driven by a human (touch input) or by the bot. */
export interface TurnController {
  kind: 'human' | 'bot';
}

export interface MatchOptions {
  goalsToWin?: number;
  world?: World;
  firstTeam?: Team;
  /** Seed for the card deck. */
  seed?: number;
}

export class Match {
  readonly world: World;
  readonly sim: SimState;
  phase: Phase = 'Kickoff';
  score: Record<Team, number> = { blue: 0, red: 0 };
  active: Team;
  goalsToWin: number;
  winner: Team | null = null;
  lastScorer: Team | null = null;
  kicker: KickerSelection | null = null;
  /** Pending modifiers (e.g. Iron Wall waiting for the opponent's shot). */
  modifiers: Modifier[] = [];
  /** Modifiers that applied to the shot currently in flight. */
  shotMods: Modifier[] = [];
  controllers: Record<Team, TurnController> = { blue: { kind: 'human' }, red: { kind: 'human' } };
  hands: Record<Team, CardId[]> = { blue: [], red: [] };
  turnsStarted: Record<Team, number> = { blue: 0, red: 0 };
  /** Index into the active hand of the card armed for this shot, or null. */
  armedIndex: number | null = null;
  curveDir: -1 | 1 = 1;
  flightTime = 0;
  shots = 0;
  private deck: Deck;
  private flight: { ctx: ShotContext; fs: FlightState } | null = null;
  private timer = 0;
  private readonly firstTeam: Team;
  private readonly seed: number;

  constructor(opts: MatchOptions = {}) {
    this.world = opts.world ?? createWorld();
    this.sim = { world: this.world, defending: null };
    this.goalsToWin = opts.goalsToWin ?? FLOW.goalsToWin;
    this.firstTeam = opts.firstTeam ?? 'blue';
    this.seed = opts.seed ?? 20240607;
    this.deck = new Deck(this.seed);
    this.active = this.firstTeam;
    this.dealStartingCards();
    this.beginTurn('Kickoff');
  }

  private dealStartingCards(): void {
    this.hands = { blue: [], red: [] };
    for (let i = 0; i < CARD.startCards; i++) {
      this.hands.blue.push(this.deck.draw());
      this.hands.red.push(this.deck.draw());
    }
  }

  /** Full restart (Play again). */
  reset(): void {
    this.score = { blue: 0, red: 0 };
    this.winner = null;
    this.lastScorer = null;
    this.shots = 0;
    this.modifiers = [];
    this.shotMods = [];
    this.flight = null;
    this.turnsStarted = { blue: 0, red: 0 };
    this.deck = new Deck(this.seed);
    this.dealStartingCards();
    this.active = this.firstTeam;
    this.world.resetBall(CENTER_X, CENTER_Y);
    finishShot(this.world);
    for (const rod of this.world.rods) this.world.setRodOffset(rod.index, 0);
    for (const f of this.world.figures) f.ghost = false;
    this.beginTurn('Kickoff');
  }

  get activeController(): TurnController {
    return this.controllers[this.active];
  }

  get defending(): Team {
    return opponent(this.active);
  }

  // ----------------------------------------------------------------- cards

  /** Draws a card for a team; silently discarded when the hand is full. */
  drawCard(team: Team): CardId | null {
    const c = this.deck.draw();
    if (this.hands[team].length >= CARD.maxHand) return null;
    this.hands[team].push(c);
    return c;
  }

  /** Arms (or disarms, when already armed) the card at `index` in the active hand. Only during Aim. */
  armCard(index: number): boolean {
    if (this.phase !== 'Aim' || index < 0 || index >= this.hands[this.active].length) return false;
    this.armedIndex = this.armedIndex === index ? null : index;
    return true;
  }

  armedCard(): CardId | null {
    return this.armedIndex === null ? null : (this.hands[this.active][this.armedIndex] ?? null);
  }

  setCurveDir(dir: -1 | 1): void {
    this.curveDir = dir;
  }

  private armedModifier(): Modifier | null {
    const c = this.armedCard();
    return c ? makeModifier(c, this.active, this.curveDir) : null;
  }

  /** Every modifier that would apply to the upcoming shot, including the armed card. */
  upcomingMods(): Modifier[] {
    const armed = this.armedModifier();
    return modsForShot(armed ? [...this.modifiers, armed] : this.modifiers, this.active);
  }

  /** Context for simulating the upcoming shot (preview, AI). `extra` can add a hypothetical card. */
  buildContext(extra?: Modifier): ShotContext {
    if (!this.kicker) throw new Error('no kicker selected');
    const armed = this.armedModifier();
    const all = [...this.modifiers];
    if (armed) all.push(armed);
    if (extra) all.push(extra);
    return { shooter: this.active, kickerFigure: this.kicker.figureIndex, mods: modsForShot(all, this.active) };
  }

  // ----------------------------------------------------------------- power

  /** Maximum shot power for the current turn (reach penalty and modifiers applied). */
  maxPower(): number {
    return this.basePower() * this.reachMult();
  }

  /** Maximum power before the reach penalty (modifiers applied). */
  basePower(): number {
    return SHOT.maxPower * powerMultiplier(this.upcomingMods());
  }

  reachMult(): number {
    return this.kicker ? reachMultiplier(this.kicker.distance) : 1;
  }

  canAim(): boolean {
    return this.phase === 'Aim';
  }

  /** Team whose rods track the ball during the upcoming/current shot, or null when frozen. */
  trackingTeam(): Team | null {
    return this.upcomingMods().some((m) => m.freezeDefense) ? null : this.defending;
  }

  // ------------------------------------------------------------------ turns

  /** Starts a turn: picks the kicker and orders its rod to slide into place. */
  private beginTurn(phase: 'Kickoff' | 'NextTurn'): void {
    this.phase = phase;
    this.flightTime = 0;
    this.armedIndex = null;
    this.world.extraDamping = 0;
    this.world.haltRods();
    this.sim.defending = null;
    this.turnsStarted[this.active]++;
    if (this.turnsStarted[this.active] % CARD.drawEveryTurns === 0) this.drawCard(this.active);
    const k = selectKicker(this.world, this.active, this.world.ball);
    this.kicker = k;
    this.world.figures[k.figureIndex].ghost = true; // slide without bumping the ball
    this.world.slideRodTo(k.rodIndex, k.targetOffset, FLOW.slideSpeed);
  }

  /** Fires the shot for the active team. Returns false if not currently aiming. */
  fire(angle: number, power: number): boolean {
    if (this.phase !== 'Aim' || !this.kicker) return false;
    const p = Math.min(power, this.maxPower());
    const armed = this.armedModifier();
    if (this.armedIndex !== null && armed) {
      this.hands[this.active].splice(this.armedIndex, 1);
      this.modifiers.push(armed);
    }
    this.armedIndex = null;
    this.shotMods = modsForShot(this.modifiers, this.active);
    this.modifiers = this.modifiers.filter((m) => !this.shotMods.includes(m));
    const ctx: ShotContext = { shooter: this.active, kickerFigure: this.kicker.figureIndex, mods: this.shotMods };
    launchShot(this.world, ctx, angle, p);
    this.flight = { ctx, fs: { time: 0 } };
    this.shots++;
    this.flightTime = 0;
    this.phase = 'Flight';
    return true;
  }

  private endFlight(): void {
    finishShot(this.world);
    this.world.haltRods();
    this.sim.defending = null;
    this.flight = null;
  }

  /** Advances the match by one fixed step. Returns world events produced this step. */
  update(dt: number = FIXED_DT): WorldEvent[] {
    const events: WorldEvent[] = [];
    switch (this.phase) {
      case 'Kickoff':
      case 'NextTurn': {
        events.push(...simulateStep(this.sim, dt));
        const rod = this.world.rods[this.kicker!.rodIndex];
        if (rod.offset === rod.targetOffset) this.phase = 'Aim';
        break;
      }
      case 'Aim':
        break;
      case 'Flight': {
        const fl = this.flight!;
        const r = stepFlight(this.world, fl.ctx, fl.fs, dt);
        events.push(...r.events);
        this.flightTime = fl.fs.time;
        if (r.outcome === 'goal' && r.goal) {
          this.score[r.goal]++;
          this.lastScorer = r.goal;
          this.endFlight();
          this.drawCard(opponent(r.goal)); // catch-up card for the conceding team
          this.phase = 'Goal';
          this.timer = FLOW.goalPause;
        } else if (r.outcome === 'settled') {
          this.endFlight();
          this.phase = 'Settle';
          this.timer = FLOW.settleHold;
        }
        break;
      }
      case 'Settle':
        this.timer -= dt;
        if (this.timer <= 0) {
          this.world.nudgeClear();
          this.active = opponent(this.active);
          this.beginTurn('NextTurn');
        }
        break;
      case 'Goal':
        this.world.step(dt); // keeps rods settled, ball stays frozen
        this.timer -= dt;
        if (this.timer <= 0) {
          const scorer = this.lastScorer!;
          if (this.score[scorer] >= this.goalsToWin) {
            this.winner = scorer;
            this.phase = 'End';
          } else {
            this.world.resetBall(CENTER_X, CENTER_Y);
            this.active = opponent(scorer); // conceding team kicks off
            this.beginTurn('Kickoff');
          }
        }
        break;
      case 'End':
        break;
    }
    return events;
  }
}
