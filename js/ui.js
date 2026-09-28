import { t, minesText } from './i18n.js';
import { LEVELS } from './board.js';
import { Camera, BASE_CELL_SIZE, CELL_GAP, BOARD_PADDING } from './camera.js';
import { formatTime } from './game.js';
const paths = {
  flag: '<path d="M6 21V3m0 1c4-4 8 4 13 0v10c-5 4-9-4-13 0"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="3"/>',
  restart: '<path d="M4 10a8 8 0 1 1 1 7M4 4v6h6"/>',
  settings: '<path d="m9 3-1 3-3 1-2 4 2 2v4l4 3 3-1 3 1 4-3v-4l2-2-2-4-3-1-1-3z"/><circle cx="12" cy="12" r="3"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  back: '<path d="M20 12H4m6-6-6 6 6 6"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6"/>',
  trophy: '<path d="M7 3h10v6a5 5 0 0 1-10 0zm0 2H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4M12 14v6m-5 1h10"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 8a3 3 0 0 1 6 1c0 2-3 2-3 5m0 3v.1"/>',
  mine: '<circle cx="12" cy="12" r="5" fill="currentColor"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4M5 5l3 3m8 8 3 3M5 19l3-3m8-8 3-3"/>',
  cross: '<path d="m6 6 12 12M18 6 6 18"/>',
  play: '<path d="m8 4 12 8-12 8z"/>'
};
export const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ''}</svg>`;
export const $ = id => document.getElementById(id);
export class UI {
  constructor() {
    document.querySelectorAll('[data-icon]').forEach(el => el.innerHTML = icon(el.dataset.icon));
    this.cells = []; this.camera = null; this.focusIndex = 0;
    this.modal = $('modal'); this.dismiss = null;
    this.modal.addEventListener('cancel', event => { event.preventDefault(); this.dismiss?.(); });
    this.resize = new ResizeObserver(() => {
      if (!document.body.classList.contains('platform-paused')) this.layout();
    });
    this.resize.observe($('board-viewport'));
  }
  setPageMode(mode) {
    const playing = mode === 'game';
    const changed = document.body.classList.contains('game-mode') !== playing;
    for (const element of [document.documentElement, document.body]) {
      element.classList.toggle('game-mode', playing);
      element.classList.toggle('menu-mode', !playing);
    }
    $('app').classList.toggle('is-playing', playing);
    if (changed) window.scrollTo(0, 0);
  }
  home(data, selected, canContinue) {
    this.setPageMode('menu');
    $('home').hidden = false; $('play').hidden = true;
    document.querySelectorAll('[data-level]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.level === selected)));
    const best = data.bestTimes[selected] ?? null;
    $('home-best').textContent = selected === 'custom' ? t("Your field. Your challenge.") : best === null ? t("Make your first mark") : `${t(LEVELS[selected].name)} · ${formatTime(best)}`;
    $('continue').hidden = !canContinue;
    $('home-stats').textContent = data.stats.gamesPlayed ? t('{won} won · {played} played', { won: data.stats.gamesWon, played: data.stats.gamesPlayed }) : t("A fresh field. A fresh start.");
  }
  createBoard(game) {
    const b = game.board; this.board = b; this.camera = new Camera(b.cols, b.rows); this.focusIndex = 0;
    const grid = $('board'); grid.replaceChildren(); this.cells = [];
    grid.style.setProperty('--cell', `${BASE_CELL_SIZE}px`);
    grid.style.setProperty('--gap', `${CELL_GAP}px`);
    grid.style.setProperty('--board-padding', `${BOARD_PADDING}px`);
    grid.style.setProperty('--cols', b.cols); grid.style.setProperty('--rows', b.rows);
    grid.setAttribute('aria-rowcount', b.rows); grid.setAttribute('aria-colcount', b.cols);
    for (let y = 0; y < b.rows; y++) {
      const row = document.createElement('div'); row.className = 'board-row'; row.setAttribute('role', 'row');
      for (let x = 0; x < b.cols; x++) {
        const i = y * b.cols + x, cell = document.createElement('button');
        cell.className = 'cell'; cell.dataset.index = i; cell.setAttribute('role', 'gridcell');
        cell.setAttribute('aria-rowindex', y + 1); cell.setAttribute('aria-colindex', x + 1);
        cell.tabIndex = i === 0 ? 0 : -1; this.cells.push(cell); row.append(cell);
      }
      grid.append(row);
    }
    this.render(game, true);
  }
  showGame(game, best) {
    this.setPageMode('game');
    $('home').hidden = true; $('play').hidden = false;
    const b = game.board;
    $('level-name').textContent = t(b.name); $('level-meta').textContent = `${b.cols} × ${b.rows} · ${minesText(b.mineCount)}`;
    $('game-best').textContent = best === null ? '—' : formatTime(best);
    this.layout(); this.render(game);
  }
  layout() {
    if (!this.camera || $('play').hidden) return;
    const viewport = $('board-viewport');
    if (this.camera.resize(viewport.clientWidth, viewport.clientHeight)) {
      this.onCameraResize?.(); this.applyCamera();
    }
  }
  applyCamera() {
    const c = this.camera; if (!c?.valid) return;
    $('board').style.transform = `translate(${c.offsetX}px, ${c.offsetY}px) scale(${c.scale})`;
    $('zoom-out').disabled = c.scale <= c.minScale + 1e-8;
    $('zoom-in').disabled = c.scale >= c.maxScale - 1e-8;
  }
  zoom(factor) { this.camera?.zoom(factor); this.applyCamera(); }
  fit() { this.camera?.fit(); this.applyCamera(); }
  render(game, initial = false) {
    const b = game.board, lost = b.state === 'lost';
    $('game-hint').textContent = lost ? t("Mines revealed · Explore the field · Tap for results") : t("Tap to reveal · Hold to flag · Pinch to zoom · Drag to explore");
    $('board').classList.toggle('won', b.state === 'won');
    $('mines').textContent = b.state === 'won' ? '0' : String(b.mineCount - b.flagCount);
    this.time(game.time);
    for (let i = 0; i < b.size; i++) {
      const cell = this.cells[i], open = Boolean(b.opened[i]);
      const flag = Boolean(b.flags[i]) || (b.state === 'won' && b.mines[i]);
      const mine = lost && b.mines[i], wrong = lost && flag && !b.mines[i];
      const kind = wrong ? 'wrong' : mine ? 'mine' : flag ? 'flagged' : open ? `open n${b.counts[i]}` : '';
      const content = wrong ? icon('cross') : mine ? icon(flag ? 'flag' : 'mine') : flag ? icon('flag') : open && b.counts[i] ? String(b.counts[i]) : '';
      if (cell.dataset.kind !== kind) {
        const changed = !initial && cell.dataset.kind !== undefined;
        cell.className = `cell ${kind}${i === b.exploded ? ' exploded' : ''}${changed && open ? ' just-opened' : ''}${changed && flag ? ' just-flagged' : ''}`;
        cell.innerHTML = content; cell.dataset.kind = kind;
      }
      const status = wrong ? t("Incorrect flag") : mine ? flag ? t("Correctly flagged mine") : t("Mine") : flag ? t("Flagged") : open ? b.counts[i] ? t('Adjacent: {mines}', { mines: minesText(b.counts[i]) }) : t("Empty") : t("Closed");
      cell.setAttribute('aria-label', t('Row {row}, column {column}: {status}', { row: Math.floor(i / b.cols) + 1, column: i % b.cols + 1, status }));
    }
  }
  time(ms) { $('time').textContent = formatTime(ms); }
  focus(i, ensureVisible = true) {
    this.cells[this.focusIndex]?.setAttribute('tabindex', '-1'); this.focusIndex = i;
    this.cells[i].tabIndex = 0; this.cells[i].focus({ preventScroll: true });
    if (ensureVisible) { this.camera?.ensureVisible(i); this.applyCamera(); }
  }
  announce(text) { $('announcement').textContent = text; }
  dialog(html, onDismiss) {
    this.dismiss = onDismiss; $('modal-content').innerHTML = html;
    if (!this.modal.open) {
      document.documentElement.classList.add('modal-open');
      this.modal.showModal();
    }
  }
  close() { this.dismiss = null; this.modal.close(); document.documentElement.classList.remove('modal-open'); }
  notice(key) { this.noticeKey = key; $('storage-notice').hidden = !key; $('storage-notice').textContent = key ? t(key) : ''; }
}
