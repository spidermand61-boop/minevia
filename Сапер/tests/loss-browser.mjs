import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import { defaults } from '../js/save.js';
import { sdkScript } from './platform-browser.mjs';
export async function runLossChecks(browser,out) {
  for(const [device,width,height,touch] of [['desktop',1280,900,false],['portrait',390,844,true],['landscape',844,390,true]]) {
    for(const difficulty of ['beginner','intermediate','expert']) {
      const g=new Game(difficulty);g.act(0);g.pause('test');
      const mine=g.board.mines.findIndex(v=>v===1);
      const correct=g.board.mines.findIndex((v,i)=>v===1&&i!==mine);
      const wrong=g.board.mines.findIndex((v,i)=>!v&&!g.board.opened[i]);
      g.board.flag(correct);g.board.flag(wrong);
      const save=defaults();save.current=g.serialize();save.stats.gamesPlayed=1;save.settings.difficulty=difficulty;
      const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch});
      const p=await context.newPage(),errors=[];
      p.on('pageerror',e=>errors.push(e.message));p.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
      await p.addInitScript(initial=>{
        window.initialSave=initial;window.audioStarts=0;
        const Original=window.AudioContext;
        window.AudioContext=class extends Original{createOscillator(){audioStarts++;return super.createOscillator();}};
      },JSON.stringify(save));
      await p.route('https://www.youtube.com/game_api/v1',r=>r.fulfill({contentType:'text/javascript',body:sdkScript}));
      await p.goto('http://127.0.0.1:8080');await p.click('#continue');
      await p.evaluate(()=>testEvents.audio(true));
      const cell=i=>p.locator(`.cell[data-index="${i}"]`);
      const tap=async locator=>{const r=await locator.boundingBox();if(touch)await p.touchscreen.tap(r.x+r.width/2,r.y+r.height/2);else await locator.click();};
      await tap(cell(mine));
      const noModal=async()=>assert.equal(await p.locator('#modal').evaluate(e=>e.open),false,`${difficulty}/${device}: unexpected modal`);
      await noModal();assert.equal(await p.locator('.cell.mine').count(),g.board.mineCount);
      assert.equal(await cell(mine).evaluate(e=>e.classList.contains('exploded')),true);
      assert.equal(await cell(wrong).getAttribute('data-kind'),'wrong');
      assert.match(await cell(correct).getAttribute('aria-label'),/Correctly flagged mine/);
      const time=await p.locator('#time').textContent();
      await p.waitForTimeout(1250);await noModal();assert.equal(await p.locator('#time').textContent(),time);
      await p.waitForFunction(()=>testSaved&&JSON.parse(testSaved).current===null);
      const saved=await p.evaluate(()=>JSON.parse(testSaved));assert.equal(saved.stats.gamesPlayed,1);assert.equal(saved.stats.gamesWon,0);
      const sounds=await p.evaluate(()=>audioStarts);assert.equal(sounds,2,'one two-note loss effect');
      const state=await p.locator('#board').innerHTML();
      for(let i=0;i<6;i++)await p.click('#zoom-in');
      await p.click('#zoom-out');await noModal();
      const v=await p.locator('#board-viewport').boundingBox(),cx=v.x+v.width/2,cy=v.y+v.height/2;
      const before=await p.locator('#board').evaluate(e=>e.style.transform);
      if(touch){
        const cdp=await context.newCDPSession(p);
        const send=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points});
        const a=(x,y,id)=>({x,y,id});
        await send('touchStart',[a(cx-30,cy,1),a(cx+30,cy,2)]);
        await send('touchMove',[a(cx-55,cy,1),a(cx+55,cy,2)]);await p.waitForTimeout(60);
        await send('touchEnd',[]);await noModal();
        await send('touchStart',[a(cx,cy,1)]);await send('touchMove',[a(cx-45,cy-20,1)]);
        await p.waitForTimeout(470);await send('touchEnd',[]);await noModal();
        assert.notEqual(await p.locator('#board').evaluate(e=>e.style.transform),before);
        await p.click('#fit');
        const r=await cell(mine).boundingBox();
        await send('touchStart',[a(r.x+r.width/2,r.y+r.height/2,1)]);await p.waitForTimeout(470);await send('touchEnd',[]);
        await noModal();
      }else{
        await p.mouse.move(cx,cy);await p.mouse.down();await p.mouse.move(cx-65,cy-35,{steps:5});await p.mouse.up();await noModal();
        assert.notEqual(await p.locator('#board').evaluate(e=>e.style.transform),before);
        await p.mouse.wheel(0,-100);await p.waitForTimeout(80);await noModal();
      }
      await p.click('#fit');await noModal();
      await cell(mine).click({button:'right'});await cell(mine).press('f');await noModal();
      assert.equal(await p.locator('#board').innerHTML(),state,'navigation must not change revealed/flagged cells');
      // Flag mode does not prevent a deliberate post-loss tap from showing results.
      await p.click('#flag-mode');await tap(cell(mine));
      assert.equal(await p.locator('#modal-title').textContent(),'Game over.');
      assert.equal(await p.locator('#time').textContent(),time);assert.equal(await p.evaluate(()=>audioStarts),sounds);
      await p.click('#view-field');await noModal();await tap(cell(mine));
      assert.equal(await p.locator('#modal-title').textContent(),'Game over.');
      await p.click('#again');assert.equal(await p.locator('#level-name').textContent(),g.board.name);
      assert.equal(await p.locator('#time').textContent(),'00:00');assert.equal(await p.locator('.cell.mine').count(),0);
      assert.equal(await p.locator('.cell').count(),g.board.size);
      // Reload a completed-save fixture: no Continue entry for a lost game.
      await p.addInitScript(initial=>window.initialSave=initial,JSON.stringify(saved));await p.reload();
      await p.locator('#home').waitFor({state:'visible'});assert.equal(await p.locator('#continue').isVisible(),false);
      assert.equal(await p.locator('#fatal').isVisible(),false);assert.deepEqual(errors,[]);
      await context.close();
    }
  }
  console.log('PASS: two-stage loss on 3 difficulties × desktop/portrait/landscape; intentional next tap only, pinch/pan/wheel/buttons/FIT/right-click/hold exclusions, timer, flags, one sound, save, no Continue, repeat review and restart.');
}
