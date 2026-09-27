import test from 'node:test';
import assert from 'node:assert/strict';
import { Board, LEVELS } from '../js/board.js';
import { Game, scoreFor } from '../js/game.js';
const random = seed => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
test('all levels: 300 seeded safe openings, counts, neighbors, deterministic generation', () => {
  for (const d of Object.keys(LEVELS)) for (let seed = 0; seed < 100; seed++) {
    const b = new Board(d), first = seed % b.size; b.reveal(first, random(seed));
    assert.equal(b.mines.reduce((a, v) => a + v, 0), b.mineCount);
    assert.equal(b.counts[first], 0); assert.equal(b.mines[first], 0);
    for (let i = 0; i < b.size; i++) assert.equal(b.counts[i], b.neighbors(i).reduce((a, n) => a + b.mines[n], 0));
    const twin = new Board(d); twin.reveal(first, random(seed)); assert.deepEqual(b.mines, twin.mines);
  }
});
test('flags before opening never generate mines; flagged cells block reveal', () => {
  const b = new Board(); b.flag(0); assert.deepEqual(b.reveal(0), []); assert.equal(b.generated, false);
  b.flag(0); assert.equal(b.flagCount, 0); b.reveal(0, random(1)); assert.equal(b.opened[0], 1);
  assert.equal(b.flag(0), false); assert.equal(b.flag(-1), false);
});
test('flood fill opens connected zeros, leaves flags closed, and detects win', () => {
  const b = new Board(); b.flag(1); b.reveal(0, random(2)); assert.equal(b.opened[1], 0);
  b.flag(1);
  for (let i = 0; i < b.size; i++) if (!b.mines[i]) b.reveal(i);
  assert.equal(b.state, 'won'); assert.equal(b.openCount, 71); assert.equal(b.flag(5), false);
});
test('mine hit loses and further input is ignored', () => {
  const b = new Board(); b.reveal(0, random(9)); const mine = b.mines.indexOf(1);
  b.reveal(mine); assert.equal(b.state, 'lost'); assert.equal(b.exploded, mine); assert.deepEqual(b.reveal(80), []);
});
test('correct chord reveals neighbors; incorrect flags can lose', () => {
  for (const wrong of [false, true]) {
    const b = new Board(); b.generate(0, random(3));
    const i = Array.from(b.counts).findIndex((n, i) => n === 1 && !b.mines[i]); b.openMany([i]);
    const near = b.neighbors(i), mine = near.find(n => b.mines[n]);
    b.flag(wrong ? near.find(n => !b.mines[n] && !b.opened[n]) : mine);
    b.chord(i); assert.equal(b.state === 'lost', wrong);
    if (!wrong) assert.ok(near.every(n => b.flags[n] || b.opened[n]));
  }
});
test('pause reasons compose; elapsed time and restore exclude paused duration', () => {
  let t = 100; const g = new Game('expert', () => t); g.act(0, true); assert.equal(g.time, 0);
  g.act(0, true); g.act(0); t += 2100; assert.equal(g.time, 2100);
  g.pause('user'); g.pause('platform'); t += 9000; g.resume('platform'); assert.equal(g.time, 2100);
  g.resume('user'); t += 1000; assert.equal(g.time, 3100);
  const restored = Game.restore(g.serialize(), () => t); assert.equal(restored.time, 3100);
  assert.equal(restored.paused, true); restored.resume('menu'); t += 500; assert.equal(restored.time, 3600);
});
test('save validation rejects corruption and impossible cells', () => {
  const g = new Game('beginner'); g.act(40); const s = g.serialize(); assert.ok(Game.restore(s));
  for (const patch of [{ cells: 'x' }, { cols: 1000 }, { elapsed: NaN }, { difficulty: '__proto__' }, { state: 'won' }])
    assert.equal(Game.restore({ ...s, ...patch }), null);
  assert.equal(Game.restore({ ...s, cells: '7'.repeat(81) }), null);
});
test('faster wins yield higher integer scores within difficulty', () => {
  assert.ok(scoreFor('expert', 2000) > scoreFor('expert', 3000));
  assert.ok(Number.isSafeInteger(scoreFor('beginner', 99999999)));
});
test('loss review is terminal until a separate result transition; restart resets it', () => {
  let time=0; const g=new Game('beginner',()=>time); g.act(40);time=4000;
  const mine=g.board.mines.indexOf(1);const result=g.act(mine);
  assert.equal(result.ended,true);assert.equal(g.state,'lost-reveal');assert.equal(g.time,4000);
  const snapshot=g.serialize();time=10000;
  assert.equal(g.act(0).changed,false);assert.equal(g.act(0,true).changed,false);
  assert.deepEqual(g.serialize(),snapshot);assert.equal(Game.restore(snapshot),null);
  g.pause('platform');assert.equal(g.showGameOver(),false);g.resume('platform');
  assert.equal(g.showGameOver(),true);assert.equal(g.state,'game-over');assert.equal(g.showGameOver(),false);
  assert.equal(g.time,4000);g.reviewLoss();assert.equal(g.state,'lost-reveal');
  const next=new Game('beginner');assert.equal(next.state,'ready');assert.equal(next.time,0);
});
