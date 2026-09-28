import assert from 'node:assert/strict';
const geometry = page => page.evaluate(() => {
  const b=document.getElementById('board'), v=document.getElementById('board-viewport');
  const r=b.getBoundingClientRect(), p=v.getBoundingClientRect(), m=new DOMMatrix(getComputedStyle(b).transform);
  return { board:{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom},
    view:{x:p.x,y:p.y,width:p.width,height:p.height,right:p.right,bottom:p.bottom},scale:m.a,x:m.e,y:m.f };
});
export const checkFit = async page => {
  const g=await geometry(page), {board:b,view:v}=g;
  assert.ok(v.width>0&&v.height>0,'nonzero board viewport');
  assert.ok(b.x>=v.x-1&&b.y>=v.y-1&&b.right<=v.right+1&&b.bottom<=v.bottom+1,`not fitted: ${JSON.stringify(g)}`);
  assert.ok(g.scale>0&&g.scale<=1);
  return g;
};
const state = page => page.evaluate(() => [...document.querySelectorAll('.cell')].map(c=>c.dataset.kind));
export const middleCell = async page => page.evaluate(() => {
  const v=document.getElementById('board-viewport').getBoundingClientRect();
  const candidates=[...document.querySelectorAll('.cell')].filter(c=>!c.classList.contains('open')&&!c.classList.contains('flagged')).map(c=>({c,r:c.getBoundingClientRect()})).filter(({r})=>r.x>=v.x+10&&r.y>=v.y+10&&r.right<=v.right-10&&r.bottom<=v.bottom-10);
  candidates.sort((a,b)=>Math.hypot(a.r.x-v.x-v.width/2,a.r.y-v.y-v.height/2)-Math.hypot(b.r.x-v.x-v.width/2,b.r.y-v.y-v.height/2));
  const {c,r}=candidates[0]; return {index:Number(c.dataset.index),x:r.x+r.width/2,y:r.y+r.height/2};
});
export async function runCameraChecks(browser,out) {
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:3});
  const p=await context.newPage(), errors=[];
  p.on('pageerror',e=>errors.push(e.message));
  p.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
  await p.route('https://www.youtube.com/game_api/v1',r=>r.fulfill({contentType:'text/javascript',body:''}));
  await p.goto('http://127.0.0.1:8080'); await p.locator('#home').waitFor({state:'visible'});
  const sizes=[[390,844],[360,640],[412,915],[768,1024],[1920,1080],[844,390]];
  for(const [width,height] of sizes) {
    await p.setViewportSize({width,height});
    for(const level of ['beginner','intermediate','expert']) {
      await p.click(`[data-level=${level}]`); await p.click('#new-game');
      await p.waitForTimeout(40); await checkFit(p);
      const initial=await state(p);
      for(let i=0;i<4;i++) await p.click('#zoom-in');
      const zoomed=await geometry(p);await p.click('#zoom-out');
      assert.ok((await geometry(p)).scale<zoomed.scale);
      await p.click('#fit');await checkFit(p);assert.deepEqual(await state(p),initial);
      const layout=await p.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:innerWidth,
        controls:document.getElementById('flag-mode').getBoundingClientRect().bottom,height:innerHeight,
        sizes:[...document.querySelectorAll('.zoom-controls button')].map(b=>({w:b.offsetWidth,h:b.offsetHeight})),
        cell:getComputedStyle(document.querySelector('.cell')).width}));
      assert.ok(layout.scroll<=layout.width,'horizontal document overflow');
      assert.ok(layout.controls<=layout.height,'controls below screen');
      assert.ok(layout.sizes.every(s=>s.w>=44&&s.h>=44),'44px controls');
      assert.equal(layout.cell,'44px');
      if(level==='expert') await p.screenshot({path:`${out}camera-expert-${width}x${height}.png`});
      await p.click('#menu');
    }
  }
  await p.setViewportSize({width:390,height:844});
  await p.click('[data-level=expert]');await p.click('#new-game');await p.waitForTimeout(50);
  const initial=await state(p), fitted=await checkFit(p);
  await p.evaluate(()=>{window.pointerLog=[];for(const type of ['pointerdown','pointermove','pointerup','pointercancel','lostpointercapture']) document.getElementById('board-viewport').addEventListener(type,e=>pointerLog.push({type,id:e.pointerId,x:e.clientX,y:e.clientY}));});
  const cdp=await context.newCDPSession(p);
  const touch=(type,touchPoints)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints});
  const v=fitted.view,cx=v.x+v.width/2,cy=v.y+v.height/2;
  const point=(x,y,id)=>({x,y,id});
  // The second contact cancels the first pending long press, even when held still.
  await touch('touchStart',[point(cx-32,cy,1)]);
  await touch('touchStart',[point(cx-32,cy,1),point(cx+32,cy,2)]);
  await p.waitForTimeout(480);assert.deepEqual(await state(p),initial);
  for(let span=40;span<=128;span+=16) await touch('touchMove',[point(cx-span,cy,1),point(cx+span,cy,2)]);
  await p.waitForTimeout(70); // CDP touch moves may be coalesced until the next frame.
  const pinch=await geometry(p);assert.ok(pinch.scale>fitted.scale*3.5,JSON.stringify({fitted,pinch,events:await p.evaluate(()=>pointerLog)}));
  // Continue panning with the surviving finger; lifting it must never reveal.
  // Chromium's partial-end list identifies the contact being released.
  await touch('touchEnd',[point(cx+120,cy,2)]);
  await touch('touchMove',[point(cx-80,cy+35,1)]);
  await p.waitForTimeout(70);
  await touch('touchEnd',[]);assert.deepEqual(await state(p),initial);
  assert.notEqual((await geometry(p)).x,pinch.x,JSON.stringify(await p.evaluate(()=>pointerLog)));
  // Native one-finger pan, including holding longer than the flag timeout.
  const beforePan=await geometry(p);
  await touch('touchStart',[point(cx,cy,1)]);
  await touch('touchMove',[point(cx-65,cy-30,1)]);
  await p.waitForTimeout(480);await touch('touchEnd',[]);
  assert.deepEqual(await state(p),initial);assert.notEqual((await geometry(p)).x,beforePan.x);
  // Flag the exact inverse-transformed cell, then reveal that same cell after unflagging.
  const target=await middleCell(p);
  await touch('touchStart',[point(target.x,target.y,1)]);await p.waitForTimeout(470);await touch('touchEnd',[]);
  assert.equal(await p.locator('.cell.flagged').count(),1);
  assert.equal(await p.locator(`.cell[data-index="${target.index}"]`).getAttribute('data-kind'),'flagged');
  assert.equal(await p.locator('.cell.open').count(),0);
  await touch('touchStart',[point(target.x,target.y,1)]);await p.waitForTimeout(470);await touch('touchEnd',[]);
  await touch('touchStart',[point(target.x,target.y,1)]);await touch('touchEnd',[]);
  assert.ok((await p.locator(`.cell[data-index="${target.index}"]`).getAttribute('data-kind')).includes('open'));
  await p.waitForTimeout(1200);
  const activeState=await state(p),time=await p.locator('#time').textContent();
  const flagTarget=await middleCell(p);
  await p.locator(`.cell[data-index="${flagTarget.index}"]`).click({button:'right'});
  const flaggedState=await state(p);
  const beforeRotate=await geometry(p);
  const center={x:(beforeRotate.view.width/2-beforeRotate.x)/beforeRotate.scale,y:(beforeRotate.view.height/2-beforeRotate.y)/beforeRotate.scale};
  await p.setViewportSize({width:844,height:390});await p.waitForTimeout(60);
  assert.deepEqual(await state(p),flaggedState);
  const rotated=await geometry(p);
  assert.ok(Math.abs((rotated.view.width/2-rotated.x)/rotated.scale-center.x)<1,'manual world center X preserved');
  assert.ok(Math.abs((rotated.view.height/2-rotated.y)/rotated.scale-center.y)<1,'manual world center Y preserved');
  await p.setViewportSize({width:390,height:844});await p.waitForTimeout(60);
  assert.deepEqual(await state(p),flaggedState);
  assert.ok(await p.locator('#time').textContent()>=time);
  // Pinch inward all the way to dynamic fit minimum, without modifying cells.
  await touch('touchStart',[point(cx-130,cy,1),point(cx+130,cy,2)]);
  for(let span=110;span>=10;span-=20)await touch('touchMove',[point(cx-span,cy,1),point(cx+span,cy,2)]);
  await touch('touchEnd',[]);await checkFit(p);assert.deepEqual(await state(p),flaggedState);
  // Wheel and +/- use cursor/viewport center respectively, not board origin.
  for(let i=0;i<8;i++)await p.click('#zoom-in');
  const beforeWheel=await geometry(p),mx=cx-20,my=cy+25;
  const world={x:(mx-v.x-beforeWheel.x)/beforeWheel.scale,y:(my-v.y-beforeWheel.y)/beforeWheel.scale};
  await p.mouse.move(mx,my);await p.mouse.wheel(0,-100);await p.waitForTimeout(100);
  const afterWheel=await geometry(p);assert.ok(afterWheel.scale>beforeWheel.scale);
  assert.ok(Math.abs((mx-v.x-afterWheel.x)/afterWheel.scale-world.x)<1);
  assert.ok(Math.abs((my-v.y-afterWheel.y)/afterWheel.scale-world.y)<1);
  await p.click('#fit');await checkFit(p);assert.deepEqual(await state(p),flaggedState);
  // Cancellation, including lost capture, never commits a pending tap/hold.
  await touch('touchStart',[point(cx,cy,1)]);await touch('touchCancel',[]);
  await p.waitForTimeout(470);assert.deepEqual(await state(p),flaggedState);
  assert.equal(await p.locator('#fatal').isVisible(),false);assert.deepEqual(errors,[]);
  await p.screenshot({path:out+'camera-expert-progress.png'});
  console.log('PASS: camera 18 difficulty/viewport combinations; Expert 390x844 pinch, inward fit, pan, remaining finger, long press, precise reveal, wheel anchor, orientation state/center preservation, cancellation and console.');
  await context.close();
}
