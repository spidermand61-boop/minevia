import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium,webkit}=require(process.env.PLAYWRIGHT_PATH||'playwright');
for(const [name,type] of [['chromium',chromium],['webkit',webkit]]) {
 const browser=await type.launch();
 try {
  for(const mobile of [false,true]) {
   const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:900},isMobile:mobile,hasTouch:mobile});
   await context.addInitScript(()=>{
    window.audioTrace=[];window.audioContexts=[];window.audioStarts=0;
    const Native=window.AudioContext||window.webkitAudioContext;
    window.AudioContext=class extends Native {
     constructor(...args){super(...args);audioContexts.push(this);audioTrace.push(['create',this.state]);this.addEventListener('statechange',()=>audioTrace.push(['state',this.state]));}
     resume(){audioTrace.push(['resume',this.state]);return super.resume().catch(e=>{audioTrace.push(['error',e.name]);throw e;});}
     createOscillator(){audioStarts++;audioTrace.push(['play',this.state]);return super.createOscillator();}
    };
   });
   const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
   // Missing SDK deliberately exercises local GitHub Pages fallback.
   await p.route('**/game_api/v1',r=>r.fulfill({body:''}));
   await p.goto(process.env.TEST_URL||'http://127.0.0.1:8080');await p.waitForSelector('#home');
   assert.equal(await p.evaluate(()=>audioContexts.length),0,'no pre-gesture context');
   const tap=async selector=> mobile?p.locator(selector).tap():p.click(selector);
   await tap('#new-game');await p.waitForFunction(()=>audioContexts[0]?.state==='running');
   assert.equal(await p.evaluate(()=>audioStarts),0,'unlock does not autoplay');
   await tap('.cell[data-index="40"]');await p.waitForFunction(()=>audioStarts>=1);
   const closed=await p.evaluate(()=>[...document.querySelectorAll('.cell')].find(c=>!c.classList.contains('open')).dataset.index);
   await tap('#flag-mode');await tap(`.cell[data-index="${closed}"]`);await p.waitForFunction(()=>audioStarts>=3);
   await tap('#flag-mode');
   // A real browser suspension, followed by pageshow and the next ordinary interaction.
   await p.evaluate(async()=>{await audioContexts[0].suspend();dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
   assert.equal(await p.evaluate(()=>audioContexts[0].state),'suspended');
   await tap('#flag-mode');await p.waitForFunction(()=>audioContexts[0].state==='running');await tap('#flag-mode');
   await tap('#settings');await p.locator('#sound-setting').uncheck();await tap('#settings-done');
   const muted=await p.evaluate(()=>audioStarts);
   await tap('#flag-mode');await tap(`.cell[data-index="${closed}"]`);
   assert.equal(await p.evaluate(()=>audioStarts),muted,'local SFX mute');
   await tap('#settings');await p.locator('#sound-setting').check();await tap('#settings-done');await tap('#flag-mode');
   const mine=await p.evaluate(()=>{
    const save=JSON.parse(localStorage.getItem('stillfield-dev-save-v1'));
    return [...save.current.cells].findIndex(c=>(Number(c)&1)&&!(Number(c)&4));
   });
   await tap(`.cell[data-index="${mine}"]`);await p.waitForFunction(n=>audioStarts>=n+2,muted);
   assert.equal(await p.locator('#modal').evaluate(el=>el.open),false,'loss review remains');
   assert.equal(await p.locator('body').evaluate(el=>el.classList.contains('game-mode')),true);
   await p.evaluate(()=>scrollTo(0,999));assert.equal(await p.evaluate(()=>scrollY),0);
   assert.equal(await p.evaluate(()=>audioContexts.length),1,'one context across effects/resume');
   assert.deepEqual(await p.evaluate(()=>audioTrace.filter(e=>e[0]==='play'&&e[1]!=='running')),[]);
   console.log(name,mobile?'mobile':'desktop',JSON.stringify(await p.evaluate(()=>({trace:audioTrace,sfx:JSON.parse(localStorage.getItem('stillfield-dev-save-v1')).settings.sound,localFallback:true,assets:'synthesized; no audio URLs'}))));
   await p.reload();await p.waitForSelector('#home');assert.equal(await p.evaluate(()=>audioContexts.length),0);
   await tap('#new-game');await p.waitForFunction(()=>audioContexts[0]?.state==='running');
   assert.deepEqual(errors,[]);await context.close();
  }
 } finally {await browser.close();}
}
console.log('PASS: real AudioContext unlock, running-only reveal/flag/loss, suspend/pageshow recovery, SFX mute, one context, refresh; Chromium + WebKit desktop/mobile.');
