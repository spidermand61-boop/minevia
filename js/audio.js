export class Audio {
  constructor() {
    this.context = null; this.enabled = false; this.unlocked = false;
    this.nodes = new Set(); this.pending = null; this.generation = 0;
  }
  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    if (!this.enabled) {
      this.generation++;
      this.stop();
      // Muting stops sources instead of racing suspend() against a gesture resume().
    }
    this.checkState();
  }
  stop() {
    for (const node of this.nodes) { try { node.stop(); } catch {} }
    this.nodes.clear();
  }
  checkState() {
    this.unlocked = this.context?.state === 'running';
    if (!this.unlocked) this.stop();
    return this.unlocked;
  }
  // Called synchronously from a trusted gesture. Never from a lifecycle callback.
  unlock() {
    if (!this.enabled) return Promise.resolve(false);
    try {
      const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Context) return Promise.resolve(false);
      if (!this.context) {
        this.context = new Context();
        this.context.addEventListener('statechange', () => this.checkState());
      }
      if (this.checkState()) return Promise.resolve(true);
      if (this.context.state === 'closed') return Promise.resolve(false);
      // Retry each new gesture, even if a previous iOS resume promise never settled.
      // Both suspended and Safari's interrupted state need a resume.
      const resumed = this.context.resume();
      this.pending = Promise.resolve(resumed).then(() => this.checkState(), () => false);
      return this.pending;
    } catch { this.unlocked = false; return Promise.resolve(false); }
  }
  async play(kind) {
    if (!this.enabled || !this.context) return;
    const generation = this.generation;
    if (!this.checkState()) {
      if (!this.pending) return;
      // Never replay stale effects after a background interruption or slow unlock.
      let timeout;
      const running = await Promise.race([this.pending, new Promise(resolve => {
        timeout = setTimeout(() => resolve(false), 250);
      })]);
      clearTimeout(timeout);
      if (!running) return;
    }
    if (!this.enabled || generation !== this.generation || !this.checkState()) return;
    try {
      const notes = { reveal: [440], flag: [560, 700], won: [520, 660, 780], lost: [230, 180] }[kind] || [440];
      const start = this.context.currentTime;
      notes.forEach((frequency, i) => {
        const oscillator = this.context.createOscillator(), gain = this.context.createGain();
        oscillator.type = 'sine'; oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, start + i * .075);
        gain.gain.linearRampToValueAtTime(.045, start + i * .075 + .012);
        gain.gain.exponentialRampToValueAtTime(.001, start + i * .075 + .11);
        oscillator.connect(gain); gain.connect(this.context.destination);
        this.nodes.add(oscillator);
        oscillator.onended = () => { this.nodes.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(start + i * .075); oscillator.stop(start + i * .075 + .12);
      });
    } catch { this.stop(); /* A transient device error must not disable future gestures. */ }
  }
}
