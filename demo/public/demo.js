import {encode,decode,reconcile} from './protocol.mjs';
const $ = id => document.getElementById(id);
const seconds = n => `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
const minutes = n => `${(n/60).toFixed(n%60 ? 1 : 0)} min`;
const csrf = document.querySelector('meta[name="csrf-token"]').content;
let dashboard, device=null, connected=false, lastReceived=0, latest=null, busy=false, retryAt=0, failures=0, tour=null, generation=0;
const pending=new Map(), received=new Map(), observations=new Map();
const stateCopy={calibrating:['Finding your baseline','Calibration in progress','Simulated device calibration. Tracking time pauses until classification starts.'],upright:['A comfortable moment','Looking balanced.','The simulated wearable reports non-slouch posture. Keep making small check-ins.'],slouching:['A moment to notice','Time for a little reset.','The simulated wearable detected a sustained slouch episode.'],sensor_error:['Sensor needs attention','Let’s check the sensor.','Tracking time is paused. This is a sensor error, separate from a lost connection.'],ended:['Session complete','A little awareness, saved.','Your device ended this session. Its totals stay in your journal.'],idle:['Ready when you are','Make space for a check-in.','Start a simulated session using the presenter controls.']};
function message(text=''){ $('alert').textContent=text; $('alert').hidden=!text; }
async function api(path,method='GET',body){
  const response=await fetch(path,{method,headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json();
  if(!response.ok){ const e=Error(data.error || `HTTP ${response.status}`);e.status=response.status;throw e; }
  return data;
}
function cell(tr,text){ const td=document.createElement('td');td.textContent=text;tr.append(td); }
function renderData(data){
  dashboard=data;
  $('timezone').textContent=data.timezone;
  const t=data.today,c=data.challenge;
  $('total-tracked').textContent=minutes(t.tracked_seconds);
  $('non-slouch').textContent=t.non_slouch_percent===null?'—':`${t.non_slouch_percent}%`;
  $('total-slouch').textContent=minutes(t.slouch_seconds);$('episodes').textContent=t.episode_count;
  $('today-caption').textContent=t.session_count?`${t.session_count} sessions · ${t.incomplete_session_count} incomplete`:'No recorded sessions yet';
  $('progress').value=c.progress_seconds;$('progress').textContent=`${Math.round(c.progress_seconds/12)}%`;
  $('challenge-progress').textContent=`${(c.progress_seconds/60).toFixed(1)} / 20 min`;
  $('challenge-percent').textContent=`${Math.round(c.progress_seconds/12)}%`;
  $('points').textContent=c.earned_points?'50 points earned ✓':'+50 points';
  $('reward-copy').textContent=c.earned_points?'Your daily bloom is earned. Replays won’t award extra points.':'One reward per first-seen date. Every check-in counts.';
  $('chart').replaceChildren();$('weekly-table').replaceChildren();
  const max=Math.max(...data.days.map(d=>d.summary.tracked_seconds),1);
  for(const day of data.days){
    const s=day.summary,col=document.createElement('div');col.className='bar-column';
    const val=document.createElement('span');val.className='bar-value';val.textContent=s.session_count?minutes(s.tracked_seconds):'No data';
    const stack=document.createElement('div');stack.className='bar-stack';stack.style.height=`${Math.max(s.tracked_seconds/max*135,3)}px`;
    const bad=document.createElement('div');bad.className='bar-bad';bad.style.height=`${s.tracked_seconds?s.slouch_seconds/s.tracked_seconds*100:0}%`;
    const good=document.createElement('div');good.className='bar-good';good.style.height=`${s.tracked_seconds?s.non_slouch_seconds/s.tracked_seconds*100:0}%`;
    stack.append(bad,good);const label=document.createElement('span');label.textContent=new Date(day.date+'T12:00:00').toLocaleDateString('en-US',{weekday:'short'});
    col.append(val,stack,label);$('chart').append(col);
    const tr=document.createElement('tr');for(const v of [day.date,s.session_count?seconds(s.tracked_seconds):'No data',seconds(s.slouch_seconds),s.episode_count])cell(tr,v);$('weekly-table').append(tr);
  }
  $('sessions').replaceChildren();
  for(const s of data.sessions){const tr=document.createElement('tr');for(const v of [`#${s.id}`,s.calendar_day,seconds(s.tracked_seconds),seconds(s.slouch_seconds),s.state==='ended'?'Completed':'Incomplete · last known'])cell(tr,v);$('sessions').append(tr);}
  if(!data.sessions.length){const tr=document.createElement('tr');const td=document.createElement('td');td.colSpan=5;td.textContent='Your first check-in starts here. Connect the simulator and start a session.';tr.append(td);$('sessions').append(tr);}
}
async function refresh(){renderData(await api('/api/demo'));}
function renderLive(){
  const stale=connected && latest && Date.now()-lastReceived>3000;
  $('connection').textContent=!connected?'Disconnected':stale?'Stale · no fresh readings':'Simulator connected';
  $('connection').className=`status ${connected&&!stale?'live':''}`;
  $('connect').textContent=connected?'Disconnect simulator':'Connect simulator ↗';
  const copy=stateCopy[latest?.state || 'idle'];
  $('state-label').textContent=latest&&(!connected||stale)?'Last-known device state':copy[0];
  $('posture').textContent=copy[1];$('state-copy').textContent=copy[2];
  $('figure').className=`posture-figure ${latest?.state || ''}`;
  $('live-tracked').textContent=seconds(latest?.tracked_seconds||0);$('live-slouch').textContent=seconds(latest?.slouch_seconds||0);$('live-episodes').textContent=latest?.episode_count||0;
  $('save-status').textContent=pending.size?`${pending.size} session${pending.size>1?'s':''} unsaved${$('offline').checked?' · saving offline':''}`:latest?'All received readings saved':'No session yet';
  const active=device && device.state!=='ended';
  $('start').disabled=!connected||active||pending.size>=100;
  $('end').disabled=!active||!connected;
  document.querySelectorAll('[data-state]').forEach(b=>b.disabled=!active||!connected);
  $('replay').disabled=!latest;
}
function receive(packet){
  const incoming=decode(packet),id=incoming.session_id;
  if(!id)return;
  const result=reconcile(received.get(id),incoming);
  if(result!=='accepted')return;
  if(!pending.has(id)&&pending.size>=100)throw Error('Unsaved queue full. Restore saving before continuing.');
  received.set(id,incoming); latest=incoming;lastReceived=Date.now();
  if(!observations.has(id))observations.set(id,new Date().toISOString());
  const {session_id,...snapshot}=incoming;
  pending.set(id,{snapshot,first_observed_at:observations.get(id)});
  renderLive();
  if(incoming.state==='ended')void flush();
}
function publish(){if(device){device.sequence++;if(connected&&!$('pause').checked)receive(encode(device));}}
function setState(state){
  if(!device||device.state==='ended')return;
  if(state==='slouching'&&device.state!=='slouching')device.episode_count++;
  device.state=state;publish();renderLive();
}
function start(){
  if(!connected||device&&device.state!=='ended')return;
  const id=Math.max(dashboard.next_session_id,(device?.session_id||0)+1);
  device={session_id:id,protocol_version:1,state:'calibrating',sequence:0,tracked_seconds:0,slouch_seconds:0,episode_count:0};publish();renderLive();
}
async function flush(){
  if(busy||!pending.size||Date.now()<retryAt||$('offline').checked)return;
  busy=true;const [id,body]=pending.entries().next().value;
  try{
    await api(`/api/demo/sessions/${id}`,'PUT',body);
    if(pending.get(id)?.snapshot.sequence===body.snapshot.sequence)pending.delete(id);
    failures=0;retryAt=0;await refresh();
  }catch(e){
    if(e.status&&e.status<500&&e.status!==429){retryAt=Infinity;message(`Saving stopped: ${e.message}. Export saved history before resetting; pending readings remain in this tab.`);}
    else{failures++;retryAt=Date.now()+Math.min(30000,1000*2**Math.min(failures-1,5));message('Saving is unavailable. Received readings remain queued in this tab; saving will retry automatically.');}
  }finally{busy=false;renderLive();}
}
function toggleConnect(){connected=!connected;if(connected&&device&&!$('pause').checked)receive(encode(device));renderLive();}
const safely=fn=>async()=>{try{await fn();}catch(e){message(e.message);}};
$('connect').onclick=safely(toggleConnect);$('start').onclick=safely(start);$('end').onclick=safely(()=>setState('ended'));
for(const b of document.querySelectorAll('[data-state]'))b.onclick=safely(()=>setState(b.dataset.state));
$('seed').onclick=safely(async()=>{renderData(await api('/api/demo/seed','POST',{}));message('Sample week loaded. All history here is synthetic; the no-data day is intentional.');});
$('replay').onclick=safely(async()=>{const {session_id,...snapshot}=latest;const reply=await api(`/api/demo/sessions/${session_id}`,'PUT',{snapshot,first_observed_at:observations.get(session_id)});message(`Packet replay: ${reply.disposition}. Cumulative totals were counted once.`);await refresh();});
$('offline').onchange=()=>{if(!$('offline').checked){retryAt=0;message();void flush();}renderLive();};
$('pause').onchange=()=>{if(!$('pause').checked&&connected&&device)publish();renderLive();};
$('export').onclick=safely(()=>{const blob=new Blob([JSON.stringify({...dashboard,exported_at:new Date().toISOString()},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='buzz-buzz-simulated-history.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
$('reset').onclick=safely(async()=>{
  if(!confirm('Clear all simulated history and pending demo readings?'))return;
  stopTour();generation++;connected=false;device=null;latest=null;pending.clear();received.clear();observations.clear();
  while(busy)await new Promise(r=>setTimeout(r,50));
  retryAt=0;failures=0;$('offline').checked=false;$('pause').checked=false;
  renderData(await api('/api/demo','DELETE',{}));message();renderLive();
});
function stopTour(){if(tour)clearInterval(tour);tour=null;$('tour').textContent='Run guided demo · ~50 sec';}
$('tour').onclick=safely(async()=>{
  if(tour){stopTour();$('tour-status').textContent='Guided demo stopped. Manual controls are ready.';return;}
  if(device&&device.state!=='ended'){message('End the current simulated session before starting a guided demo.');return;}
  $('offline').checked=false;$('pause').checked=false;$('speed').value='60';retryAt=0;
  renderData(await api('/api/demo/seed','POST',{}));if(!connected)toggleConnect();start();
  $('tour').textContent='Stop guided demo';let elapsed=0;
  $('tour-status').textContent='1 / 7 · The simulated ESP32 calibrates. No tracked time accumulates yet.';
  tour=setInterval(()=>{
    elapsed++;
    if(elapsed===3){setState('upright');$('tour-status').textContent='2 / 7 · Device reports non-slouch posture. 60× simulation speed.';}
    if(elapsed===12){setState('slouching');$('tour-status').textContent='3 / 7 · Sustained slouch creates one episode. Its duration grows.';}
    if(elapsed===18){setState('upright');$('tour-status').textContent='4 / 7 · Recover. Recorded time continues; the episode count stays at one.';}
    if(elapsed===23){$('offline').checked=true;$('tour-status').textContent='5 / 7 · Saving outage. Live readings continue and queue for Rails.';}
    if(elapsed===28){$('offline').checked=false;retryAt=0;void flush();connected=false;renderLive();$('tour-status').textContent='6 / 7 · BLE disconnect. Device continues; dashboard is last-known.';}
    if(elapsed===34){toggleConnect();$('tour-status').textContent='6 / 7 · Reconnect recovers this session’s cumulative totals.';}
    if(elapsed===42){setState('ended');$('tour-status').textContent='7 / 7 · Session ended. Reward and history are saved; refresh to prove persistence.';stopTour();}
  },1000);
});
setInterval(()=>{
  try{
    if(device&&device.state!=='ended'){
      const step=Number($('speed').value);
      if(['upright','slouching'].includes(device.state)){device.tracked_seconds+=step;if(device.state==='slouching')device.slouch_seconds+=step;}
      publish();
    }
    renderLive();void flush();
  }catch(e){message(e.message);}
},1000);
window.addEventListener('beforeunload',e=>{if(pending.size){e.preventDefault();e.returnValue='';}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){lastReceived=0;renderLive();}});
$('date').textContent=new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
try{
  await refresh();
  const saved=dashboard.sessions[0];
  if(saved){latest={session_id:saved.id,...Object.fromEntries(['protocol_version','state','sequence','tracked_seconds','slouch_seconds','episode_count'].map(k=>[k,saved[k]]))};observations.set(saved.id,saved.first_observed_at);}
  renderLive();
}catch(e){message(`Could not load saved history: ${e.message}. Check that Rails is running, then refresh.`);}
