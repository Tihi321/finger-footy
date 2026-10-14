// Builds the foosball table (walls, goals, rods and figures) as a physics World.
import {
  BALL_R, CENTER_X, CENTER_Y, CHAMFER, FELT, FELT_W, FIG_R, GK_RANGE_EXTRA, GOAL_DEPTH, GOAL_W,
  GOAL_X0, GOAL_X1, ROD_LAYOUT, ROD_MARGIN_Y, ROD_SPACING, PHYS,
} from '../config';
import type { Team } from '../config';
import { World } from '../physics/world';
import type { Segment, WorldParams } from '../physics/world';

export const rodY = (index: number): number => FELT.y1 - ROD_MARGIN_Y - index * ROD_SPACING;

export function buildSegments(): Segment[] {
  const { x0, y0, x1, y1 } = FELT;
  const c = CHAMFER;
  const seg = (ax: number, ay: number, bx: number, by: number): Segment => ({ ax, ay, bx, by });
  const d = GOAL_DEPTH;
  return [
    // side walls
    seg(x0, y0 + c, x0, y1 - c),
    seg(x1, y0 + c, x1, y1 - c),
    // chamfered corners
    seg(x0, y0 + c, x0 + c, y0),
    seg(x1 - c, y0, x1, y0 + c),
    seg(x0, y1 - c, x0 + c, y1),
    seg(x1 - c, y1, x1, y1 - c),
    // top end wall (either side of the goal mouth)
    seg(x0 + c, y0, GOAL_X0, y0),
    seg(GOAL_X1, y0, x1 - c, y0),
    // top goal pocket
    seg(GOAL_X0, y0, GOAL_X0, y0 - d),
    seg(GOAL_X1, y0, GOAL_X1, y0 - d),
    seg(GOAL_X0, y0 - d, GOAL_X1, y0 - d),
    // bottom end wall
    seg(x0 + c, y1, GOAL_X0, y1),
    seg(GOAL_X1, y1, x1 - c, y1),
    // bottom goal pocket
    seg(GOAL_X0, y1, GOAL_X0, y1 + d),
    seg(GOAL_X1, y1, GOAL_X1, y1 + d),
    seg(GOAL_X0, y1 + d, GOAL_X1, y1 + d),
  ];
}

/** Creates the standard table. Blue sits at the bottom and attacks up. */
export function createWorld(params: WorldParams = PHYS): World {
  const w = new World({ ...params, ballRadius: BALL_R });
  w.segments = buildSegments();
  w.goals = [
    { scorer: 'blue', side: 'top', lineY: FELT.y0, x0: GOAL_X0, x1: GOAL_X1 },
    { scorer: 'red', side: 'bottom', lineY: FELT.y1, x0: GOAL_X0, x1: GOAL_X1 },
  ];
  const lo = FELT.x0 + FIG_R;
  const span = FELT_W - 2 * FIG_R;
  ROD_LAYOUT.forEach((spec, i) => {
    const n = spec.count;
    const s = span / n;
    const baseXs: number[] = [];
    for (let k = 0; k < n; k++) baseXs.push(lo + s / 2 + k * s);
    // The figures together cover the full felt width: each slides +-s/2.
    let range = s / 2;
    if (spec.role === 'GK') range = GOAL_W / 2 + GK_RANGE_EXTRA;
    w.addRod({
      team: spec.team,
      role: spec.role,
      y: rodY(i),
      baseXs,
      minOffset: -range,
      maxOffset: range,
      figureRadius: FIG_R,
    });
  });
  w.resetBall(CENTER_X, CENTER_Y);
  return w;
}

export const opponent = (t: Team): Team => (t === 'blue' ? 'red' : 'blue');

/** Clamped rod offset setter (teleport, zero velocity). Returns the applied offset. */
export function setRodOffset(world: World, rodIndex: number, offset: number): number {
  return world.setRodOffset(rodIndex, offset);
}

/** World positions of every figure on a rod. */
export function figurePositions(world: World, rodIndex: number): { x: number; y: number }[] {
  return world.rods[rodIndex].figureIds.map((id) => ({ x: world.figures[id].x, y: world.figures[id].y }));
}
