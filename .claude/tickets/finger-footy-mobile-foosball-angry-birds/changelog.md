# Changelog

## 2026-10-14 — finger-footy-mvp: playable MVP of Finger Footy
Top-down foosball with slingshot shooting. It has pass-and-play, a CPU opponent with 3 difficulty levels, 6 power-up cards, a menu, sound, effects, and a PWA build.

### Repo: finger-footy
- **Branch:** `finger-footy-mvp_mobile-foosball-game`, cut from `origin/master`.
- **Commit status:** committed on the branch, not pushed.

### Files
**Tooling**
- `package.json` and `package-lock.json`: Phaser 3.90.0, Vite 5, Vitest 2, TypeScript 5.6, and vite-plugin-pwa 2.0.0, with exact pins on the Phaser and PWA packages. Scripts are `dev`, `build` (tsc then vite build), `test` and `preview`.
- `tsconfig.json`: strict TypeScript.
- `vite.config.ts`: PWA manifest (portrait, standalone) and the offline service worker.
- `index.html`: no zoom, `touch-action:none`, safe-area insets.
- `.gitignore`.

**Assets**
- `scripts/gen-icons.mjs` generates the icons in `public/`: 192, 512, maskable, apple-touch, and SVG.

**Config and setup** (`src/`)
- `config.ts`: all tuning constants. The game is 720×1400 logical (720×1280 table plus a 120px card tray).
- `main.ts`: Phaser game setup. In dev it also exposes `window.__game`.
- `settings.ts`: settings stored in localStorage.
- `rng.ts`: mulberry32, a seeded random number generator.

**Physics** (`src/physics/`)
- `vec.ts`, `collide.ts` and `world.ts`: deterministic physics with a fixed 1/120 s step. Ball against moving circles and against segments, substeps so the ball never tunnels, `clone()`, and events.
- Card hooks: ball curve, ghosting the first figure the ball touches, and keeper radius scaling.

**Game logic** (`src/game/`)
- `table.ts`: the 8-rod layout and each rod's slide range.
- `kicker.ts`: kicker selection and the reach penalty (1.0 down to 0.5).
- `shot.ts`: turns a drag into a shot (opposite direction, clamped, minimum drag).
- `defense.ts`: `simulateStep`, where the defending rods track the ball.
- `shotSim.ts`: the shared shot code. The real match, the aim preview and the bot all use it.
- `match.ts`: the turn state machine (Kickoff → Aim → Flight → Settle → Goal/NextTurn → End), plus scoring, cards and controllers.
- `cards.ts`: the 6 cards as data modifiers, a seeded deck, and the hand and draw rules.

**AI** (`src/ai/bot.ts`)
- A time-sliced shot search with goal, own-goal, progress and counter-danger scoring.
- Noise per difficulty level.
- Card evaluation.

**Rendering** (`src/render/`)
- `tableArt.ts`: the procedural table, rods and figures. The rod bars are static and full width; the handles stay outside the frame.
- `audio.ts`: synthesized Web Audio.
- `fx.ts`: particles, screen shake, slow motion and the fire trail.
- `res.ts`: high-DPI rendering.
- `ui.ts`: buttons.

**Scenes** (`src/scenes/`)
- `Boot.ts`.
- `Menu.ts`: mode, difficulty, goals to win and sound.
- `Match.ts`: aim arrow, dotted preview, HUD, card tray, bot fake-drag, goal text and the winner overlay.

**Tests**
- `tests/physics`: 13
- `tests/kicker`: 12
- `tests/match`: 10
- `tests/cards`: 13
- `tests/bot`: 5

### Deviations from the plan
- **Height:** `GAME_H` is 1400 instead of 1280. The extra 120px holds the card tray below the table, so it never covers the playfield.
- **Modifiers are plain data** instead of function hooks. This keeps them cloneable for the AI simulation.
- **Result screen:** it is an overlay inside the Match scene, not a separate `Result` scene. The HUD is likewise part of Match rather than a separate scene.
- **Slow motion** triggers only on a post hit near the goal mouth, not on every near miss.
- **Dev shortcut:** `?match` in the URL skips the menu.

### Verification
**Run and passing**
- `npm test`: 53 of 53 pass.
- `npm run build`: clean `tsc --noEmit`, vite build, and the PWA service worker generated with 16 precache entries.
- Orchestrator checks in real Chrome at the dev server:
  - The table renders.
  - The aim arrow follows the drag.
  - Shots fire, and turns alternate blue → red → blue (confirmed by a phase log).
  - No console errors.
- Implementer checks in headless Chrome at 390×844, device scale factors 1, 2 and 3. Screenshots are in `.claude/temp/`.
  - Menu, CPU aiming, armed card tray, Long Sight preview, flight, win overlay, and the production menu.
  - No console errors.

**Not run or not confirmed**
- Offline service worker: it did not register in headless Chrome.
- Lighthouse PWA audit.
- Sound, vibration and slow motion: not observed. Audio is muted in headless.
- A real phone session.
- A full match played by hand to the end. The End path is covered by unit tests, and the overlay was screenshotted by forcing the phase.
- Bot difficulty balance.

### Follow-ups and known limitations
- Playtest on a phone to tune shot power, damping, defender tracking speed (600/750 px/s) and bot noise.
- The preview dots bunch up as the ball slows.
- Possible next steps: a Capacitor wrapper for the app stores, and online multiplayer (out of MVP scope).
