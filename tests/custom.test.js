import test from 'node:test';
import assert from 'node:assert/strict';
import { Board } from '../js/board.js';
import { Game, scoreFor, bestScore } from '../js/game.js';
import { defaults, parseSave } from '../js/save.js';
import { DEFAULT_CUSTOM, validCustom, maxCustomMines } from '../js/config.js';
import { Camera } from '../js/camera.js';
const sizes=[[5,5],[10,10],[16,16],[30,16],[40,30],[40,5],[5,30]];
const rng=seed=>()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
test('custom configuration bounds reject empty, fractional, non-finite, negative and oversized values',()=>{
  assert.ok(validCustom(DEFAULT_CUSTOM));
  for(const value of [undefined,null,NaN,Infinity,-1,0,4,41,5.5,'5','']) assert.equal(validCustom({...DEFAULT_CUSTOM,width:value}),false);
  for(const value of [undefined,null,NaN,Infinity,-1,0,4,31,5.5,'5','']) assert.equal(validCustom({...DEFAULT_CUSTOM,height:value}),false);
  for(const value of [undefined,null,NaN,Infinity,-1,0,248,5.5,'5',''])assert.equal(validCustom({...DEFAULT_CUSTOM,mines:value}),false);
  assert.throws(()=>new Board('custom',{width:40,height:30,mines:1192}));
  assert.equal(maxCustomMines(5,5),16);assert.equal(maxCustomMines(40,30),1191);
});
for(const [width,height] of sizes){
  test(`custom ${width}x${height}: placement, safety, flags, flood, chord, outcomes, timer, restore and fit`,()=>{
    const size=width*height;
    for(const mines of [1,Math.floor(size*.2),maxCustomMines(width,height)])for(const first of [0,Math.floor(height/2)*width+Math.floor(width/2),size-1]){
      const b=new Board('custom',{width,height,mines});b.reveal(first,rng(first+mines));
      assert.equal(b.mines.reduce((a,n)=>a+n,0),mines);
      for(const n of [first,...b.neighbors(first)])assert.equal(b.mines[n],0);
      assert.equal(b.counts[first],0);
    }
    const config={width,height,mines:Math.floor(size*.2)};
    let now=0;const g=new Game('custom',()=>now,config);
    g.act(1,true);g.act(0);now=2500;assert.equal(g.time,2500);assert.equal(g.board.flags[1],1);
    const saved=g.serialize(),restored=Game.restore(saved,()=>now);assert.ok(restored);
    assert.deepEqual(restored.serialize(),saved);assert.deepEqual(restored.board.customConfig,config);
    assert.equal(restored.board.mineCount,config.mines);assert.equal(restored.time,2500);
    g.act(1,true);
    for(let i=0;i<size;i++)if(!g.board.mines[i])g.act(i);
    assert.equal(g.state,'won');const end=g.time;now=10000;assert.equal(g.time,end);
    assert.equal(g.act(0,true).changed,false);
    const lose=new Game('custom',()=>now,config);lose.act(1,true);lose.act(0);
    lose.act(lose.board.mines.indexOf(1));assert.equal(lose.state,'lost-reveal');assert.equal(lose.showGameOver(),true);
    const restart=new Game('custom',undefined,lose.board.customConfig);assert.deepEqual(restart.board.customConfig,config);assert.equal(restart.state,'ready');
    const chord=new Board('custom',config);chord.generate(0,rng(9));
    const number=Array.from(chord.counts).findIndex((n,i)=>n>0&&!chord.mines[i]);
    chord.openMany([number]);for(const n of chord.neighbors(number))if(chord.mines[n])chord.flag(n);
    chord.chord(number);assert.notEqual(chord.state,'lost');assert.ok(chord.neighbors(number).every(n=>chord.flags[n]||chord.opened[n]));
    const c=new Camera(width,height);c.resize(350,500);assert.ok(c.boardWidth*c.scale<=326+.001);assert.ok(c.boardHeight*c.scale<=476+.001);
    c.zoom(2);c.pan(100,-100);c.fit();assert.ok(c.offsetX>=0&&c.offsetY>=0);
  });
}
test('custom version-1 persistence preserves config and isolates preset records',()=>{
  const s=defaults(),config={width:25,height:20,mines:80};
  const g=new Game('custom',undefined,config);g.act(1,true);g.act(0);
  s.settings.difficulty='custom';s.lastCustomConfig=config;s.current=g.serialize();
  const parsed=parseSave(JSON.stringify(s)).data;assert.deepEqual(parsed,s);
  assert.equal(scoreFor('custom',100),0);assert.equal(bestScore({...s.bestTimes,custom:100}),0);
  assert.equal(Game.restore({...s.current,customConfig:{...config,mines:81}}),null);
  assert.equal(Game.restore({...s.current,customConfig:null}),null);
  const legacy=defaults();delete legacy.lastCustomConfig;assert.deepEqual(parseSave(JSON.stringify(legacy)).data.lastCustomConfig,DEFAULT_CUSTOM);
  assert.deepEqual(parseSave(JSON.stringify({...s,lastCustomConfig:{width:1}})).data.lastCustomConfig,DEFAULT_CUSTOM);
});
