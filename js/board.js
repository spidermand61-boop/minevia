import { DEFAULT_CUSTOM, validCustom, copyCustom } from './config.js';
export const LEVELS = Object.freeze({
  beginner: { name: 'Beginner', cols: 9, rows: 9, mines: 10 },
  intermediate: { name: 'Intermediate', cols: 16, rows: 16, mines: 40 },
  expert: { name: 'Expert', cols: 30, rows: 16, mines: 99 }
});
export const isLevel = key => key === 'custom' || Object.hasOwn(LEVELS, key);

export class Board {
  constructor(difficulty = 'beginner', customConfig = DEFAULT_CUSTOM) {
    if (!isLevel(difficulty)) throw new Error('Unknown difficulty');
    this.difficulty = difficulty;
    if (difficulty === 'custom' && !validCustom(customConfig)) throw new Error('Invalid custom configuration');
    this.customConfig = difficulty === 'custom' ? copyCustom(customConfig) : null;
    const config = this.customConfig ? { name: 'Custom', cols: customConfig.width, rows: customConfig.height, mines: customConfig.mines } : LEVELS[difficulty];
    this.name = config.name; this.cols = config.cols; this.rows = config.rows;
    this.size = this.cols * this.rows;
    this.mines = new Uint8Array(this.size);
    this.opened = new Uint8Array(this.size);
    this.flags = new Uint8Array(this.size);
    this.counts = new Uint8Array(this.size);
    this.mineCount = config.mines;
    this.generated = false;
    this.state = 'ready';
    this.exploded = -1;
    this.openCount = 0;
    this.flagCount = 0;
  }
  valid(i) { return Number.isInteger(i) && i >= 0 && i < this.size; }
  neighbors(i) {
    const out = [], x = i % this.cols, y = Math.floor(i / this.cols);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      if (x + dx >= 0 && x + dx < this.cols && y + dy >= 0 && y + dy < this.rows)
        out.push((y + dy) * this.cols + x + dx);
    }
    return out;
  }
  generate(first, random = Math.random) {
    const safe = new Set([first, ...this.neighbors(first)]);
    const pool = Array.from({ length: this.size }, (_, i) => i).filter(i => !safe.has(i));
    // Partial Fisher-Yates: uniform placement without retries or duplicates.
    for (let i = 0; i < this.mineCount; i++) {
      const r = Math.max(0, Math.min(0.999999999999, random()));
      const j = i + Math.floor(r * (pool.length - i));
      [pool[i], pool[j]] = [pool[j], pool[i]];
      this.mines[pool[i]] = 1;
    }
    this.recount();
    this.generated = true;
    this.state = 'playing';
  }
  recount() {
    this.counts.fill(0);
    for (let i = 0; i < this.size; i++) if (this.mines[i])
      for (const n of this.neighbors(i)) this.counts[n]++;
  }
  flag(i) {
    if (!this.valid(i) || this.opened[i] || ['won', 'lost'].includes(this.state)) return false;
    this.flags[i] ^= 1;
    this.flagCount += this.flags[i] ? 1 : -1;
    return true;
  }
  reveal(i, random = Math.random) {
    if (!this.valid(i) || this.flags[i] || ['won', 'lost'].includes(this.state)) return [];
    if (this.opened[i]) return this.chord(i);
    if (!this.generated) this.generate(i, random);
    return this.openMany([i]);
  }
  chord(i) {
    if (!this.opened[i] || !this.counts[i] || this.state !== 'playing') return [];
    const around = this.neighbors(i);
    if (around.reduce((sum, n) => sum + this.flags[n], 0) !== this.counts[i]) return [];
    return this.openMany(around.filter(n => !this.flags[n] && !this.opened[n]));
  }
  openMany(seeds) {
    const queue = [...seeds], changed = [];
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head];
      if (this.opened[i] || this.flags[i]) continue;
      this.opened[i] = 1;
      changed.push(i);
      if (this.mines[i]) { this.exploded = i; this.state = 'lost'; break; }
      this.openCount++;
      if (this.counts[i] === 0) for (const n of this.neighbors(i))
        if (!this.opened[n] && !this.flags[n]) queue.push(n);
    }
    if (this.state !== 'lost' && this.openCount === this.size - this.mineCount) this.state = 'won';
    return changed;
  }
  serialize() {
    return { difficulty: this.difficulty, cols: this.cols, rows: this.rows,
      generated: this.generated, state: this.state,
      ...(this.customConfig ? { customConfig: copyCustom(this.customConfig) } : {}),
      // Each cell is one ASCII digit: mine bit 1, open bit 2, flag bit 4.
      cells: Array.from(this.mines, (v, i) => v + 2 * this.opened[i] + 4 * this.flags[i]).join('') };
  }
  static restore(data) {
    if (!data || !isLevel(data.difficulty)) return null;
    if (data.difficulty === 'custom' && !validCustom(data.customConfig)) return null;
    const b = new Board(data.difficulty, data.customConfig);
    if (data.cols !== b.cols || data.rows !== b.rows || typeof data.cells !== 'string' ||
        data.cells.length !== b.size || !/^[0-7]+$/.test(data.cells) ||
        typeof data.generated !== 'boolean' || !['ready', 'playing'].includes(data.state)) return null;
    for (let i = 0; i < b.size; i++) {
      const v = Number(data.cells[i]);
      b.mines[i] = v & 1; b.opened[i] = (v >> 1) & 1; b.flags[i] = (v >> 2) & 1;
      if (b.opened[i] && (b.mines[i] || b.flags[i])) return null;
      b.openCount += b.opened[i]; b.flagCount += b.flags[i];
    }
    const total = b.mines.reduce((a, v) => a + v, 0);
    if (data.generated ? (total !== b.mineCount || data.state !== 'playing' || b.openCount === 0 ||
        b.openCount >= b.size - b.mineCount) : (total !== 0 || b.openCount !== 0 || data.state !== 'ready')) return null;
    b.generated = data.generated; b.state = data.state; b.recount();
    return b;
  }
}
