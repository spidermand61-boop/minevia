# Validation record and release checklist

Run date: 2026-09-27. Environment: macOS arm64, Node 24, headless Chromium 151. The browser suite runs against a local static HTTP server, replacing the SDK script with either an empty local-mode response or a controlled SDK contract fixture.

## Automated coverage

- [x] 300 seeded first-opening cases across all three difficulties: exact mine counts, safe neighborhood, independently checked adjacent counts, deterministic RNG injection.
- [x] Flag toggle/count, first-move flag does not generate a board/start time, opened-cell flag rejection.
- [x] Iterative flood reveal, flagged cells preserved, victory after all safe cells.
- [x] Mine loss, correct and incorrect chording, terminal input lock.
- [x] Timestamp timer and composed pause reasons; restore excludes time away.
- [x] Save serialization, compact expert snapshot, state/dimension/time validation.
- [x] Fresh/corrupted save and read-only future schema.
- [x] SDK readiness ordering, successful-load-before-save, no writes after load failure.
- [x] Serialized/coalesced writes, failed write retained without a retry storm.
- [x] Latest pause snapshot flushed after an in-flight save.
- [x] Integer score improves for faster time; score submission follows saved bests.
- [x] Browser mouse reveal, right-click, keyboard navigation/reveal/flag, flag mode.
- [x] Chromium native touch long press; no subsequent tap reveal.
- [x] Real mouse pan cancels reveal, Fit reset, expert 480-cell board.
- [x] Continue after browser reload, restart confirmation, pause freezes time.
- [x] Viewport changes preserve exact board DOM; no horizontal page overflow at 360×1280, 360×840, 360×640, 600×800, 700×700, 800×600, 1280×720, 1260×540, 1600×450 and 240×850.
- [x] Zero-sized board container then restoration; no invalid cell dimensions.
- [x] Browser SDK callbacks freeze input/time and preserve an existing user pause.
- [x] Production path runs with browser localStorage methods deliberately throwing.
- [x] Global mute blocks oscillator creation; permitted user actions create audio; mute blocks further sounds.
- [x] Complete win and loss UI, revealed mines/exploded square, stats, best time and score matching the save.
- [x] Desktop and mobile menu/game and win/loss screenshots inspected.
- [x] Root ZIP entry, whitelisted assets, lowercase production filenames, relative/case-sensitive dependency checks, no third-party asset URLs.

The zero-size test uses the board container; the browser viewport itself cannot be resized to 0×0 through Playwright. Code additionally guards innerWidth/innerHeight. SDK tests are contract tests, not certification.

## Manual Developer Portal / physical-device gate

- [ ] Upload playable.zip and run the official Playables Test Suite. Verify required SDK events on a cold launch and after host pause during initialization.
- [ ] Confirm actual cloud save restoration between Playables sessions/devices, failed/offline load behavior, final save on eviction and no overwrite before successful load.
- [ ] Confirm actual YouTube leaderboard score matches the game's saved personal high; verify submission eligibility and portal configuration.
- [ ] Test backgrounding, host pause/resume, interruption during a held touch/drag/settings dialog, and eviction without a resume.
- [ ] Verify YouTube mute, device volume, iOS audio unlocking and silent failure when audio is unavailable.
- [ ] Test physical Android Chrome/WebView and iOS Safari/WebView: tap, hold, dragging both axes, simultaneous contacts, orientation changes, keyboard if attached.
- [ ] Test screen readers (VoiceOver/TalkBack), keyboard focus, browser zoom, enlarged text, reduced motion and color contrast under the host's display settings.
- [ ] Measure real cold startup (<3 s goal), interaction smoothness (60 FPS goal) and memory on representative low-end mobile hardware.
- [ ] Confirm real 0×0 iframe recovery, safe-area behavior, minimum supported host viewport and ultrawide portal layouts.
- [ ] Verify only the official SDK creates external communications in the hosted release; no analytics, external links, login or third-party ads.

## Review fixes

Corrected very narrow toolbar overflow; isolated independent timer pause reasons; delayed initialization during platform pause; cancelled pointer state when pausing; protected unknown save schemas and failed cloud loads; serialized writes; preserved the final pause snapshot behind an active write; deferred score reporting until persistence succeeded; stopped sound immediately on mute. Runtime has no infinite animation loop or dynamically accumulating board listeners.

## Mobile camera correction (2026-09-27)

Root cause: old zoom modified `--cell` with a 32 px floor; width-only Fit could not fit Intermediate/Expert. Native scroll offsets were the camera, and a second pointer cancelled input without implementing pinch. Height was estimated by fixed `100dvh` subtractions.

Changed runtime files: `js/camera.js` (new), `js/input.js`, `js/ui.js`, `js/main.js`, `css/game.css`, `index.html`. Updated `README.md`, this record, `tests/browser-smoke.mjs`, and added `tests/camera.test.js` / `tests/camera-browser.mjs`. SHA-256 comparisons confirmed `board.js`, `game.js`, `save.js`, and `youtube.js` are unchanged.

Final verification: **22 unit/contract tests passed**, including seven camera tests; existing browser gameplay/SDK checks and the new camera suite all passed with no page/console errors in the camera scenario.

- [x] All 18 combinations of Beginner/Intermediate/Expert and 390×844, 360×640, 412×915, 768×1024, 1920×1080, 844×390.
- [x] Automatic initial Fit, both dimensions inside the measured viewport, fixed logical 44 px cells, all three zoom controls at least 44×44 px, no page overflow or controls below screen.
- [x] Dynamic minimum (Expert at 390×844: approximately 0.229), maximum 2.5, 1.2 button step, initial/Fit scale capped at 1.
- [x] Native Chromium two-contact pinch out and pinch in to Fit; held second contact cancels long press; lifting one contact permits continued pan with no reveal.
- [x] Pan held beyond long-press timeout never flags/reveals; exact transformed cell long press and tap work after pinch/pan.
- [x] Mouse wheel preserves cursor world point when unclamped; buttons preserve viewport center; bounds center small axes and retain reachable edges.
- [x] Portrait/landscape/portrait preserves cell state and manual world center; timer continues. Automatic camera refits on resize.
- [x] Pointer cancellation causes no delayed flag/tap; invalid/zero dimensions recover safely; keyboard brings offscreen cells into view through the camera.
- [x] DPR 3 screenshots of Expert at all six sizes; portrait and landscape visually inspected.

Remaining manual gate: real iOS Safari and Android/WebView, actual YouTube container resizing/lifecycle, and notch/home-indicator safe areas on physical devices. Browser emulation does not constitute physical-device certification. At Fit, a dense Expert board intentionally has small on-screen squares; pinch or + is the precision-play view. Near board bounds, camera clamping can shift the zoom anchor, as required to keep the field reachable.

## Two-stage loss and Custom / right-click update (2026-09-28)

Runtime changes: `game.js`, `main.js`, `input.js`, `ui.js` for two-stage loss; `board.js`, `save.js`, `index.html`, `game.css`, plus new `config.js` and `custom.js` for configuration-driven Custom. Camera math (`camera.js`) and YouTube adapter/API remain unchanged. Added `custom.test.js`, `loss-browser.mjs`, `custom-browser.mjs`, and extended the existing test runner/platform tests. README and release archive were refreshed.

### Loss review

`Board.state` remains terminal `lost`. `Game.state` exposes a separate `lost-reveal` → `game-over` presentation transition. A mine hit stops time, saves `current: null`, shows all mines (retaining correct flag icons), marks the detonated mine and wrong flags, and plays the loss effect once. Only a subsequent intentional tap calls `showGameOver()`. View field / Escape returns to `lost-reveal`. Restart creates a fresh Game and clears both stages.

The existing pointerup tap classifier calls one dispatcher once; native compatibility clicks do not re-dispatch. Long holds remain suppressed even when gameplay is disabled. Navigation permission is independent of gameplay permission. No timer opens the result modal.

- [x] All three standard difficulties × desktop 1280×900, touch portrait 390×844, touch landscape 844×390.
- [x] Mine hit reveals the field without modal; time stays frozen; no automatic modal after waiting.
- [x] Pan, pinch, wheel, +/−, FIT, right click, F key and touch hold leave the review visible and board state unchanged.
- [x] Subsequent ordinary tap opens results, including when Flag mode is selected; the triggering mine tap never opens both stages.
- [x] Correct/incorrect flag rendering, one loss sound, no duplicate sound on results, no resumable lost save, no Continue after reload, same-difficulty restart, repeated View field/result cycles.

### Custom configuration and right click

Width 5–40; height 5–30; mines 1–(width × height − 9). The safe reserve is the largest possible first-opening neighborhood. Configuration is checked before board allocation. Changing valid dimensions clamps excess mines. Invalid empty/non-numeric/fractional/negative/out-of-range input blocks Start with a message. +/- buttons keep exact values in range.

Schema version 1 is extended additively with optional `lastCustomConfig` and `current.customConfig`. Legacy saves default to 16×16 / 40 mines. Continue and Restart retain the actual custom configuration. Custom outcomes affect gamesPlayed/gamesWon, but never standard bestTimes or scores.

Audit corrected preset-dependent constructor/restore dimensions and mine counts, difficulty validation, record lookups/result score display, and restart configuration. Flood fill, chord, win count, remaining mines and camera already used live board dimensions/counts and were reused.

Right click uses the existing inverse camera hit test and flag operation. Right-drag cancels the action without panning. The contextmenu handler is scoped to the board viewport because pointer capture can retarget the browser's contextmenu event from a cell to that viewport; normal document menus are unaffected.

- [x] **32 unit/contract tests passed**, including configuration validation, seven custom sizes with minimum/typical/maximum mines and corner/center first openings, flags, flood, chord, win/loss, elapsed time, restore and camera fit.
- [x] Browser setup/start/restart/save/Continue/settings memory for 5×5, 10×10, 16×16, 30×16, 40×30, 40×5, 5×30 and 25×20 / 80 mines.
- [x] Empty/letters/decimals/negative/zero/oversized fields, width/height-dependent mine clamping, rapid step buttons.
- [x] Right flag/unflag, opened-cell no-op, correct target after zoom/pan, no right-drag pan, native contextmenu prevention on board and no prevention outside it, terminal input lock.
- [x] Custom loss review, result tap, same-config Play again, complete Custom win, no standard record pollution or score submission.
- [x] Custom setup fits 360×640, 390×844 and 412×915 without horizontal scrolling. Screenshots inspected.
- [x] Custom 40×30 at 390×844: Fit, native Chromium pinch, pan, long press on correct cell, Flag mode, tap, portrait/landscape preservation and Fit recovery.
- [x] Existing gameplay, save/SDK contract and 18 camera viewport/difficulty scenarios remain covered by the full browser runner. No related browser page/console errors in the added suites.

Physical Android/iPhone, Safari/WebKit and the actual Playables host remain a manual validation gate. These results use Chromium (including native CDP touch events), not physical devices. Custom best-time leaderboards are intentionally not implemented; preset records are preserved.

## Localization and mobile page scroll (2026-09-28)

Runtime changes: `js/i18n.js` (new), `index.html`, `css/game.css`, `js/main.js`, `js/ui.js`, `js/custom.js`, `js/save.js`. Documentation: `README.md`, `testing.md`. New tests: `tests/i18n.test.js`, `tests/i18n-scroll-browser.mjs`. The board engine, game state machine, input gestures, camera math and YouTube adapter are unchanged.

Locale selection uses the first nonempty navigator.languages entry, then navigator.language, normalized to a base locale. Supported: en/uk/ru. Unsupported primary languages use English. Manual settings.language overrides Auto, persists through the existing v1 save adapter and safely defaults for older/invalid saves. Native language names and product brands intentionally retain their spelling. Mine counts use Intl.PluralRules, including 1/2/5/10/11/21/22/25. Live language changes update text and ARIA without replacing cells or the camera; the timer stays paused during Settings and resumes normally afterward.

Scroll audit: the reported complete menu-scroll lock was **not reproduced** in the supplied local baseline. At 390×844, Chromium had scrollHeight 881 and could scroll 37px. No global touch-action:none or touchmove/wheel preventDefault existed; gesture listeners were already scoped to board-viewport. Identified layout weaknesses were shared fixed html/body height, only safe-area bottom padding (zero on ordinary viewports), and no modal background scroll lock. The implementation removes shared fixed sizing, gives Home natural height and bottom breathing room, confines dynamic viewport sizing to Game, and allows page scrolling in exceptionally short game containers. Only an open dialog temporarily locks document overflow; dialog content scrolls internally. Safe-area insets constrain page and modal edges. Home/Game transitions reset page scroll deliberately; language changes and difficulty selection do not.

Verified:

- 37 unit/contract tests passed, including locale normalization, fallback/preference order, manual/Auto selection, dictionary completeness/interpolation, pluralization and language persistence/migration.
- Full existing Chromium browser suite passed: gameplay/input/save/pause, SDK fixture lifecycle/audio/storage/scores, 18 camera/preset/viewport combinations, native pinch/pan/hold, two-stage loss and all Custom cases.
- Chromium and WebKit 26.5 passed seven device locales: en-US, en-GB, uk-UA, uk, ru-RU, ru, de-DE.
- Both engines passed live en/uk/ru/Auto changes, exact board/timer/camera preservation while Settings is open, persisted override after reload and saved-game Continue.
- Responsive layouts tested: 390×844, 393×852, 844×390, 852×393, 360×640, 320×568 and 390×600. No horizontal page overflow. Custom inputs/Start/Cancel and Settings Done reachable; modal bounds fit the viewport and background scroll remains unchanged while scrolling the dialog.
- At 390×280, the game document can scroll outside the board. Board drag pans without revealing cells or scrolling the document.
- Native mobile scrolling was injected through Chromium touch events. Mobile WebKit does not expose native swipe/wheel injection through this test API: its scroll geometry was checked with DOM scroll operations, and board drag with mouse events. This distinction is intentional.
- Ukrainian Home, Custom and Game screenshots inspected, including narrow/landscape layouts. The running app's localized Settings was also inspected through the desktop browser UI.
- The same new browser suite passed against the extracted release ZIP served under `/minevia/`, checking relative module/asset paths as used by GitHub Pages. No page/console errors in these scenarios.
- Static text audit found all normal UI copy marked for translation; dynamic labels, help, storage notices and accessibility descriptions use the centralized dictionary. The no-JavaScript message is trilingual by necessity.
- Deterministic release validation passed: 16 runtime files, 36,906-byte ZIP. The new i18n module is packaged automatically; archive/test outputs remain ignored by Git.

Remaining physical-device gate: actual iPhone Safari top/bottom browser chrome, real notch/home-indicator insets, keyboard/gesture interaction and the real YouTube Playables host. Emulated WebKit and viewport resizing do not certify those physical behaviors. No known failing automated checks remain.


## Strict Menu/Game scroll modes and gesture audio recovery (2026-09-28)

This supersedes the earlier allowance for document scrolling outside the board on short game screens. The cause was explicit: no Game-only document lock, plus a 360px minimum game height. `UI.setPageMode` now centrally applies menu-mode/game-mode to html/body and the existing is-playing app class. Menu retains native document scrolling. Game uses fixed body positioning, hidden overflow, overscroll-behavior:none and dynamic height with a percentage fallback; the old minimum is removed. Board sizing still uses ResizeObserver. Returning Home removes the lock and resets scroll. Modal closure never clears game-mode, so loss/win/settings backgrounds stay locked. Input/camera/game engine and localization logic are unchanged; no global touchmove preventDefault was added.

Audio audit found no external audio files or paths: tones are synthesized. The previous implementation first created/resumed its context inside play (including a long-press timeout), ignored completion of resume, immediately scheduled oscillators while potentially suspended, and suspended the context during every mute/pause. No explicit lifecycle/unlock state existed. These are verified code defects; a physical iPhone's exact failure was not remotely observed.

The replacement creates one context synchronously in trusted passive gesture listeners, awaits successful resume before sound scheduling, handles suspended/interrupted states, retries on later gestures and never requires a separate enable button. Effects cannot autoplay or replay after a long-delayed resume. Mute/pause stops sources rather than racing suspend/resume. State is checked on visibilitychange, pageshow and game resume; only the next user gesture resumes audio. Existing YouTube mute and SFX settings remain authoritative; local fallback stays enabled. There are no separate Music or master-volume settings.

Verification:
- 41 unit/contract tests passed, including delayed/rejected/hung resume, running-only playback, mute during resume, single context and stale-effect suppression.
- Full existing Chromium gameplay, SDK/audio mute, camera, loss and Custom suite passed.
- Chromium/WebKit real AudioContexts tested in desktop and mobile modes: no pre-gesture context, Start → running without sound, reveal/flag/loss oscillators scheduled only while running, actual context.suspend + pageshow followed by gesture recovery, SFX mute/unmute, one context and refresh unlock. Test-only traces showed WebKit initial suspended → resume → running. No production debug logging remains.
- Localization/scroll tests cover 390×844, 393×852, 844×390, 852×393, 360×640, 320×568, 390×600 and short Game 390×280. Game stays at scrollY=0, controls fit, board drag moves only the board. Returning Home restores scrolling; Custom 40×30 and Settings preserve the lock.
- Chromium uses native touch injection; mobile WebKit scroll tests verify geometry via scroll operations because this automation API cannot inject native swipe. Existing native Chromium pinch/long-press/pan tests remain passing.
- Release ZIP regenerated with 16 runtime files. Local nested /minevia/ preview checks relative paths without modifying or deploying the public GitHub Pages site.

Limits: physical iPhone/Android, audible speaker output, Safari hardware silent switch, real browser chrome/bounce and actual YouTube host still require device testing. Playwright WebKit is not a physical iPhone or installed desktop Safari. Tests simulate lifecycle interruptions and exercise real AudioContext.suspend; they do not claim an actual device background/foreground test.
