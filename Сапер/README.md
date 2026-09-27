# Minesweeper · Stillfield

A complete, static Minesweeper game built for YouTube Playables integration. Vanilla ES modules, accessible DOM grid, original local SVG artwork, generated sound effects, and no runtime dependencies except the official YouTube SDK. No backend, account, ads, analytics, cookies, or personal data collection.

## Run locally

From this folder:

```sh
python3 -m http.server 8080 --bind 127.0.0.1
```

Open http://127.0.0.1:8080 in a modern browser. This is a development file server, not a game backend. Any static HTTP server works. Direct `file://` opening is unsupported because the game uses ES modules. Node is only needed for development tests, never for playing or hosting the game.

The official SDK script is requested first. Outside YouTube, `ytgame.IN_PLAYABLES_ENV` is false or unavailable, and the game runs locally. If the SDK request fails, the following module still runs. A slow pending SDK request can delay startup because the required script ordering is preserved.

## Files and architecture

```text
index.html              Entry point; SDK precedes game module
css/game.css            Responsive dark/light UI and reduced-motion styles
js/board.js             Pure deterministic board operations, placement, BFS, chord
js/game.js              Game clock, independent pause reasons, scores, restoration
js/input.js             Pointer state machine: pinch, pan, hold, mouse/keyboard
js/camera.js            Fixed board geometry, scale/offset, fit, bounds, hit tests
js/ui.js                Accessible DOM grid, layout, SVG icons, dialogs
js/save.js              Schema validation, coalesced writes, final flush, bests
js/youtube.js           Sole gateway to ytgame; development storage isolation
js/audio.js             Small Web Audio effects with immediate mute handling
js/main.js              Startup and application orchestration
assets/icon.svg         Original brand mark/favicon
assets/field.svg        Original menu illustration
scripts/release.py      Dependency validation and deterministic ZIP packaging
tests/                 Engine, persistence, SDK contract and browser tests
```

The grid contains at most 480 cells. Cells are created once per new/restored game; only state changes update their content. DOM makes each square keyboard and screen-reader accessible without duplicating a canvas in hidden markup. No continuous animation/render loop. A 200 ms UI timer runs only during an active game; elapsed time comes from `performance.now()`, not interval counts.

## Gameplay and controls

- Beginner: 9 × 9 / 10 mines; Intermediate: 16 × 16 / 40; Expert: 30 × 16 / 99.
- Left click/tap: reveal. Right click or 430 ms touch hold: toggle flag.
- Flag mode: tap toggles flags. The hold highlight confirms the gesture; release cannot also reveal.
- Tap an open number to chord when the adjacent flag count matches. Incorrect flags can lose.
- Drag more than 9 CSS px to pan; this cancels reveal/long press. Two pointers pinch around their midpoint and cancel gameplay until all fingers lift. After one finger lifts, the other can keep panning. Mouse wheel zooms under the cursor. +/− zoom by 1.2 around the viewport center; Fit shows the entire board.
- Arrows: move focus. Enter: reveal/chord. Space: selected mode. F: flag. Home/End: row edges. Escape: pause or dismiss a dialog.
- Menus, settings and manual pause stop time. Restart asks before replacing an active field.
- First reveal generates mines outside its full 3 × 3 neighborhood. Flagging before the first reveal does not generate mines or start time. Boards are random, not guaranteed to be solvable without guessing.
- Games played counts first reveals, including subsequently abandoned games. Games won counts completed safe fields.

Layout-only resizing preserves board, flags, elapsed time, and progress. A flex container gives the camera the space remaining below the compact HUD and above controls, with safe-area padding. Landscape phones put the heading and counters in one row. ResizeObserver measures that container; there are no hard-coded viewport-height subtractions.

The DOM board keeps 44 px logical cells, 3 px gaps, and 9 px border padding. A separate camera applies `translate(offsetX, offsetY) scale(scale)` with origin (0,0); browser DOM/SVG rendering handles Retina without canvas/DPR scaling. Minimum scale is `min(1, (width - 24) / boardWidth, (height - 24) / boardHeight)` (padding reduces proportionally only in exceptionally tiny containers). Maximum scale is 2.5. Initial scale and Fit are capped at 1, so Beginner never grows absurdly large. Fit is an overview; pinch or + enlarges tiny Expert squares for precise play.

The camera centers an axis when the board fits, otherwise clamps offsets with 12 px edge space. Inverse screen-to-world hit testing excludes grid gaps and borders. Resize automatically refits until manual pan/zoom; after that it preserves the world center as far as camera bounds permit. Invalid or zero dimensions are ignored until recovery. Camera state is transient and does not change the version-1 game save.

## YouTube SDK integration

Verified against the official reference and integration requirements on 2026-09-27:

- https://developers.google.com/youtube/gaming/playables/reference/sdk
- https://developers.google.com/youtube/gaming/playables/certification/requirements_integration

`youtube.js` owns `ytgame.game.firstFrameReady()`, `gameReady()`, `loadData()`, `saveData(string)`, `system.onPause(callback)`, `onResume(callback)`, `isAudioEnabled()`, `onAudioEnabledChange(callback)`, and `engagement.sendScore({ value })`. Nonfatal platform errors can use `health.logWarning()` without personal data.

Startup: render the loading screen → firstFrameReady → await loadData → validate/restore save → prepare interactive menu → hide loading → gameReady. If paused during loading, menu initialization waits for resume. Gameplay input, timer, sound and CSS animation pause together. A single latest snapshot is flushed on platform pause, including after an already pending save. This final flush is best effort.

Production never uses localStorage or browser visibility for lifecycle. Development uses localStorage key `stillfield-dev-save-v1` and visibility/pagehide as local-only conveniences. Cloud loading failure or timeout (8 seconds) allows play with a visible non-saving notice and prohibits writes; reload retries loading. Cloud write failures retain the snapshot and retry on a later move/resume. There is no retry loop while paused.

The sound-effects setting is subordinate to YouTube's global mute. No audio context is created until an allowed user interaction. Mute stops current oscillators immediately. Lack of Web Audio does not block gameplay.

### Scores

For a win:

```text
score = difficultyWeight * 1,000,000 + max(0, 999,999 - floor(elapsedMs / 1,000))
weight: beginner 1, intermediate 2, expert 3
```

This is one ranked dimension: completed difficulty first, then speed in whole seconds. Faster wins rank higher within the same difficulty; exceptionally long games clamp at the difficulty baseline. The personal high is derived from saved per-difficulty best times and shown in results/settings. Only an acknowledged save can trigger score submission. Failed submissions retry on a later successful save. There are no invented difficulty-specific leaderboard APIs.

## Save format and migration

```json
{
  "version": 1,
  "settings": { "sound": true, "difficulty": "beginner", "theme": "dark" },
  "bestTimes": { "beginner": null, "intermediate": null, "expert": null },
  "stats": { "gamesPlayed": 0, "gamesWon": 0 },
  "current": null
}
```

An unfinished `current` contains `difficulty`, `cols`, `rows`, `generated`, `state`, `elapsed` (milliseconds), and `cells`. Each cell is one ASCII digit with bit 0 = mine, bit 1 = opened, bit 2 = flagged. Counts are derived on restore. Expert snapshots are under 2 KB. Finished games clear `current`, preserving records/statistics.

Writes debounce by 350 ms, serialize asynchronously and coalesce newer states. First reveal, outcome and pause flush immediately. Timer-only ticks do not write. Save/load validates dimensions, cell length, mine count, impossible opened mines/flags, state and elapsed bounds. Corrupted version-1 saves reset safely. Unknown schema versions open a read-only session, preserving the original save; add explicit migrations to `parseSave` before changing the schema version. Continue never counts time spent away.

## Test and release

Engine/storage/SDK contract tests need Node 20+ and no npm installation:

```sh
node --testtests/*.test.js
```

Optional browser QA uses Playwright from an existing development installation:

```sh
# With the local server running and Playwright's Chromium installed:
PLAYWRIGHT_PATH=/absolute/path/to/node_modules/playwright nodetests/browser-smoke.mjs
```

The browser suite replaces only the SDK network response with a contract test double. It is not a production mock/server. It runs pointer/touch and keyboard inputs, UI outcomes, layout checks and saves screenshots to `test-results/`. See [testing.md](testing.md) for coverage and the remaining real-device/Portal checklist.

No transpilation, minification, asset downloads or bundler is required for production. The reviewed source files are the production build. Package it with:

```sh
python3 scripts/release.py
```

This validates filenames, exact-case relative paths, expected external resources, SDK ordering and ZIP integrity. The generated `playable.zip` contains **index.html at its root**, plus only `css/`, `js/`, and `assets/`. Tests, docs, package metadata, screenshots and source-control files are excluded. Size and SHA-256 are written to `test-results/release-report.json`.

## Known limits and certification

This is a release candidate prepared for Portal validation, not a claim of YouTube certification. Live SDK behavior, account cloud saves, host eviction, actual leaderboard display, and physical Android/iOS audio/touch still require the Developer Portal and real devices. Synthetic Chromium touch checks do not establish Safari/WebKit compatibility. Startup and frame-rate targets need measurement on target devices with the real SDK/network. No daily mode, external services, guaranteed no-guess generation or cloud conflict resolution is included. The official host controls cross-device save arbitration.
