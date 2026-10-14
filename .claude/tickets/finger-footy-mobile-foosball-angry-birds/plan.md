# Finger Footy: mobile foosball × Angry Birds (MVP plan)

## Context
The repo `C:\projects\Personal\finger-footy` is empty (only `README.md`). The user wants a mobile football game that looks like an old table-football (foosball) table seen from above, with Angry Birds-style slingshot shooting: you drag your finger, an arrow points the opposite way, and drag length and direction set the kick power and angle. Card-based power-ups come on top of that core.

Decisions confirmed with the user:
- **Foosball rods**: figures are fixed on rods and only slide along them.
- **Turn-based**: one side shoots, the ball settles, then the other side shoots.
- **Opponents**: computer AI and pass-and-play on one phone. Online play is out of scope.
- **Tech**: web game in TypeScript, Phaser 3 and Vite, installable as a PWA. A Capacitor wrapper for the stores can come later.

Housekeeping: this file is the authoritative plan, and it is run through the `implement` skill. Scratch files go in `.claude/temp/`.

**Branch**: `finger-footy-mvp_mobile-foosball-game`, cut from `origin/master`.

## Core design

**Table (portrait, 720×1280 logical, Phaser `Scale.FIT`)**
- The felt runs from x 60 to 660 and y 120 to 1160. It has a wooden frame, white pitch lines, and goal mouths 200px wide at the top and bottom. The corners are chamfered so the ball never sticks there.
- There are 8 chrome rods running across the width, evenly spaced. From bottom to top (Blue at the bottom attacks upward): Blue GK(1), Blue DEF(2), Red ATK(3), Blue MID(5), Red MID(5), Blue ATK(3), Red DEF(2), Red GK(1).
- Each rod's slide range is computed so that its figures together cover the full width. The GK is limited to the goal area.
- All art is drawn in code with Phaser Graphics and generated textures: wood, felt, chrome rods, and red/blue figures seen from above. No asset pipeline is needed.

**Shooting (slingshot)**
- At the start of a turn, the game picks the active team's **kicker**: the figure that gets closest to the ball once its rod slides. The rod animates sideways to line the figure up, and the figure is highlighted.
- Touch down anywhere and drag. An arrow is drawn from the ball in the *opposite* direction.
  - Arrow length means power. It is clamped, and its colour shifts green → yellow → red.
  - Arrow angle sets the shot direction.
  - A short dotted preview shows the path up to the first collision, like Angry Birds.
- If you release below a minimum drag length, the shot is cancelled.
- **Reach penalty**: the further the ball is from the kicker figure, the weaker the maximum power. The multiplier is 1.0 when the ball is close and drops to 0.5 at full reach. This rewards leaving the ball near your own rods.
- When the shot starts, the kicker is "ghosted" (no collision) until the ball leaves its radius, so a ball resting on the rod line doesn't instantly re-collide with it.

**Flight and settling**
- Physics runs in fixed steps of 1/120 s.
- While the ball is in flight, the **defending team's rods auto-track the ball's x** at a capped speed. This blocking is what makes it feel like foosball. The attacking team's rods stay where they are.
- The turn ends when the ball's speed drops below a threshold. After 5 s, extra damping kicks in, and there is a hard cap at 8 s.
- If the ball comes to rest overlapping a figure, it is nudged clear.
- **Goal**: the ball crosses a goal line inside the goal mouth. The game then plays a celebration, resets the ball to the centre, and the conceding side kicks off.
- The match is first to N goals (3, 5 or 7, chosen in the menu).

**Custom physics (instead of Matter.js)**
- The physics is deterministic and written in TypeScript with no Phaser dependency. It handles:
  - ball vs circle (figures, which can move)
  - ball vs segment (walls, chamfers, goal posts)
  - restitution and rolling friction
- Being deterministic lets the AI simulate candidate shots exactly, and it makes the physics easy to unit-test.

**AI bot**
- The bot clones the world and simulates candidate shots: roughly 72 angles × 4 power levels.
- It scores each result:
  - +big for a goal
  - −big for an own goal
  - + for ending close to the opponent's goal
  - − for leaving the ball where the opponent has a strong shot
- The search is spread across frames so the UI never freezes. Then the bot animates a fake drag so the player can see the shot being lined up.
- Difficulty sets the angle and power noise (Easy ±8°, Medium ±3°, Hard ±1°) and the number of samples.

**Cards (power-ups)**
- You can hold up to 3 cards. You draw 1 card every second turn of your own, plus 1 when you concede a goal, as a catch-up.
- You may play at most 1 card per turn, before shooting.
- v1 cards:
  - **Power Shot**: max power ×1.5, with a fire trail.
  - **Banana Kick**: the ball curves; a toggle picks left or right.
  - **Ghost Ball**: the ball passes through the first opposing figure it touches.
  - **Iron Wall**: your GK is twice as wide during the opponent's next shot.
  - **Freeze**: the opponent's rods don't track during your shot.
  - **Long Sight**: the full trajectory preview, including bounces.
- Effects hook into the physics and turn code through a small modifier interface. The AI plays a card when it improves its best simulated score.

**Feel and juice**
- Screen shake on a goal or a hard hit.
- Particles on kicks and wall hits.
- Brief slow motion on near misses.
- Synthesized Web Audio sounds: kick "tock", wall "clack", goal cheer.
- Vibration on kick where the device supports it.

## File layout (new project)
```
package.json, vite.config.ts (vite-plugin-pwa), tsconfig.json, index.html (touch-action:none, no zoom)
src/main.ts                 Phaser config, scene list
src/config.ts               all tuning constants (dims, rod layout, physics, power, AI)
src/physics/vec.ts, collide.ts, world.ts   deterministic sim: step(), clone(), events (hit/wall/goal)
src/game/table.ts           builds rods/figures from layout, slide limits
src/game/kicker.ts          selectKicker(team, ball) + reach multiplier
src/game/defense.ts         rod auto-tracking during flight
src/game/shot.ts            drag vector → {angle, power}
src/game/match.ts           state machine: Kickoff → CardPhase → Aim → Flight → Settle → Goal/NextTurn → End
src/game/cards.ts           card defs, deck/hand, modifiers
src/ai/bot.ts               shot search, scoring, difficulty
src/render/tableArt.ts, aimArrow.ts, fx.ts, audio.ts
src/scenes/Boot.ts, Menu.ts (mode, difficulty, goals), Match.ts, Hud.ts, Result.ts
tests/physics.test.ts, kicker.test.ts, match.test.ts, bot.test.ts   (Vitest)
```
Settings (difficulty, goals to win, sound) are saved in localStorage.

## Milestones (checklist)
- [x] 1. Scaffold Vite + TS + Phaser + Vitest. Draw the static table and rods. Done: phaser 3.90.0 pinned, strict TS, `?match` URL param skips the menu (dev shortcut). Verified: `npm run build` passes, headless Chrome screenshot of the table looks right.
- [x] 2. Physics core and its tests: wall reflection, moving-figure hit, goal detection, determinism. Done: `src/physics/` and `tests/physics.test.ts` (13 tests pass).
- [x] 3. Slingshot input, kicker selection, the turn loop and goals. **Pass-and-play is playable at this point.** Done: Match scene, Boot, minimal Menu (vs CPU disabled, "coming soon"). Gameplay was not driven by hand, only screenshot-checked.
- [x] 4. Defensive rod tracking, the reach penalty, and the settle/nudge rules. Done: `simulateStep` in `src/game/defense.ts`; `tests/kicker.test.ts` and `tests/match.test.ts` pass. Total 35 tests pass; build and type check clean; dev server smoke test served 200 on / and /src/main.ts, then stopped.
- [x] 5. AI bot with 3 difficulty levels. Done: `src/ai/bot.ts` (generator search, 8 ms/frame budget, mulberry32), shared shot sim in `src/game/shotSim.ts` used by Match, preview and bot. `tests/bot.test.ts` (5 tests).
- [x] 6. Cards: hand UI, the 6 effects, and AI card use. Done: `src/game/cards.ts` (data modifiers, seeded Deck), hooks in World (`ballCurve`, `ghostBallFor`, `Figure.baseR`) and shotSim; tray UI in Match scene. `tests/cards.test.ts` (13 tests). Deviation: GAME_H is now 1400 (120 px card tray below the 1280 table).
- [x] 7. Menu, HUD, result screen, sound, the feel-and-juice effects, and the PWA manifest and icons. Done: settings menu with localStorage, `audio.ts`, `fx.ts`, RES-scaled canvas for high-DPI, safe-area CSS, vite-plugin-pwa 2.0.0 + generated icons (`scripts/gen-icons.mjs`). Service worker registration was not confirmed in headless Chrome. Totals: 53 tests pass, build clean.

## Verification
- `npm test`: Vitest covers the physics (energy loss on a bounce, goal-line detection, identical results from the same seed), kicker selection, the match state transitions, and the bot (it finds a goal when it has an open shot at an empty net).
- `npm run build` succeeds, and the type check is clean.
- `npm run dev -- --host`, then open the game on a real phone over the LAN, or in Chrome's mobile emulation (portrait 390×844). Drive it with claude-in-chrome: drag to shoot and take screenshots of the aim arrow, the ball in flight, a goal, and the result screen. Play a full match against the AI and a full pass-and-play match.
- Lighthouse PWA check: the game installs and runs fullscreen in portrait.
