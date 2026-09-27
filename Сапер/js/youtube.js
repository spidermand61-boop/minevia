// All platform access lives here. No storage fallbacks inside Playables.
const DEV_KEY = 'stillfield-dev-save-v1';
export class YouTubeAdapter {
  constructor(sdk = globalThis.ytgame) {
    this.sdk = sdk; this.production = Boolean(sdk?.IN_PLAYABLES_ENV);
    this.loaded = false; this.paused = false; this.audioEnabled = !this.production;
    this.listeners = new Set(); this.cleanup = [];
    if (this.production) {
      try { this.audioEnabled = sdk.system.isAudioEnabled(); } catch { this.audioEnabled = false; }
      this.bind('onPause', () => { this.paused = true; this.emit('pause'); });
      this.bind('onResume', () => { this.paused = false; this.emit('resume'); });
      this.bind('onAudioEnabledChange', enabled => { this.audioEnabled = Boolean(enabled); this.emit('audio'); });
    }
  }
  bind(method, callback) {
    try { const off = this.sdk.system[method](callback); if (typeof off === 'function') this.cleanup.push(off); }
    catch { this.warn(); }
  }
  emit(event) { for (const listener of this.listeners) listener(event); }
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  firstFrameReady() { if (this.production) try { this.sdk.game.firstFrameReady(); } catch { this.warn(); } }
  gameReady() { if (this.production) try { this.sdk.game.gameReady(); } catch { this.warn(); } }
  warn() { if (this.production) try { this.sdk.health?.logWarning(); } catch { /* Best effort. */ } }
  async load() {
    let raw;
    if (this.production) {
      let timer;
      try {
        raw = await Promise.race([this.sdk.game.loadData(), new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('Cloud load timed out')), 8000);
        })]);
      } finally { clearTimeout(timer); }
    } else {
      try { raw = globalThis.localStorage?.getItem(DEV_KEY) ?? ''; }
      catch { throw new Error('Development storage unavailable'); }
    }
    this.loaded = true; return raw;
  }
  async save(raw) {
    if (!this.loaded) throw new Error('Save requires successful load');
    if (this.production) await this.sdk.game.saveData(raw);
    else globalThis.localStorage.setItem(DEV_KEY, raw);
  }
  async score(value) {
    if (this.production && !this.paused && this.loaded && value > 0) {
      try { await this.sdk.engagement.sendScore({ value }); return true; } catch { this.warn(); return false; }
    }
    return !this.production;
  }
  dispose() { for (const off of this.cleanup) off(); this.listeners.clear(); }
}
