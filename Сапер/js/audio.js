export class Audio {
  constructor() { this.context = null; this.enabled = false; this.nodes = new Set(); }
  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      for (const node of this.nodes) { try { node.stop(); } catch {} }
      this.nodes.clear();
      this.context?.suspend().catch(() => {});
    }
  }
  play(kind) {
    if (!this.enabled) return;
    try {
      const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Context) return;
      this.context ??= new Context();
      void this.context.resume().catch(() => {});
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
    } catch { this.enabled = false; }
  }
}
