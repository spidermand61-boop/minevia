import { customSetup } from './custom.js';
import { Game, formatTime, scoreFor, bestScore } from './game.js';
import { YouTubeAdapter } from './youtube.js';
import { SaveStore } from './save.js';
import { UI, $, icon } from './ui.js';
import { Input } from './input.js';
import { ZOOM_STEP } from './camera.js';
import { Audio } from './audio.js';

const adapter = new YouTubeAdapter();
const audio = new Audio();
const ui = new UI();
let pendingNotice = null;
const store = new SaveStore(adapter, text => {
  if (adapter.paused) pendingNotice = text; else ui.notice(text);
});
let game = null, selected = 'beginner', flagMode = false, clock = null, inGame = false, input;
let ready = false, readySent = false;
function fatal() {
  game?.pause('error'); stopClock(); input?.reset(); audio.setEnabled(false);
  ui.close(); $('loading').hidden = true; $('fatal').hidden = false;
  adapter.warn();
}
window.addEventListener('error', event => { if (event.error) { event.preventDefault(); fatal(); } });
window.addEventListener('unhandledrejection', event => { event.preventDefault(); fatal(); });
function syncAudio() { audio.setEnabled(store.data.settings.sound && adapter.audioEnabled && !adapter.paused && !(game?.paused)); }
function stopClock() { clearTimeout(clock); clock = null; }
function tick() {
  stopClock();
  if (inGame && game && !game.paused && game.board.state === 'playing' && !adapter.paused) {
    ui.time(game.time); clock = setTimeout(tick, 200);
  }
}
function snapshot(immediate = false) {
  if (game) store.data.current = ['ready', 'playing'].includes(game.board.state) ? game.serialize() : null;
  store.schedule(immediate);
}
function pause(reason) { game?.pause(reason); stopClock(); input?.reset(); syncAudio(); }
function resume(reason) { game?.resume(reason); syncAudio(); tick(); }
function announceReady() {
  if (ready && !readySent && !adapter.paused) { readySent = true; adapter.gameReady(); }
}
adapter.subscribe(event => {
  if (event === 'pause') {
    pause('platform');
    if (game) store.data.current = ['ready', 'playing'].includes(game.board.state) ? game.serialize() : null;
    store.pause();
    document.body.classList.add('platform-paused'); $('app').inert = true; $('modal').inert = true;
  } else if (event === 'resume') {
    document.body.classList.remove('platform-paused'); $('app').inert = false; $('modal').inert = false;
    store.resume(); resume('platform'); ui.layout(); announceReady();
    if (pendingNotice !== null) { ui.notice(pendingNotice); pendingNotice = null; }
  } else syncAudio();
});
function setFlag(value) {
  flagMode = value; $('flag-mode').setAttribute('aria-pressed', String(value));
  $('flag-mode').querySelector('.mode-state').textContent = value ? 'ON' : 'OFF';
}
function openGame() {
  inGame = true; ui.close(); game.resume('menu'); game.resume('dialog'); game.resume('user');
  ui.createBoard(game); ui.showGame(game, store.data.bestTimes[game.board.difficulty] ?? null);
  syncAudio(); tick(); ui.focus(0);
}
function newGame(customConfig = store.data.lastCustomConfig) {
  game = new Game(selected, undefined, customConfig); setFlag(false); store.data.settings.difficulty = selected;
  openGame(); snapshot(true);
}
function showHome() {
  pause('menu'); snapshot(true); inGame = false; ui.close();
  ui.home(store.data, selected, Boolean(game && ['ready', 'playing'].includes(game.board.state)));
  $('new-game').focus({ preventScroll: true });
}
// Called once per completed intentional tap, separately from gameplay permission.
function tap(index, right = false, reveal = false) {
  if (!game || game.paused || adapter.paused || ui.modal.open || !inGame) return;
  if (game.state === 'lost-reveal') {
    if (!right && game.showGameOver()) showResult();
    return;
  }
  act(index, right || (!reveal && flagMode));
}
function act(index, flag) {
  if (!game || adapter.paused || ui.modal.open || !inGame) return;
  const result = game.act(index, flag); if (!result.changed) return;
  if (result.started) store.data.stats.gamesPlayed++;
  if (result.ended) {
    if (game.board.state === 'won') {
      store.data.stats.gamesWon++;
      const d = game.board.difficulty, old = store.data.bestTimes[d];
      if (d !== 'custom') store.data.bestTimes[d] = old === null ? Math.floor(game.time) : Math.min(old, Math.floor(game.time));
    }
    stopClock();
  }
  ui.render(game); audio.play(result.ended ? game.board.state : flag ? 'flag' : 'reveal');
  ui.announce(result.ended ? (game.board.state === 'won' ? 'You win! Field cleared.' : 'Mines revealed. Explore the field, then tap for your result.') :
    flag ? `${game.board.flags[index] ? 'Flag placed' : 'Flag removed'}. ${game.board.mineCount - game.board.flagCount} mines remaining.` :
      `${game.board.openCount} of ${game.board.size - game.board.mineCount} safe cells open.`);
  snapshot(result.ended || result.started); tick();
  if (result.ended && game.board.state === 'won') showResult();
}
function showResult() {
  const won = game.board.state === 'won', best = store.data.bestTimes[game.board.difficulty] ?? null;
  const close = () => { game.reviewLoss(); ui.close(); };
  ui.dialog(`<div class="dialog-icon">${icon(won ? 'trophy' : 'mine')}</div><p class="eyebrow">${game.board.name.toUpperCase()} · FIELD ${won ? 'CLEARED' : 'COMPLETE'}</p><h2 id="modal-title">${won ? 'You win!' : 'Game over.'}</h2><p>${won ? 'A clear field. A well-earned moment.' : 'One square closer to your next great game.'}</p><div class="result-stats"><div><span>TIME</span><strong>${formatTime(game.time)}</strong></div><div><span>BEST</span><strong>${best === null ? '—' : formatTime(best)}</strong></div></div>${won && game.board.difficulty !== 'custom' ? `<p>Score ${scoreFor(game.board.difficulty, game.time).toLocaleString('en-US')} · Personal high ${bestScore(store.data.bestTimes).toLocaleString('en-US')}</p>` : ''}<button id="again" class="primary">Play again ${icon('arrow')}</button><button id="view-field" class="secondary">View field</button>`, close);
  $('again').onclick = () => { selected = game.board.difficulty; newGame(game.board.customConfig); };
  $('view-field').onclick = close;
}
function pauseDialog() {
  if (!game || !inGame) return;
  pause('user'); snapshot(true);
  const close = () => { ui.close(); resume('user'); };
  ui.dialog(`<div class="dialog-icon">${icon('pause')}</div><p class="eyebrow">TAKE YOUR TIME</p><h2 id="modal-title">A little breather.</h2><p>Your field is right where you left it.</p><button id="resume" class="primary">Resume game ${icon('play')}</button><button id="pause-menu" class="secondary">Main menu</button>`, close);
  $('resume').onclick = close; $('pause-menu').onclick = showHome;
}
function confirmNew(next) {
  if (!game?.board.generated || !['playing'].includes(game.board.state)) { next(); return; }
  pause('dialog'); snapshot(true);
  const cancel = () => { ui.close(); resume('dialog'); };
  ui.dialog(`<h2 id="modal-title">A fresh field?</h2><p>This will replace your unfinished game. Your best times and statistics stay with you.</p><button id="confirm-new" class="primary">New game</button><button id="cancel-new" class="secondary">Keep playing</button>`, cancel);
  $('confirm-new').onclick = next; $('cancel-new').onclick = cancel;
}
function setupCustom() {
  customSetup(ui, store.data.lastCustomConfig, config => {
    store.data.lastCustomConfig = config; store.data.settings.difficulty = selected = 'custom';
    snapshot();
    confirmNew(() => newGame(config));
  });
}
function settings() {
  pause('dialog'); snapshot(true);
  const close = () => { ui.close(); resume('dialog'); };
  ui.dialog(`<p class="eyebrow">MAKE YOURSELF AT HOME</p><h2 id="modal-title">Settings</h2><label class="setting-row">Sound effects<input id="sound-setting" type="checkbox" ${store.data.settings.sound ? 'checked' : ''}></label><label class="setting-row">Appearance<select id="theme-setting"><option value="dark">Dark</option><option value="light">Light</option></select></label><p>${adapter.production ? 'Sound effects follow your YouTube audio setting.' : 'Progress is saved on this browser for local play.'}</p><p>${store.data.stats.gamesWon} games won · ${store.data.stats.gamesPlayed} games played<br>Personal high score: ${bestScore(store.data.bestTimes).toLocaleString('en-US')}</p><button id="settings-done" class="primary">Done</button>`, close);
  $('theme-setting').value = store.data.settings.theme;
  $('sound-setting').onchange = e => { store.data.settings.sound = e.target.checked; syncAudio(); snapshot(); };
  $('theme-setting').onchange = e => { store.data.settings.theme = e.target.value; document.documentElement.dataset.theme = e.target.value; snapshot(); };
  $('settings-done').onclick = close;
}
function howTo() {
  ui.dialog(`<p class="eyebrow">A LITTLE LOGIC GOES A LONG WAY</p><h2 id="modal-title">Find your footing.</h2><ol class="how-list"><li>Open every safe square to win. Your first reveal and its neighbors are always safe.</li><li>Each number counts the mines in the eight surrounding squares.</li><li>Right-click, hold a square, or turn on <strong>Flag mode</strong> to mark a suspected mine.</li><li>Tap an open number when its neighboring flags match it to reveal the rest. Incorrect flags can reveal a mine.</li><li>Pinch or use + and − to zoom. Drag to explore, or use the mouse wheel to zoom under the cursor. Fit shows the whole field.</li></ol><p><strong>Keyboard:</strong> arrows move, Enter reveals, Space follows Flag mode, F toggles a flag. Escape pauses.</p><button id="help-done" class="primary">Got it</button>`, () => ui.close());
  $('help-done').onclick = () => ui.close();
}
async function boot() {
  // The loading frame is already styled and laid out before notifying the host.
  adapter.firstFrameReady();
  const data = await store.load();
  if (adapter.paused) await new Promise(resolve => {
    const off = adapter.subscribe(event => { if (event === 'resume') { off(); resolve(); } });
  });
  selected = data.settings.difficulty;
  game = Game.restore(data.current);
  if (adapter.paused) { game?.pause('platform'); store.suspended = true; }
  document.documentElement.dataset.theme = data.settings.theme;
  input = new Input($('board-viewport'), $('board'), {
    act, tap, focus: (i, reveal) => ui.focus(i, reveal), getBoard: () => game.board,
    enabled: () => Boolean(inGame && game && !game.paused && !adapter.paused && !ui.modal.open && ['ready', 'playing'].includes(game.board.state)),
    flagMode: () => flagMode,
    navigable: () => Boolean(inGame && game && !game.paused && !adapter.paused && !ui.modal.open),
    getCamera: () => ui.camera, cameraChanged: () => ui.applyCamera()
  });
  ui.onCameraResize = () => input.reset();
  document.querySelectorAll('[data-level]').forEach(button => button.onclick = () => {
    selected = button.dataset.level; store.data.settings.difficulty = selected; snapshot();
    ui.home(store.data, selected, Boolean(game && ['ready', 'playing'].includes(game.board.state)));
    if (selected === 'custom') setupCustom();
  });
  $('new-game').onclick = () => selected === 'custom' ? setupCustom() : confirmNew(() => newGame());
  $('continue').onclick = openGame; $('menu').onclick = showHome;
  $('restart').onclick = () => confirmNew(() => { selected = game.board.difficulty; newGame(game.board.customConfig); });
  $('settings').onclick = settings; $('how-to').onclick = howTo; $('pause').onclick = pauseDialog;
  $('flag-mode').onclick = () => setFlag(!flagMode);
  $('zoom-in').onclick = () => { input.reset(); ui.zoom(ZOOM_STEP); };
  $('zoom-out').onclick = () => { input.reset(); ui.zoom(1 / ZOOM_STEP); };
  $('fit').onclick = () => { input.reset(); ui.fit(); };
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !ui.modal.open && !adapter.paused && inGame) { e.preventDefault(); pauseDialog(); }
  });
  // Visibility is a development-only convenience; production lifecycle uses SDK callbacks exclusively.
  if (!adapter.production) {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { pause('visibility'); snapshot(true); } else resume('visibility');
    });
    window.addEventListener('pagehide', () => { game?.stopClock(); snapshot(true); });
  }
  ui.home(data, selected, Boolean(game));
  $('loading').hidden = true; $('app').hidden = false;
  ready = true; syncAudio(); announceReady();
}
boot().catch(fatal);
