import assert from 'node:assert/strict';
import { sdkScript } from './platform-browser.mjs';
import { checkFit, middleCell } from './camera-browser.mjs';
const getSave=p=>p.evaluate(()=>JSON.parse(testSaved));
const kinds=p=>p.locator('.cell').evaluateAll(cells=>cells.map(c=>c.dataset.kind));
async function setup(p,w,h,m) {
  await p.click('[data-level=custom]');
  await p.fill('#custom-width',String(w));await p.fill('#custom-height',String(h));await p.fill('#custom-mines',String(m));
  await p.click('#custom-start');
}
export async function runCustomChecks(browser,out) {
  const context=await browser.newContext({viewport:{width:1280,height:950}}),p=await context.newPage(),errors=[];
  p.on('pageerror',e=>errors.push(e.message));p.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
  await p.route('https://www.youtube.com/game_api/v1',r=>r.fulfill({contentType:'text/javascript',body:sdkScript}));
  await p.goto('http://127.0.0.1:8080');await p.locator('#home').waitFor({state:'visible'});
  assert.equal(await p.locator('[data-level]').count(),4);
  await p.click('[data-level=custom]');
  for(const [id,value] of [['width',''],['width','4'],['width','41'],['width','5.5'],['height','31'],['mines','0'],['mines','-1'],['mines','1.5'],['mines','9999']]) {
    await p.fill('#custom-width','16');await p.fill('#custom-height','16');await p.fill('#custom-mines','40');
    await p.fill(`#custom-${id}`,value);assert.equal(await p.locator('#custom-start').isDisabled(),true,`${id}=${value}`);
  }
  await p.locator('#custom-mines').evaluate(el=>{el.value='abc';el.dispatchEvent(new Event('input',{bubbles:true}));});
  assert.equal(await p.locator('#custom-start').isDisabled(),true);
  await p.fill('#custom-width','40');await p.fill('#custom-height','30');await p.fill('#custom-mines','1191');
  await p.fill('#custom-width','5');assert.equal(await p.inputValue('#custom-mines'),'141');
  await p.fill('#custom-height','5');assert.equal(await p.inputValue('#custom-mines'),'16');
  for(let i=0;i<8;i++)await p.click('[data-field=width][data-step="1"]');
  assert.equal(await p.inputValue('#custom-width'),'13');
  await p.click('#custom-cancel');
  for(const [w,h,m] of [[5,5,3],[10,10,20],[16,16,40],[30,16,99],[40,30,200],[40,5,40],[5,30,30],[25,20,80]]) {
    await setup(p,w,h,m);await checkFit(p);
    assert.equal(await p.locator('.cell').count(),w*h);assert.equal(await p.locator('#level-name').textContent(),'Custom');
    assert.equal(await p.locator('#level-meta').textContent(),`${w} × ${h} · ${m} mines`);
    const cell=i=>p.locator(`.cell[data-index="${i}"]`);
    await cell(1).click({button:'right'});assert.equal(await cell(1).getAttribute('data-kind'),'flagged');
    assert.equal(await p.locator('#mines').textContent(),String(m-1));
    await cell(1).click({button:'right'});assert.equal(await cell(1).getAttribute('data-kind'),'');
    await cell(1).click({button:'right'});await cell(0).click();
    const played=await kinds(p);await cell(0).click({button:'right'});assert.deepEqual(await kinds(p),played);
    await p.waitForTimeout(450);const active=await getSave(p);assert.equal(active.current.difficulty,'custom');
    assert.deepEqual(active.current.customConfig,{width:w,height:h,mines:m});
    await p.addInitScript(initial=>window.initialSave=initial,JSON.stringify(active));
    await p.reload();await p.click('#continue');assert.deepEqual(await kinds(p),played);await checkFit(p);
    await p.click('#restart');await p.click('#confirm-new');assert.equal(await p.locator('.cell').count(),w*h);
    assert.equal(await p.locator('#mines').textContent(),String(m));assert.equal(await p.locator('#time').textContent(),'00:00');
    await p.click('#menu');await p.click('[data-level=custom]');
    assert.equal(await p.inputValue('#custom-width'),String(w));assert.equal(await p.inputValue('#custom-height'),String(h));assert.equal(await p.inputValue('#custom-mines'),String(m));
    await p.click('#custom-cancel');
  }
  await p.click('#continue');await p.click('#zoom-in');await p.click('#zoom-in');await p.click('#zoom-in');
  const target=await middleCell(p),transform=await p.locator('#board').evaluate(e=>e.style.transform);
  await p.evaluate(()=>{window.contextEvents=[];document.addEventListener('contextmenu',e=>contextEvents.push({prevented:e.defaultPrevented,target:e.target.id}));});
  await p.mouse.click(target.x,target.y,{button:'right'});
  assert.equal(await p.locator(`.cell[data-index="${target.index}"]`).getAttribute('data-kind'),'flagged');
  assert.equal(await p.evaluate(()=>contextEvents.at(-1).prevented),true,'native board contextmenu suppressed');
  await p.mouse.move(target.x,target.y);await p.mouse.down({button:'right'});await p.mouse.move(target.x-50,target.y-40,{steps:5});await p.mouse.up({button:'right'});
  assert.equal(await p.locator('#board').evaluate(e=>e.style.transform),transform,'right drag cannot pan');
  assert.equal(await p.locator('.cell.flagged').count(),1);
  assert.equal(await p.locator('.cell.open').count(),0);
  const outside=await p.locator('#level-name').evaluate(el=>!el.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true})));
  assert.equal(outside,false,'outside contextmenu not cancelled');
  // Left pan then right click must hit the inverse-transformed cell.
  await p.mouse.move(target.x,target.y);await p.mouse.down();await p.mouse.move(target.x+60,target.y+15,{steps:5});await p.mouse.up();
  assert.equal(await p.locator('.cell.open').count(),0);
  const moved=await middleCell(p);await p.mouse.click(moved.x,moved.y,{button:'right'});
  assert.equal(await p.locator(`.cell[data-index="${moved.index}"]`).getAttribute('data-kind'),'flagged');
  await p.click('#fit');await p.locator('.cell').nth(0).click();await p.waitForTimeout(450);
  const active=await getSave(p),mines=[...active.current.cells].map(v=>Number(v)&1);
  const mine=mines.findIndex((v,i)=>v&&!(Number(active.current.cells[i])&4));
  await p.locator('.cell').nth(mine).click();assert.equal(await p.locator('#modal').evaluate(e=>e.open),false);
  await p.locator('.cell').nth(mine).click({button:'right'});assert.equal(await p.locator('#modal').evaluate(e=>e.open),false);
  await p.locator('.cell').nth(mine).click();assert.equal(await p.locator('#modal-title').textContent(),'Game over.');
  await p.click('#again');assert.equal(await p.locator('.cell').count(),500);assert.equal(await p.locator('#mines').textContent(),'80');
  await p.locator('.cell').nth(1).click({button:'right'});await p.locator('.cell').nth(0).click();await p.waitForTimeout(400);
  const winSave=await getSave(p);await p.evaluate(cells=>{
    const list=document.querySelectorAll('.cell');
    for(let i=0;i<cells.length;i++){if(Number(cells[i])&4)list[i].dispatchEvent(new KeyboardEvent('keydown',{key:'f',bubbles:true}));if(!(Number(cells[i])&1))list[i].click();}
  },winSave.current.cells);
  assert.equal(await p.locator('#modal-title').textContent(),'You win!');await p.waitForTimeout(400);
  const won=await getSave(p);assert.deepEqual(won.bestTimes,{beginner:null,intermediate:null,expert:null});assert.equal(await p.evaluate(()=>testScores.length),0);
  await p.click('#view-field');const wonKinds=await kinds(p);await p.locator('.cell').nth(1).click({button:'right'});assert.deepEqual(await kinds(p),wonKinds);
  assert.deepEqual(errors,[]);await context.close();
  // Setup layouts and the largest board on a touch-capable phone.
  for(const [width,height] of [[360,640],[390,844],[412,915]]) {
    const c=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true}),q=await c.newPage();
    q.on('pageerror',e=>errors.push(e.message));
    await q.route('https://www.youtube.com/game_api/v1',r=>r.fulfill({contentType:'text/javascript',body:sdkScript}));
    await q.goto('http://127.0.0.1:8080');await q.click('[data-level=custom]');
    assert.ok(await q.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.ok(await q.locator('#modal').evaluate(e=>e.scrollWidth<=e.clientWidth));
    await q.screenshot({path:`${out}custom-setup-${width}.png`});
    await q.fill('#custom-width','40');await q.fill('#custom-height','30');await q.fill('#custom-mines','200');await q.click('#custom-start');
    await checkFit(q);assert.equal(await q.locator('.cell').count(),1200);
    if(width===390){
      const cdp=await c.newCDPSession(q),v=await q.locator('#board-viewport').boundingBox(),x=v.x+v.width/2,y=v.y+v.height/2;
      const send=(type,touchPoints)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints});
      const pt=(x,y,id)=>({x,y,id});
      await send('touchStart',[pt(x-30,y,1),pt(x+30,y,2)]);await send('touchMove',[pt(x-110,y,1),pt(x+110,y,2)]);await q.waitForTimeout(80);await send('touchEnd',[]);
      const before=await q.locator('#board').evaluate(e=>e.style.transform);
      await send('touchStart',[pt(x,y,1)]);await send('touchMove',[pt(x-50,y-20,1)]);await q.waitForTimeout(70);await send('touchEnd',[]);
      assert.notEqual(await q.locator('#board').evaluate(e=>e.style.transform),before);assert.equal(await q.locator('.cell.open').count(),0);
      const t=await middleCell(q);await send('touchStart',[pt(t.x,t.y,1)]);await q.waitForTimeout(470);await send('touchEnd',[]);
      assert.equal(await q.locator(`.cell[data-index="${t.index}"]`).getAttribute('data-kind'),'flagged');
      await q.click('#flag-mode');await q.touchscreen.tap(t.x,t.y);await q.click('#flag-mode');await q.touchscreen.tap(t.x,t.y);
      assert.match(await q.locator(`.cell[data-index="${t.index}"]`).getAttribute('data-kind'),/open/);
      const progress=await kinds(q);await q.setViewportSize({width:844,height:390});await q.waitForTimeout(70);assert.deepEqual(await kinds(q),progress);
      await q.click('#fit');await checkFit(q);await q.setViewportSize({width:390,height:844});await q.click('#fit');await checkFit(q);
      await q.screenshot({path:out+'custom-40x30-mobile.png'});
    }
    assert.equal(await q.locator('#fatal').isVisible(),false);await c.close();
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: Custom validation, dynamic mine clamp, 8 configurations, restart/save/continue/memory, exact right-click after transforms, contextmenu scope, no right-pan, custom loss/win/record isolation, phone setup and 40x30 touch camera.');
}
