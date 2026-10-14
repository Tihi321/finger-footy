import { SHOT } from '../config';

export interface Shot {
  angle: number; // radians, direction the ball travels (OPPOSITE to the drag)
  power: number; // initial ball speed in px/s
  valid: boolean;
  dragLength: number; // clamped drag length
  strength: number; // 0..1 of maxDrag
}

export interface Pt {
  x: number;
  y: number;
}

export function dragToShot(dragStart: Pt, dragCurrent: Pt, maxPower: number, reachMult: number): Shot {
  const dx = dragCurrent.x - dragStart.x;
  const dy = dragCurrent.y - dragStart.y;
  const raw = Math.hypot(dx, dy);
  const dragLength = Math.min(raw, SHOT.maxDrag);
  const strength = dragLength / SHOT.maxDrag;
  const angle = raw === 0 ? 0 : Math.atan2(-dy, -dx);
  return {
    angle,
    power: maxPower * reachMult * strength,
    valid: raw >= SHOT.minDrag,
    dragLength,
    strength,
  };
}
