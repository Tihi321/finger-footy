import type { Difficulty } from './ai/bot';

export type Mode = 'pass' | 'cpu';

export interface Settings {
  mode: Mode;
  difficulty: Difficulty;
  goalsToWin: 3 | 5 | 7;
  sound: boolean;
}

export const DEFAULT_SETTINGS: Settings = { mode: 'pass', difficulty: 'medium', goalsToWin: 5, sound: true };
const KEY = 'finger-footy-settings-v1';

export function loadSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const p = JSON.parse(raw) as Partial<Settings>;
    return {
      mode: p.mode === 'cpu' ? 'cpu' : 'pass',
      difficulty: p.difficulty === 'easy' || p.difficulty === 'hard' ? p.difficulty : 'medium',
      goalsToWin: p.goalsToWin === 3 || p.goalsToWin === 7 ? p.goalsToWin : 5,
      sound: p.sound !== false,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable (private mode, quota): ignore */
  }
}
