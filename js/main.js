import { t, minesText, numberText, setLanguage, translateDOM } from './i18n.js';
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
setLanguage('auto'); translateDOM();
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
  $('flag-mode').querySelector('.mode-state').textContent = value ? t("ON") : t("OFF");
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
  ui.announce(result.ended ? (game.board.state === 'won' ? t("You win! Field cleared.") : t("Mines revealed. Explore the field, then tap for your result.")) :
    flag ? t('{action}. Remaining: {mines}.', { action: t(game.board.flags[index] ? 'Flag placed' : 'Flag removed'), mines: minesText(game.board.mineCount - game.board.flagCount) }) :
      t('{open} of {total} safe cells open.', { open: game.board.openCount, total: game.board.size - game.board.mineCount }));
  snapshot(result.ended || result.started); tick();
  if (result.ended && game.board.state === 'won') showResult();
}
function showResult() {
  const won = game.board.state === 'won', best = store.data.bestTimes[game.board.difficulty] ?? null;
  const close = () => { game.reviewLoss(); ui.close(); };
  ui.dialog(`<div class="dialog-icon">${icon(won ? 'trophy' : 'mine')}</div><p class="eyebrow">${t(game.board.name).toLocaleUpperCase()} · ${t(won ? 'FIELD CLEARED' : 'FIELD COMPLETE')}</p><h2 id="modal-title">${won ? t("You win!") : t("Game over.")}</h2><p>${won ? t("A clear field. A well-earned moment.") : t("One square closer to your next great game.")}</p><div class="result-stats"><div><span>${t("TIME")}</span><strong>${formatTime(game.time)}</strong></div><div><span>${t("BEST")}</span><strong>${best === null ? '—' : formatTime(best)}</strong></div></div>${won && game.board.difficulty !== 'custom' ? `<p>${t('Score {score} · Personal high {best}', { score: numberText(scoreFor(game.board.difficulty, game.time)), best: numberText(bestScore(store.data.bestTimes)) })}</p>` : ''}<button id="again" class="primary">${t("Play again")} ${icon('arrow')}</button><button id="view-field" class="secondary">${t("View field")}</button>`, close);
  $('again').onclick = () => { selected = game.board.difficulty; newGame(game.board.customConfig); };
  $('view-field').onclick = close;
}
function pauseDialog() {
  if (!game || !inGame) return;
  pause('user'); snapshot(true);
  const close = () => { ui.close(); resume('user'); };
  ui.dialog(`<div class="dialog-icon">${icon('pause')}</div><p class="eyebrow">${t("TAKE YOUR TIME")}</p><h2 id="modal-title">${t("A little breather.")}</h2><p>${t("Your field is right where you left it.")}</p><button id="resume" class="primary">${t("Resume game")} ${icon('play')}</button><button id="pause-menu" class="secondary">${t("Main menu")}</button>`, close);
  $('resume').onclick = close; $('pause-menu').onclick = showHome;
}
function confirmNew(next) {
  if (!game?.board.generated || !['playing'].includes(game.board.state)) { next(); return; }
  pause('dialog'); snapshot(true);
  const cancel = () => { ui.close(); resume('dialog'); };
  ui.dialog(`<h2 id="modal-title">${t("A fresh field?")}</h2><p>${t("This will replace your unfinished game. Your best times and statistics stay with you.")}</p><button id="confirm-new" class="primary">${t("New game")}</button><button id="cancel-new" class="secondary">${t("Keep playing")}</button>`, cancel);
  $('confirm-new').onclick = next; $('cancel-new').onclick = cancel;
}
function setupCustom() {
  customSetup(ui, store.data.lastCustomConfig, config => {
    store.data.lastCustomConfig = config; store.data.settings.difficulty = selected = 'custom';
    snapshot();
    confirmNew(() => newGame(config));
  });
}
function refreshLanguage() {
  setLanguage(store.data.settings.language); translateDOM(); setFlag(flagMode);
  if (inGame && game) {
    $('level-name').textContent = t(game.board.name);
    $('level-meta').textContent = `${game.board.cols} × ${game.board.rows} · ${minesText(game.board.mineCount)}`;
    ui.render(game);
  } else ui.home(store.data, selected, Boolean(game && ['ready', 'playing'].includes(game.board.state)));
  ui.notice(ui.noticeKey); ui.announce('');
}
function settings(refresh = false) {
  if (!refresh) { pause('dialog'); snapshot(true); }
  const close = () => { ui.close(); resume('dialog'); };
  ui.dialog(`<p class="eyebrow">${t("MAKE YOURSELF AT HOME")}</p><h2 id="modal-title">${t("Settings")}</h2><label class="setting-row">${t("Sound effects")}<input id="sound-setting" type="checkbox" ${store.data.settings.sound ? 'checked' : ''}></label><label class="setting-row">${t("Appearance")}<select id="theme-setting"><option value="dark">${t("Dark")}</option><option value="light">${t("Light")}</option></select></label><label class="setting-row"><span>${t("LANGUAGE")}</span><select id="language-setting"><option value="auto">${t("Auto")}</option><option value="en" lang="en">${t("English")}</option><option value="uk" lang="uk">${t("Українська")}</option><option value="ru" lang="ru">${t("Русский")}</option></select></label><p>${adapter.production ? t("Sound effects follow your YouTube audio setting.") : t("Progress is saved on this browser for local play.")}</p><p>${t('{won} won · {played} played', { won: store.data.stats.gamesWon, played: store.data.stats.gamesPlayed })}<br>${t('Personal high score: {score}', { score: numberText(bestScore(store.data.bestTimes)) })}</p><button id="settings-done" class="primary">${t("Done")}</button>`, close);
  $('theme-setting').value = store.data.settings.theme;
  $('language-setting').value = store.data.settings.language;
  $('language-setting').onchange = e => {
    store.data.settings.language = e.target.value;
    refreshLanguage(); snapshot(true);
    const scroll = ui.modal.scrollTop;
    settings(true);
    $('language-setting').focus({ preventScroll: true }); ui.modal.scrollTop = scroll;
  };
  $('sound-setting').onchange = e => { store.data.settings.sound = e.target.checked; syncAudio(); snapshot(); };
  $('theme-setting').onchange = e => { store.data.settings.theme = e.target.value; document.documentElement.dataset.theme = e.target.value; snapshot(); };
  $('settings-done').onclick = close;
}
function howTo() {
  ui.dialog(`<p class="eyebrow">${t("A LITTLE LOGIC GOES A LONG WAY")}</p><h2 id="modal-title">${t("Find your footing.")}</h2><ol class="how-list"><li>${t("Open every safe square to win. Your first reveal and its neighbors are always safe.")}</li><li>${t("Each number counts the mines in the eight surrounding squares.")}</li><li>${t("Right-click, hold a square, or turn on Flag mode to mark a suspected mine.")}</li><li>${t("Tap an open number when its neighboring flags match it to reveal the rest. Incorrect flags can reveal a mine.")}</li><li>${t("Pinch or use + and − to zoom. Drag to explore, or use the mouse wheel to zoom under the cursor. Fit shows the whole field.")}</li></ol><p>${t("Keyboard: arrows move, Enter reveals, Space follows Flag mode, F toggles a flag. Escape pauses.")}</p><button id="help-done" class="primary">${t("Got it")}</button>`, () => ui.close());
  $('help-done').onclick = () => ui.close();
}
async function boot() {
  // The loading frame is already styled and laid out before notifying the host.
  adapter.firstFrameReady();
  const data = await store.load();
  if (adapter.paused) await new Promise(resolve => {
    const off = adapter.subscribe(event => { if (event === 'resume') { off(); resolve(); } });
  });
  setLanguage(data.settings.language); translateDOM(); ui.notice(ui.noticeKey);
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
  $('settings').onclick = () => settings(); $('how-to').onclick = howTo; $('pause').onclick = pauseDialog;
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
