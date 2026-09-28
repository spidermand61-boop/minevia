import test from 'node:test';
import assert from 'node:assert/strict';
import { Audio } from '../js/audio.js';
class Context {
  static count=0;
  constructor(){Context.count++;this.state='suspended';this.currentTime=0;this.starts=0;this.resumes=0;this.destination={};}
  addEventListener(type,fn){this.changed=fn;}
  resume(){this.resumes++;return new Promise((resolve,reject)=>{this.finish=()=>{this.state='running';this.changed();resolve();};this.fail=reject;});}
  createOscillator(){assert.equal(this.state,'running');this.starts++;return {frequency:{},connect(){},disconnect(){},start(){},stop(){}};}
  createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
}
globalThis.AudioContext=Context;
test('no autoplay/context until gesture; one context, wait for running before SFX',async()=>{
 const a=new Audio();a.setEnabled(true);await a.play('reveal');assert.equal(a.context,null);
 const unlock=a.unlock();const c=a.context;assert.equal(c.state,'suspended');
 const play=a.play('flag');assert.equal(c.starts,0);c.finish();assert.equal(await unlock,true);await play;assert.equal(c.starts,2);
 await a.unlock();await a.play('lost');assert.equal(a.context,c);assert.equal(c.starts,4);
});
test('muting while resume is pending suppresses effect; next gesture can recover',async()=>{
 const a=new Audio();a.setEnabled(true);a.unlock();const play=a.play('lost');a.setEnabled(false);a.context.finish();await play;assert.equal(a.context.starts,0);
 a.setEnabled(true);await a.unlock();await a.play('reveal');assert.equal(a.context.starts,1);
});
test('suspended/interrupted resume retries, rejection and pending promise recover',async()=>{
 const a=new Audio();a.setEnabled(true);let first=a.unlock();a.context.fail(new Error('blocked'));assert.equal(await first,false);
 for(const state of ['suspended','interrupted']){
  a.context.state=state;a.checkState();assert.equal(a.unlocked,false);
  a.unlock();const retry=a.unlock();a.context.finish();assert.equal(await retry,true);await a.play('flag');
 }
 assert.equal(a.context.starts,4);assert.equal(a.enabled,true);
});
test('muted gestures create no context and a late resume never replays stale audio',async()=>{
 const a=new Audio();assert.equal(await a.unlock(),false);assert.equal(a.context,null);
 a.setEnabled(true);a.unlock();await a.play('lost');a.context.finish();await Promise.resolve();assert.equal(a.context.starts,0);
});
