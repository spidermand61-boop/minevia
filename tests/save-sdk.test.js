import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSave, defaults, SaveStore } from '../js/save.js';
import { YouTubeAdapter } from '../js/youtube.js';
import { Game } from '../js/game.js';
function fakeSdk() {
  const calls = [], events = {};
  const sdk = { IN_PLAYABLES_ENV: true,
    game: { firstFrameReady: () => calls.push('frame'), gameReady: () => calls.push('ready'),
      loadData: async () => { calls.push('load'); return ''; }, saveData: async s => calls.push(['save', JSON.parse(s)]) },
    system: { isAudioEnabled: () => false, ...Object.fromEntries(['onPause', 'onResume', 'onAudioEnabledChange'].map(k => [k, fn => { events[k] = fn; return () => delete events[k]; }])) },
    engagement: { sendScore: async v => calls.push(['score', v]) }, health: { logWarning() {} } };
  return { sdk, calls, events };
}
test('default, corrupt, malformed and newer-version saves are safe', () => {
  assert.deepEqual(parseSave('').data, defaults());
  assert.deepEqual(parseSave('broken').data, defaults());
  assert.equal(parseSave('{"version":2}').writable, false);
  const s = defaults(); s.settings.sound = 'true'; s.settings.difficulty = '__proto__';
  s.bestTimes.expert = -1; s.stats.gamesWon = 4; s.current = { cells: 'bad' };
  assert.deepEqual(parseSave(JSON.stringify(s)).data, defaults());
});
test('compact game save round trips flags, board and elapsed', () => {
  const g = new Game('expert'); g.act(0); const i = g.board.opened.findIndex(v => !v); g.act(i, true); g.pause('user');
  const s = defaults(); s.current = g.serialize(); const parsed = parseSave(JSON.stringify(s));
  assert.deepEqual(parsed.data.current, s.current); assert.ok(JSON.stringify(s).length < 2000);
});
test('SDK sequence and callback signatures match official API', async () => {
  const { sdk, calls, events } = fakeSdk(); const a = new YouTubeAdapter(sdk);
  assert.equal(a.audioEnabled, false); await assert.rejects(() => a.save('{}'));
  a.firstFrameReady(); await a.load(); a.gameReady(); await a.save('{"version":1}'); await a.score(123);
  assert.deepEqual(calls.slice(0, 3), ['frame', 'load', 'ready']);
  assert.deepEqual(calls[4], ['score', { value: 123 }]);
  events.onAudioEnabledChange(true); assert.equal(a.audioEnabled, true);
  events.onPause(); assert.equal(a.paused, true); events.onResume(); assert.equal(a.paused, false);
  a.dispose(); assert.deepEqual(events, {});
});
test('failed cloud load prevents ALL saves and does not access dev storage', async () => {
  const { sdk, calls } = fakeSdk(); sdk.game.loadData = async () => { throw new Error('offline'); };
  const a = new YouTubeAdapter(sdk), store = new SaveStore(a); await store.load(); store.schedule(true);
  assert.equal(a.loaded, false); assert.equal(store.writable, false); assert.equal(calls.length, 0);
});
test('serialized writes coalesce and score follows successful cloud save', async () => {
  const { sdk, calls } = fakeSdk(); let release;
  sdk.game.saveData = s => new Promise(resolve => { calls.push(['save', JSON.parse(s)]); release = resolve; });
  const store = new SaveStore(new YouTubeAdapter(sdk)); await store.load();
  store.data.stats.gamesPlayed = 1; store.schedule(true);
  store.data.stats.gamesPlayed = 2; store.data.bestTimes.beginner = 1500; store.schedule(true);
  assert.equal(calls.filter(c => c[0] === 'save').length, 1);
  release(); await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(calls.filter(c => c[0] === 'save').length, 2);
  release(); await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(calls.at(-1), ['score', { value: 1999998 }]);
});
test('failed save is retained and retried on next change without a retry loop', async () => {
  const { sdk } = fakeSdk(); let fail = true, writes = 0;
  sdk.game.saveData = async () => { writes++; if (fail) throw new Error('offline'); };
  const store = new SaveStore(new YouTubeAdapter(sdk)); await store.load(); store.schedule(true);
  await new Promise(resolve => setTimeout(resolve, 10)); assert.equal(writes, 1); assert.ok(store.pending);
  fail = false; store.data.stats.gamesPlayed = 1; store.schedule(true);
  await new Promise(resolve => setTimeout(resolve, 10)); assert.equal(writes, 2); assert.equal(store.pending, null);
});
test('pause flushes the latest snapshot after an in-flight write, without sending scores', async () => {
  const { sdk, calls } = fakeSdk(); let release;
  sdk.game.saveData = s => new Promise(resolve => { calls.push(['save', JSON.parse(s)]); release = resolve; });
  const store = new SaveStore(new YouTubeAdapter(sdk)); await store.load(); store.schedule(true);
  store.data.stats.gamesPlayed = 3; store.pause();
  release(); await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(calls.filter(c => c[0] === 'save').length, 2);
  assert.equal(calls.at(-1)[1].stats.gamesPlayed, 3);
  release(); await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(calls.some(c => c[0] === 'score'), false);
});
