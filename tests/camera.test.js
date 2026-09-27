import test from 'node:test';
import assert from 'node:assert/strict';
import { Camera, BASE_CELL_SIZE, CELL_GAP, BOARD_PADDING, MAX_SCALE } from '../js/camera.js';
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const fits = c => {
  assert.ok(c.offsetX >= 0 && c.offsetY >= 0);
  assert.ok(c.offsetX + c.boardWidth * c.scale <= c.width + 1e-7);
  assert.ok(c.offsetY + c.boardHeight * c.scale <= c.height + 1e-7);
};
test('all difficulties fit both axes, including expert below scale 0.5', () => {
  for (const [cols, rows] of [[9,9],[16,16],[30,16]]) for (const [w,h] of [[350,590],[320,395],[372,660],[728,780],[1040,800],[804,215],[1,1]]) {
    const c = new Camera(cols, rows); c.resize(w,h); fits(c);
    assert.ok(c.scale > 0 && c.scale <= 1);
    c.zoom(1e9); near(c.scale, MAX_SCALE); c.fit(); fits(c); assert.equal(c.manual, false);
  }
  const expert = new Camera(30,16); expert.resize(350,590); assert.ok(expert.minScale < .5);
});
test('cursor zoom and moving pinch midpoint preserve anchored world point away from bounds', () => {
  const c = new Camera(30,16); c.resize(390,500); c.zoom(4);
  const world = c.toWorld(185,260); c.zoom(1.2,185,260);
  near(c.toWorld(185,260).x, world.x); near(c.toWorld(185,260).y, world.y);
  c.place(c.scale * 1.4,world,{x:210,y:280});
  near(c.toWorld(210,280).x,world.x); near(c.toWorld(210,280).y,world.y);
});
test('pan bounds center small axes and retain reachable large board edges', () => {
  const c = new Camera(30,16); c.resize(390,650);
  c.pan(1e9,-1e9); fits(c);
  c.zoom(6); c.pan(1e9,1e9); near(c.offsetX,c.padding); near(c.offsetY,c.padding);
  c.pan(-1e9,-1e9); near(c.offsetX,c.width-c.padding-c.boardWidth*c.scale);
  near(c.offsetY,c.height-c.padding-c.boardHeight*c.scale);
});
test('screen hit tests invert camera, exclude border/gaps and remain accurate at all scales', () => {
  const c = new Camera(30,16); c.resize(390,650);
  for (const scale of [c.minScale,.5,1,2.5]) for (const index of [0,14,29,225,479]) {
    const pitch = BASE_CELL_SIZE+CELL_GAP;
    const world = {x:BOARD_PADDING+(index%30)*pitch+22,y:BOARD_PADDING+Math.floor(index/30)*pitch+22};
    c.place(scale,world,{x:195,y:325});
    const x = c.offsetX+world.x*c.scale, y=c.offsetY+world.y*c.scale;
    assert.equal(c.hit(x,y),index);
  }
  c.fit(); assert.equal(c.hit(-1,50),-1); assert.equal(c.hit(c.offsetX+1,c.offsetY+1),-1);
  assert.equal(c.hit(c.offsetX+(BOARD_PADDING+45)*c.scale,c.offsetY+(BOARD_PADDING+22)*c.scale),-1);
});
test('resize refits automatic camera, preserves manual world center and clamps scale', () => {
  const c=new Camera(30,16); c.resize(390,600); c.resize(844,190); fits(c);
  c.resize(390,600); c.zoom(5); const center=c.toWorld(195,300);
  c.resize(844,190); near(c.toWorld(422,95).x,center.x); near(c.toWorld(422,95).y,center.y);
  c.resize(390,600); near(c.toWorld(195,300).x,center.x); near(c.toWorld(195,300).y,center.y);
});
test('zero/invalid viewport and zoom never corrupt camera; resize recovers', () => {
  const c=new Camera(30,16); c.resize(390,600); const old=JSON.stringify(c);
  for(const [w,h] of [[0,0],[-1,5],[5,Infinity],[NaN,5]]) assert.equal(c.resize(w,h),false);
  c.zoom(0);c.zoom(NaN);c.zoom(Infinity); assert.equal(JSON.stringify(c),old);
  c.resize(844,250);fits(c);
});
test('keyboard focus can bring offscreen cells into the transformed viewport', () => {
  const c=new Camera(30,16);c.resize(390,600);c.zoom(6);c.ensureVisible(479);
  const x=c.offsetX+(BOARD_PADDING+29*47)*c.scale,y=c.offsetY+(BOARD_PADDING+15*47)*c.scale;
  assert.ok(x>=0&&y>=0);assert.ok(x+44*c.scale<=390);assert.ok(y+44*c.scale<=600);
});
