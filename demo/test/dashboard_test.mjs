import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {encode,decode,reconcile} from '../public/protocol.mjs';
// Exercise the actual dashboard module against a minimal DOM and controlled network.
// This checks workflow behavior, not browser layout or real Bluetooth.
async function harness(){
  const elements=new Map(),intervals=new Map(),stored=new Map();let nextTimer=0,gate=null;
  function element(){return {textContent:'',hidden:false,checked:false,value:'30',style:{},dataset:{},children:[],append(...items){this.children.push(...items)},replaceChildren(...items){this.children=items}};}
  const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
  const document={getElementById:get,querySelector:()=>({content:'test-token'}),querySelectorAll:()=>[],createElement:element,addEventListener(){}};
  const summary=rows=>{const tracked=rows.reduce((a,s)=>a+s.tracked_seconds,0),slouch=rows.reduce((a,s)=>a+s.slouch_seconds,0);return {session_count:rows.length,incomplete_session_count:rows.filter(s=>s.state!=='ended').length,tracked_seconds:tracked,slouch_seconds:slouch,non_slouch_seconds:tracked-slouch,non_slouch_percent:tracked?(tracked-slouch)/tracked*100:null,episode_count:rows.reduce((a,s)=>a+s.episode_count,0)}};
  const data=()=>{const today=summary([...stored.values()]);return {timezone:'America/New_York',today,days:[{date:'2026-09-26',summary:today}],challenge:{progress_seconds:Math.min(1200,today.tracked_seconds),earned_points:today.tracked_seconds>=1200?50:0},sessions:[...stored.values()],next_session_id:100};};
  const fetch=async(path,options)=>{
    if(options.method==='PUT'){
      const id=Number(path.split('/').at(-1)),body=JSON.parse(options.body);
      if(gate){const wait=gate;gate=null;await wait;}
      const previous=stored.get(id),disposition=previous&&previous.sequence===body.snapshot.sequence?'duplicate':'accepted';
      stored.set(id,{id,...body.snapshot,calendar_day:'2026-09-26',first_observed_at:body.first_observed_at});
      return {ok:true,json:async()=>({disposition,session:stored.get(id)})};
    }
    if(options.method==='DELETE')stored.clear();
    return {ok:true,json:async()=>data()};
  };
  const source=(await readFile(new URL('../public/demo.js',import.meta.url),'utf8')).replace(/^import .*\n/,'');
  const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
  await new AsyncFunction('document','window','fetch','setInterval','clearInterval','encode','decode','reconcile',source)(document,{addEventListener(){}},fetch,fn=>{intervals.set(++nextTimer,fn);return nextTimer},id=>intervals.delete(id),encode,decode,reconcile);
  return {get,stored,intervals,hold(){let release;gate=new Promise(r=>release=r);return release;},async settle(){for(let i=0;i<12;i++)await new Promise(r=>setImmediate(r));},async tick(){for(const fn of [...intervals.values()])fn();await this.settle();}};
}
test('guided demo ends with one persisted session, one episode and one reward',async()=>{
  const h=await harness();await h.get('tour').onclick();
  for(let i=0;i<44;i++)await h.tick();
  assert.equal(h.stored.size,1);const s=[...h.stored.values()][0];
  assert.equal(s.state,'ended');assert.equal(s.episode_count,1);assert.ok(s.tracked_seconds>=1200);
  assert.equal(h.get('points').textContent,'50 points earned ✓');
  assert.equal(h.get('save-status').textContent,'All received readings saved');
  await h.get('replay').onclick();assert.match(h.get('alert').textContent,/duplicate/);
});
test('older upload acknowledgement retains a newer pending reading; outage recovers',async()=>{
  const h=await harness();await h.get('connect').onclick();await h.get('start').onclick();
  const release=h.hold();await h.tick();await h.tick();release();await h.settle();
  assert.match(h.get('save-status').textContent,/unsaved/);
  await h.tick();assert.equal(h.get('save-status').textContent,'All received readings saved');
  h.get('offline').checked=true;await h.tick();assert.match(h.get('save-status').textContent,/saving offline/);
  h.get('offline').checked=false;h.get('offline').onchange();await h.settle();
  assert.equal(h.get('save-status').textContent,'All received readings saved');
});
