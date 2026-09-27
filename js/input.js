const TAP_MOVE_THRESHOLD = 9;
const HOLD_DELAY = 430;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export class Input {
  constructor(viewport, grid, { act, tap, focus, getBoard, enabled, navigable, flagMode, getCamera, cameraChanged }) {
    this.viewport = viewport; this.grid = grid;
    this.actions = { act, tap, focus, getBoard, enabled, navigable, flagMode, getCamera, cameraChanged };
    this.pointers = new Map(); this.gesture = null; this.pinch = null; this.timer = null;
    viewport.addEventListener('pointerdown', e => this.down(e));
    viewport.addEventListener('pointermove', e => this.move(e));
    viewport.addEventListener('pointerup', e => this.up(e));
    viewport.addEventListener('pointercancel', e => this.up(e, true));
    viewport.addEventListener('lostpointercapture', e => {
      if (this.pointers.has(e.pointerId)) this.up(e, true);
    });
    viewport.addEventListener('wheel', e => this.wheel(e), { passive: false });
    // Suppress the browser's menu only on the board, not HUD/document controls.
    grid.addEventListener('contextmenu', e => e.preventDefault());
    grid.addEventListener('click', e => {
      // Keyboard/assistive-technology clicks have no pointer gesture. Native touch
      // clicks are ignored; pointerup is the single gameplay commit point.
      if (e.detail === 0 && !e.pointerType && e.target.closest('[data-index]') && this.actions.navigable())
        this.actions.tap(Number(e.target.closest('[data-index]').dataset.index));
    });
    grid.addEventListener('keydown', e => this.key(e));
  }
  point(e) {
    const rect = this.viewport.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  cancelHold() {
    clearTimeout(this.timer); this.timer = null;
    this.gesture?.cell?.classList.remove('holding');
  }
  cancelTap() { this.cancelHold(); if (this.gesture) this.gesture.suppressed = true; }
  startPinch() {
    this.cancelTap(); this.gesture = null;
    const pair = [...this.pointers.entries()].slice(0, 2);
    if (pair.length !== 2) { this.pinch = null; return; }
    const [a, b] = pair.map(([, p]) => p), c = this.actions.getCamera();
    const middle = midpoint(a, b);
    this.pinch = { ids: pair.map(([id]) => id), distance: Math.max(1, distance(a, b)),
      scale: c.scale, world: c.toWorld(middle.x, middle.y) };
  }
  down(e) {
    if (!this.actions.navigable() || (e.button !== 0 && e.button !== 2)) return;
    e.preventDefault();
    const p = this.point(e); this.pointers.set(e.pointerId, p);
    this.viewport.setPointerCapture(e.pointerId);
    if (this.pointers.size >= 2) { this.startPinch(); return; }
    this.cancelHold();
    const index = this.actions.getCamera().hit(p.x, p.y);
    this.gesture = { id: e.pointerId, index, start: p, last: p, dragging: false, held: false,
      suppressed: false, right: e.button === 2, cell: index < 0 ? null : this.grid.querySelector(`[data-index="${index}"]`) };
    if (e.pointerType !== 'mouse' && e.button === 0 && index >= 0) {
      if (this.actions.enabled()) this.gesture.cell.classList.add('holding');
      this.timer = setTimeout(() => {
        const g = this.gesture;
        if (!g || g.dragging || g.suppressed || this.pointers.size !== 1) return;
        this.cancelHold(); g.held = true; g.suppressed = true;
        if (this.actions.enabled()) this.actions.act(g.index, true);
      }, HOLD_DELAY);
    }
  }
  move(e) {
    if (!this.pointers.has(e.pointerId)) return;
    const p = this.point(e); this.pointers.set(e.pointerId, p);
    if (this.pinch) {
      const [a, b] = this.pinch.ids.map(id => this.pointers.get(id));
      if (a && b) {
        this.actions.getCamera().place(this.pinch.scale * distance(a, b) / this.pinch.distance,
          this.pinch.world, midpoint(a, b));
        this.actions.cameraChanged();
      }
      return;
    }
    const g = this.gesture; if (!g || g.id !== e.pointerId) return;
    if (!g.dragging && distance(p, g.start) > TAP_MOVE_THRESHOLD) {
      g.dragging = true; this.cancelTap();
      // Include the threshold movement instead of making the camera jump later.
      this.actions.getCamera().pan(p.x - g.start.x, p.y - g.start.y);
    } else if (g.dragging) this.actions.getCamera().pan(p.x - g.last.x, p.y - g.last.y);
    g.last = p;
    if (g.dragging) this.actions.cameraChanged();
  }
  up(e, cancelled = false) {
    if (!this.pointers.has(e.pointerId)) return;
    const g = this.gesture;
    if (!cancelled && !this.pinch && g?.id === e.pointerId) {
      const p = this.point(e), index = this.actions.getCamera().hit(p.x, p.y);
      if (!g.suppressed && !g.dragging && !g.held && distance(p, g.start) <= TAP_MOVE_THRESHOLD &&
          index >= 0 && index === g.index && this.actions.navigable()) {
        this.actions.focus(index, false); this.actions.tap(index, g.right);
      }
    }
    this.cancelHold(); this.pointers.delete(e.pointerId);
    if (this.viewport.hasPointerCapture(e.pointerId)) this.viewport.releasePointerCapture(e.pointerId);
    this.gesture = null; this.pinch = null;
    if (this.pointers.size >= 2) this.startPinch();
    else if (this.pointers.size === 1) {
      const [id, p] = [...this.pointers.entries()][0];
      // A surviving finger continues panning, but can never become a tap/hold.
      this.gesture = { id, start: p, last: p, dragging: true, suppressed: true, index: -1 };
    }
  }
  wheel(e) {
    if (!this.actions.navigable()) return;
    e.preventDefault(); this.reset();
    const p = this.point(e), unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.viewport.clientHeight : 1;
    this.actions.getCamera().zoom(Math.exp(-Math.max(-300, Math.min(300, e.deltaY * unit)) * .002), p.x, p.y);
    this.actions.cameraChanged();
  }
  reset() {
    this.cancelHold(); const ids = [...this.pointers.keys()];
    this.pointers.clear(); this.gesture = null; this.pinch = null;
    for (const id of ids) if (this.viewport.hasPointerCapture(id)) this.viewport.releasePointerCapture(id);
  }
  key(e) {
    if (!this.actions.navigable()) return;
    const cell = e.target.closest('[data-index]'); if (!cell) return;
    const i = Number(cell.dataset.index), b = this.actions.getBoard(), x = i % b.cols, y = Math.floor(i / b.cols);
    const moves = { ArrowLeft: y * b.cols + Math.max(0, x - 1), ArrowRight: y * b.cols + Math.min(b.cols - 1, x + 1),
      ArrowUp: Math.max(0, y - 1) * b.cols + x, ArrowDown: Math.min(b.rows - 1, y + 1) * b.cols + x,
      Home: y * b.cols, End: y * b.cols + b.cols - 1 };
    if (Object.hasOwn(moves, e.key)) { e.preventDefault(); this.actions.focus(moves[e.key], true); }
    else if ([' ', 'Enter', 'f', 'F'].includes(e.key)) {
      e.preventDefault();
      if (e.repeat) return;
      if (e.key.toLowerCase() === 'f') { if (this.actions.enabled()) this.actions.act(i, true); }
      else this.actions.tap(i, false, e.key === 'Enter');
    }
  }
}
