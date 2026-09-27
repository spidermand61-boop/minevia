import { isLevel } from './board.js';
import { Game, bestScore } from './game.js';
export const defaults = () => ({ version: 1, settings: { sound: true, difficulty: 'beginner', theme: 'dark' },
  bestTimes: { beginner: null, intermediate: null, expert: null }, stats: { gamesPlayed: 0, gamesWon: 0 }, current: null });
const validTime = n => Number.isFinite(n) && n >= 0 && n <= 31536000000;
export function parseSave(raw) {
  const clean = defaults();
  if (!raw) return { data: clean, writable: true };
  let data;
  try { data = JSON.parse(raw); } catch { return { data: clean, writable: true }; }
  if (!data || typeof data !== 'object') return { data: clean, writable: true };
  // A newer schema is readable only in a future release; never overwrite it.
  if (data.version !== 1) return { data: clean, writable: false };
  if (typeof data.settings?.sound === 'boolean') clean.settings.sound = data.settings.sound;
  if (isLevel(data.settings?.difficulty)) clean.settings.difficulty = data.settings.difficulty;
  if (['dark', 'light'].includes(data.settings?.theme)) clean.settings.theme = data.settings.theme;
  for (const d of Object.keys(clean.bestTimes)) if (validTime(data.bestTimes?.[d])) clean.bestTimes[d] = data.bestTimes[d];
  for (const k of Object.keys(clean.stats)) if (Number.isSafeInteger(data.stats?.[k]) && data.stats[k] >= 0) clean.stats[k] = data.stats[k];
  clean.stats.gamesWon = Math.min(clean.stats.gamesWon, clean.stats.gamesPlayed);
  const restored = Game.restore(data.current);
  if (restored) clean.current = restored.serialize();
  return { data: clean, writable: true };
}
export class SaveStore {
  constructor(adapter, notice = () => {}) {
    this.adapter = adapter; this.notice = notice; this.data = defaults(); this.writable = false;
    this.timer = null; this.pending = null; this.writing = false; this.suspended = false;
    this.lastScore = 0; this.finalFlush = false; this.failed = false;
  }
  async load() {
    try {
      const parsed = parseSave(await this.adapter.load()); this.data = parsed.data; this.writable = parsed.writable;
      if (!this.writable) this.notice('This save belongs to a newer version. You can play, but this session will not be saved.');
    } catch {
      this.notice('Saved progress is unavailable. This session will not be saved. Reload to try again.');
    }
    return this.data;
  }
  schedule(immediate = false) {
    if (!this.writable) return;
    this.pending = JSON.stringify(this.data);
    clearTimeout(this.timer); this.timer = null;
    if (this.suspended && !immediate) return;
    if (immediate) void this.flush();
    else this.timer = setTimeout(() => { this.timer = null; void this.flush(); }, 350);
  }
  async flush() {
    clearTimeout(this.timer); this.timer = null;
    if (this.writing || !this.pending || !this.writable) return;
    const payload = this.pending; this.pending = null; this.writing = true; this.finalFlush = false;
    try {
      await this.adapter.save(payload);
      if (this.failed) { this.failed = false; this.notice(''); }
      const score = bestScore(JSON.parse(payload).bestTimes);
      // Scores follow acknowledged saves, so platform and saved bests agree.
      if (!this.suspended && score > this.lastScore) { if (await this.adapter.score(score)) this.lastScore = score; }
    } catch {
      if (!this.pending) this.pending = payload;
      this.failed = true;
      this.notice('Progress could not be saved. We’ll try again after your next move.');
    } finally {
      this.writing = false;
      // Coalesce newer snapshots, but never run a background retry loop.
      if (this.pending && this.pending !== payload && (!this.suspended || this.finalFlush)) void this.flush();
    }
  }
  pause() { this.suspended = true; this.finalFlush = true; this.schedule(true); }
  resume() { this.suspended = false; if (this.pending) void this.flush(); }
}
