import { GAME_H, GAME_W } from '../config';

/** Internal render scale: 1 on normal screens, 2 on high-DPI phones (capped to keep the canvas affordable). */
export const RES: number = Math.min(2, Math.max(1, Math.round(typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1)));

export const CANVAS_W = GAME_W * RES;
export const CANVAS_H = GAME_H * RES;
