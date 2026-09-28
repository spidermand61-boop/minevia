import { Board } from './board.js';
export class Game {
  constructor(difficulty, now = () => performance.now(), customConfig) {
    this.board = new Board(difficulty, customConfig); this.now = now; this.elapsed = 0;
    this.startedAt = null; this.pauses = new Set(); this.lossStage = null;
  }
  // Board outcome stays terminal; presentation stages are transient, never resumable saves.
  get state() { return this.board.state === 'lost' ? this.lossStage : this.board.state; }
  showGameOver() {
    if (this.paused || this.state !== 'lost-reveal') return false;
    this.lossStage = 'game-over'; return true;
  }
  reviewLoss() { if (this.state === 'game-over') this.lossStage = 'lost-reveal'; }
  get time() { return this.elapsed + (this.startedAt === null ? 0 : Math.max(0, this.now() - this.startedAt)); }
  get paused() { return this.pauses.size > 0; }
  stopClock() { this.elapsed = this.time; this.startedAt = null; }
  pause(reason) { this.stopClock(); this.pauses.add(reason); }
  resume(reason) {
    this.pauses.delete(reason);
    if (!this.paused && this.board.state === 'playing' && this.startedAt === null) this.startedAt = this.now();
  }
  act(index, flag = false) {
    if (this.paused) return { changed: false };
    const before = this.board.state;
    const changed = flag ? this.board.flag(index) : this.board.reveal(index).length > 0;
    if (!changed) return { changed: false };
    if (before === 'ready' && this.board.generated) this.startedAt = this.now();
    if (['won', 'lost'].includes(this.board.state)) this.stopClock();
    if (before !== 'lost' && this.board.state === 'lost') this.lossStage = 'lost-reveal';
    return { changed: true, started: before === 'ready' && this.board.generated,
      ended: before !== this.board.state && ['won', 'lost'].includes(this.board.state), flag };
  }
  serialize() { return { ...this.board.serialize(), elapsed: Math.floor(this.time) }; }
  static restore(data, now) {
    const board = Board.restore(data);
    if (!board || !Number.isFinite(data.elapsed) || data.elapsed < 0 || data.elapsed > 31536000000 ||
        (!board.generated && data.elapsed !== 0)) return null;
    const g = new Game(data.difficulty, now, data.customConfig); g.board = board; g.elapsed = data.elapsed;
    g.pause('menu'); return g;
  }
}
export function formatTime(ms) {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
export function scoreFor(difficulty, ms) {
  const weight = { beginner: 1, intermediate: 2, expert: 3 }[difficulty];
  if (!weight) return 0;
  return weight * 1000000 + Math.max(0, 999999 - Math.floor(ms / 1000));
}
export function bestScore(bestTimes) {
  return Math.max(0, ...Object.entries(bestTimes).filter(([, t]) => t !== null).map(([d, t]) => scoreFor(d, t)));
}
