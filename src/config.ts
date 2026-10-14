// All tuning constants for Finger Footy live here.

export type Team = 'blue' | 'red';
export type RodRole = 'GK' | 'DEF' | 'MID' | 'ATK';

export const GAME_W = 720;
export const GAME_H = 1400; // 1280 for the table plus a 120px card tray

// Playing surface (felt)
export const FELT = { x0: 60, y0: 120, x1: 660, y1: 1160 } as const;
export const FELT_W = FELT.x1 - FELT.x0;
export const FELT_H = FELT.y1 - FELT.y0;
export const CENTER_X = (FELT.x0 + FELT.x1) / 2;
export const CENTER_Y = (FELT.y0 + FELT.y1) / 2;
export const CHAMFER = 40;
export const GOAL_W = 200;
export const GOAL_X0 = CENTER_X - GOAL_W / 2;
export const GOAL_X1 = CENTER_X + GOAL_W / 2;
export const GOAL_DEPTH = 40; // pocket behind the goal line

// Sizes
export const BALL_R = 14;
export const FIG_R = 22;

// Rods, listed bottom to top. Blue is at the bottom and attacks UP.
export interface RodSpec {
  team: Team;
  role: RodRole;
  count: number;
}
export const ROD_LAYOUT: readonly RodSpec[] = [
  { team: 'blue', role: 'GK', count: 1 },
  { team: 'blue', role: 'DEF', count: 2 },
  { team: 'red', role: 'ATK', count: 3 },
  { team: 'blue', role: 'MID', count: 5 },
  { team: 'red', role: 'MID', count: 5 },
  { team: 'blue', role: 'ATK', count: 3 },
  { team: 'red', role: 'DEF', count: 2 },
  { team: 'red', role: 'GK', count: 1 },
];
export const ROD_MARGIN_Y = 100; // distance from the goal line to the GK rods
export const ROD_SPACING = (FELT_H - 2 * ROD_MARGIN_Y) / (ROD_LAYOUT.length - 1);
export const GK_RANGE_EXTRA = 40; // GK slide range = goal half width + this

// Physics
export const FIXED_DT = 1 / 120;
export const PHYS = {
  ballRadius: BALL_R,
  restitutionWall: 0.8,
  restitutionFigure: 0.7,
  damping: 1.3, // exponential velocity damping per second
  rollDecel: 40, // constant rolling-friction deceleration (px/s^2)
  stopSpeed: 12, // below this the ball is at rest
  maxBallSpeed: 2400,
  ghostMargin: 2,
  impactEventMin: 30, // minimum normal impact speed that generates an event
  maxSubstepFraction: 0.5, // max travel per substep, as a fraction of ball radius
};

// Shooting
export const SHOT = {
  maxPower: 1600,
  maxDrag: 200,
  minDrag: 24,
};
export const REACH = {
  near: 30, // distance <= near -> 1.0
  max: 115, // distance >= max -> minMult
  minMult: 0.5,
};

// Turn flow
export const FLOW = {
  goalsToWin: 5,
  settleSpeed: 15, // flight ends when ball speed drops below this
  extraDampAfter: 5, // seconds of flight before extra damping
  extraDamping: 3,
  hardCap: 8, // seconds of flight before the ball is forced to stop
  settleHold: 0.2,
  goalPause: 1.8,
  slideSpeed: 1000, // kicker rod slide speed (px/s)
};

// Defense tracking during flight
export const DEFENSE = {
  speed: 600,
  gkSpeed: 750,
};

// Aim visuals
export const AIM = {
  arrowMin: 30,
  arrowMax: 190,
  previewMaxSeconds: 3,
  previewDotSpacing: 20,
  previewMaxDots: 40,
};

export const COLORS = {
  blue: 0x2f7bff,
  red: 0xe5412d,
};

// Cards
export const CARD = {
  maxHand: 3,
  startCards: 1,
  drawEveryTurns: 2, // draw 1 card every Nth turn of your own
  powerMult: 1.5,
  curveRate: 0.8, // rad/s of velocity rotation for Banana Kick
  keeperScale: 2, // Iron Wall: goalkeeper radius multiplier
  longSightSeconds: 5,
  longSightMaxDots: 160,
};

// Layout of the lower UI area
export const TRAY_Y = 1230; // pointer y beyond this belongs to the card tray, not the aim area

// Bot
export const BOT = {
  budgetMs: 8, // search time per frame
  thinkMin: 0.6, // seconds the fake drag takes
  thinkMax: 0.9,
};
