// Deterministic collision primitives. No Phaser, no randomness.

export interface MovingCircle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

export interface Obstacle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

export interface Segment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

/**
 * Circle vs (possibly moving, infinitely heavy) circle. Pushes `ball` out of the
 * obstacle and reflects the RELATIVE velocity, so a sliding obstacle imparts velocity.
 * Returns the normal impact speed (>= 0) when touching, or -1 when not in contact.
 */
export function collideCircleCircle(ball: MovingCircle, obs: Obstacle, restitution: number): number {
  let dx = ball.x - obs.x;
  let dy = ball.y - obs.y;
  const minD = ball.r + obs.r;
  const d2 = dx * dx + dy * dy;
  if (d2 >= minD * minD) return -1;
  let d = Math.sqrt(d2);
  if (d < 1e-9) {
    dx = 0;
    dy = -1;
    d = 1;
  }
  const nx = dx / d;
  const ny = dy / d;
  ball.x = obs.x + nx * minD;
  ball.y = obs.y + ny * minD;
  const rvx = ball.vx - obs.vx;
  const rvy = ball.vy - obs.vy;
  const vn = rvx * nx + rvy * ny;
  if (vn >= 0) return 0;
  const j = -(1 + restitution) * vn;
  ball.vx += j * nx;
  ball.vy += j * ny;
  return -vn;
}

/**
 * Circle vs static segment (end caps included, so posts and chamfer tips work).
 * Returns the normal impact speed (>= 0) when touching, or -1 when not in contact.
 */
export function collideCircleSegment(ball: MovingCircle, seg: Segment, restitution: number): number {
  const abx = seg.bx - seg.ax;
  const aby = seg.by - seg.ay;
  const l2 = abx * abx + aby * aby;
  let t = l2 === 0 ? 0 : ((ball.x - seg.ax) * abx + (ball.y - seg.ay) * aby) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = seg.ax + abx * t;
  const py = seg.ay + aby * t;
  let dx = ball.x - px;
  let dy = ball.y - py;
  const d2 = dx * dx + dy * dy;
  if (d2 >= ball.r * ball.r) return -1;
  let d = Math.sqrt(d2);
  if (d < 1e-9) {
    // centre exactly on the segment: use the segment normal
    const l = Math.sqrt(l2) || 1;
    dx = -aby / l;
    dy = abx / l;
    d = 1;
  }
  const nx = dx / d;
  const ny = dy / d;
  ball.x = px + nx * ball.r;
  ball.y = py + ny * ball.r;
  const vn = ball.vx * nx + ball.vy * ny;
  if (vn >= 0) return 0;
  const j = -(1 + restitution) * vn;
  ball.vx += j * nx;
  ball.vy += j * ny;
  return -vn;
}
