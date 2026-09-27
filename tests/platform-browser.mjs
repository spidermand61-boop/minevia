import assert from 'node:assert/strict';
export const sdkScript = `
window.testCalls = []; window.testEvents = {}; window.testSaved = ''; window.testScores = [];
window.ytgame = { IN_PLAYABLES_ENV: true,
 game: {
  firstFrameReady() { testCalls.push(['frame', !document.getElementById('loading').hidden]); },
  gameReady() { testCalls.push(['ready', document.getElementById('loading').hidden && !document.getElementById('app').hidden]); },
  async loadData() { testCalls.push(['load']); return window.initialSave || ''; },
  async saveData(s) { testSaved = s; testCalls.push(['save']); }
 },
 system: {
  isAudioEnabled() { return false; },
  onPause(fn) { testEvents.pause = fn; return () => {}; },
  onResume(fn) { testEvents.resume = fn; return () => {}; },
  onAudioEnabledChange(fn) { testEvents.audio = fn; return () => {}; }
 }, engagement: { async sendScore(v) { testScores.push(v.value); } }, health: { logWarning() {} }
};
`;
export async function runPlatformChecks(browser, out) {
  const context = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const p = await context.newPage(); const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error('Production accessed local storage'); };
    Storage.prototype.setItem = () => { throw new Error('Production accessed local storage'); };
    window.audioStarts = 0;
    const Original = window.AudioContext;
    window.AudioContext = class extends Original {
      createOscillator() { window.audioStarts++; return super.createOscillator(); }
    };
  });
  await p.route('https://www.youtube.com/game_api/v1', r => r.fulfill({ contentType: 'text/javascript', body: sdkScript }));
  await p.goto('http://127.0.0.1:8080');
  await p.locator('#home').waitFor({ state: 'visible' });
  assert.deepEqual(await p.evaluate(() => testCalls), [['frame', true], ['load'], ['ready', true]]);
  await p.click('#new-game'); await p.locator('.cell').nth(40).click();
  assert.equal(await p.evaluate(() => audioStarts), 0);
  await p.waitForFunction(() => JSON.parse(testSaved).current.generated);
  await p.evaluate(() => testEvents.pause());
  const frozen = await p.locator('#time').textContent();
  const open = await p.locator('.cell.open').count();
  await p.locator('.cell:not(.open)').first().evaluate(el => el.click());
  await p.waitForTimeout(1150);
  assert.equal(await p.locator('#time').textContent(), frozen);
  assert.equal(await p.locator('.cell.open').count(), open);
  assert.equal(await p.locator('#app').evaluate(el => el.inert), true);
  await p.evaluate(() => testEvents.resume());
  // User pause remains effective across a platform pause/resume pair.
  await p.click('#pause'); await p.evaluate(() => { testEvents.pause(); testEvents.resume(); });
  assert.equal(await p.locator('#modal').evaluate(el => el.open), true);
  await p.click('#resume');
  await p.evaluate(() => testEvents.audio(true));
  const snapshot = await p.evaluate(() => JSON.parse(testSaved));
  const mines = [...snapshot.current.cells].map(v => Number(v) & 1);
  const closedSafe = mines.findIndex((m, i) => !m && !(Number(snapshot.current.cells[i]) & 2));
  await p.locator('.cell').nth(closedSafe).click();
  assert.ok(await p.evaluate(() => audioStarts > 0));
  await p.evaluate(() => testEvents.audio(false));
  const audioCount = await p.evaluate(() => audioStarts);
  // Fully solve a known test board to verify result UI, stats, bests, and score ordering.
  await p.evaluate(mines => {
    for (let i = 0; i < mines.length; i++) if (!mines[i]) document.querySelectorAll('.cell')[i].click();
  }, mines);
  await p.locator('#again').waitFor();
  assert.equal(await p.locator('#modal-title').textContent(), 'You win!');
  await p.waitForFunction(() => testScores.length > 0);
  const win = await p.evaluate(() => ({ saved: JSON.parse(testSaved), scores: testScores, starts: audioStarts }));
  assert.equal(win.saved.stats.gamesWon, 1); assert.equal(win.saved.stats.gamesPlayed, 1);
  assert.equal(win.saved.current, null); assert.ok(win.saved.bestTimes.beginner >= 0);
  assert.equal(win.starts, audioCount);
  assert.equal(win.scores.at(-1), 1000000 + Math.max(0, 999999 - Math.floor(win.saved.bestTimes.beginner / 1000)));
  await p.screenshot({ path: out + 'win-result.png', fullPage: true });
  await p.click('#again'); await p.locator('.cell').nth(40).click();
  await p.waitForFunction(() => JSON.parse(testSaved).current?.generated);
  const mine = await p.evaluate(() => [...JSON.parse(testSaved).current.cells].findIndex(v => Number(v) & 1));
  await p.locator('.cell').nth(mine).click();
  assert.equal(await p.locator('#modal').evaluate(el => el.open), false);
  await p.locator('.cell').nth(mine).click();
  assert.equal(await p.locator('#modal-title').textContent(), 'Game over.');
  assert.equal(await p.locator('.cell.mine').count(), 10);
  assert.equal(await p.locator('.cell.exploded').count(), 1);
  await p.click('#view-field'); await p.screenshot({ path: out + 'lose-field.png', fullPage: true });
  assert.deepEqual(errors, []);
  await context.close();
  // Corrupt and future saves should show a playable menu, without overwriting a future schema.
  for (const initial of ['{broken', '{"version":99}']) {
    const q = await browser.newPage();
    await q.addInitScript(value => window.initialSave = value, initial);
    await q.route('https://www.youtube.com/game_api/v1', r => r.fulfill({ contentType: 'text/javascript', body: sdkScript }));
    await q.goto('http://127.0.0.1:8080'); await q.click('#new-game');
    assert.equal(await q.locator('.cell').count(), 81);
    if (initial.includes('99')) assert.equal(await q.evaluate(() => testSaved), '');
    await q.close();
  }
  console.log('PASS: SDK lifecycle order, production storage isolation, pause/resume, layered pauses, audio mute, win/lose UI, stats/bests/score, corrupted and future save handling.');
}
