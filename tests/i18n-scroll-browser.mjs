import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const out = fileURLToPath(new URL('../test-results/',import.meta.url));
await mkdir(out,{recursive:true});
const url = process.env.TEST_URL || 'http://127.0.0.1:8080';
const state = p => p.evaluate(()=>({cells:[...document.querySelectorAll('.cell')].map(c=>c.dataset.kind),transform:document.getElementById('board').style.transform,time:document.getElementById('time').textContent}));
async function swipe(p, engine, x, from, to) {
  if(engine==='chromium') {
    const cdp=await p.context().newCDPSession(p);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:from,id:1}]});
    for(let i=1;i<=8;i++) {
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:from+(to-from)*i/8,id:1}]});
      await p.waitForTimeout(25);
    }
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
  } else {
    // Playwright cannot inject native swipe/wheel in mobile WebKit. Verify scroll geometry here; Chromium above uses native touch.
    await p.evaluate(({x,from,to})=>{const modal=document.getElementById('modal');if(modal.open)modal.scrollBy(0,from-to);else scrollBy(0,from-to);},{x,from,to});
  }
  await p.waitForTimeout(250);
}
for (const [engine,type] of [['chromium',chromium],['webkit',webkit]]) {
  const browser=await type.launch({headless:true});
  try {
    for(const [locale,lang] of [['en-US','en'],['en-GB','en'],['uk-UA','uk'],['uk','uk'],['ru-RU','ru'],['ru','ru'],['de-DE','en']]) {
      const context=await browser.newContext({locale,viewport:{width:390,height:844},isMobile:true,hasTouch:true});
      const p=await context.newPage();await p.route('**/game_api/v1',r=>r.fulfill({body:''}));await p.goto(url);await p.waitForSelector('#home');
      assert.equal(await p.locator('html').getAttribute('lang'),lang);
      assert.equal(await p.locator('[data-level=beginner] strong').textContent(),{en:'Beginner',uk:'Початковий',ru:'Начальный'}[lang]);
      await context.close();
    }
    const context=await browser.newContext({locale:'uk-UA',viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const p=await context.newPage(),errors=[];
    p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await p.route('**/game_api/v1',r=>r.fulfill({body:''}));await p.goto(url);await p.waitForSelector('#home');
    for(const [width,height] of [[390,844],[393,852],[844,390],[852,393],[360,640],[320,568],[390,600]]) {
      await p.setViewportSize({width,height});await p.evaluate(()=>scrollTo(0,0));
      await swipe(p,engine,Math.min(width-25,350),Math.min(height-50,600),100);
      assert.ok(await p.evaluate(()=>scrollY>0),`${engine} native page scroll ${width}x${height}`);
      await p.locator('[data-level=custom]').scrollIntoViewIfNeeded();
      assert.ok(await p.locator('[data-level=custom]').isVisible());
      assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`horizontal overflow ${engine} ${width}`);
      await p.screenshot({path:`${out}${engine}-uk-home-${width}x${height}.png`,fullPage:true});
      await p.click('[data-level=custom]');
      const modal=await p.locator('#modal').boundingBox();
      assert.ok(modal.x>=0&&modal.x+modal.width<=width+1&&modal.y>=0&&modal.y+modal.height<=height+1,'modal fits');
      for(const id of ['custom-width','custom-height','custom-mines']) {await p.locator('#'+id).scrollIntoViewIfNeeded();assert.ok(await p.locator('#'+id).isVisible());}
      await p.locator('#custom-start').scrollIntoViewIfNeeded();
      assert.ok(await p.locator('#custom-start').isEnabled());
      const before=await p.evaluate(()=>scrollY);
      await swipe(p,engine,modal.x+modal.width/2,modal.y+modal.height-30,modal.y+30);
      assert.equal(await p.evaluate(()=>scrollY),before,'modal background stays fixed');
      await p.screenshot({path:`${out}${engine}-uk-custom-${width}x${height}.png`});
      await p.click('#custom-cancel');
      assert.equal(await p.locator('html').evaluate(el=>el.classList.contains('modal-open')),false);
      await p.click('#settings');await p.locator('#settings-done').scrollIntoViewIfNeeded();
      assert.ok(await p.locator('#settings-done').isVisible());await p.click('#settings-done');
    }
    await p.setViewportSize({width:390,height:844});
    await p.click('[data-level=expert]');await p.click('#new-game');
    assert.equal(await p.evaluate(()=>scrollY),0,'Home to Game resets scroll');
    await p.locator('.cell').first().click();await p.waitForTimeout(1100);
    for(let i=0;i<4;i++)await p.click('#zoom-in');
    await p.click('#settings');const before=await state(p);
    await p.locator('#language-setting').selectOption('ru');await p.waitForTimeout(100);
    const after=await state(p);
    assert.deepEqual(after,before,'live language preserves board, timer and camera');
    assert.equal(await p.locator('#modal-title').textContent(),'Настройки');
    assert.equal(await p.locator('#level-name').textContent(),'Экспертный');
    assert.equal(await p.locator('html').getAttribute('lang'),'ru');
    await p.locator('#language-setting').selectOption('en');
    assert.equal(await p.locator('#modal-title').textContent(),'Settings');
    await p.locator('#language-setting').selectOption('auto');
    assert.equal(await p.locator('html').getAttribute('lang'),'uk');
    await p.locator('#language-setting').selectOption('ru');await p.click('#settings-done');
    await p.reload();await p.waitForSelector('#home');
    assert.equal(await p.locator('html').getAttribute('lang'),'ru','manual language persists');
    await p.click('#continue');assert.deepEqual((await state(p)).cells,before.cells,'saved game persists');
    await p.click('#settings');await p.locator('#language-setting').selectOption('auto');await p.click('#settings-done');
    assert.equal(await p.locator('html').getAttribute('lang'),'uk');
    assert.equal(await p.locator('#board-viewport').evaluate(el=>getComputedStyle(el).touchAction),'none');
    for(const selector of ['html','body','#app','#home']) assert.notEqual(await p.locator(selector).evaluate(el=>getComputedStyle(el).touchAction),'none');
    // Very short containers retain a usable board; scrolling belongs to the surrounding page.
    await p.setViewportSize({width:390,height:280});await p.evaluate(()=>scrollTo(0,0));
    assert.ok(await p.evaluate(()=>document.documentElement.scrollHeight>innerHeight),'short game can scroll');
    await swipe(p,engine,20,44,2);
    assert.ok(await p.evaluate(()=>scrollY>0),'outside-board scrolling remains available');
    await p.setViewportSize({width:390,height:844});await p.evaluate(()=>scrollTo(0,0));
    for(let i=0;i<5;i++)await p.click('#zoom-in');
    const boardBefore=await state(p), viewport=await p.locator('#board-viewport').boundingBox();
    const x=viewport.x+viewport.width/2,y=viewport.y+viewport.height/2;
    await p.mouse.move(x,y);await p.mouse.down();await p.mouse.move(x-70,y-30,{steps:6});await p.mouse.up();
    const boardAfter=await state(p);
    assert.notEqual(boardAfter.transform,boardBefore.transform,'board drag still pans');
    assert.deepEqual(boardAfter.cells,boardBefore.cells,'pan never reveals');
    assert.equal(await p.evaluate(()=>scrollY),0,'board drag never scrolls page');
    await p.screenshot({path:`${out}${engine}-uk-game-390x844.png`});
    await p.click('#menu');assert.equal(await p.evaluate(()=>scrollY),0);
    assert.deepEqual(errors,[]);
    await context.close();console.log(`PASS ${engine}: 7 locales, live/persisted override, Auto, board/timer/camera, 7 mobile layouts, scrolling (native touch in Chromium, geometry in mobile WebKit), dialogs, no console errors.`);
  } finally {await browser.close();}
}
