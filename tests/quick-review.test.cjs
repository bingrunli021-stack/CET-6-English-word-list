const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('sync-test/index.html','utf8');
class Storage {
  constructor(){Object.defineProperty(this,'m',{value:new Map(),enumerable:false});}
  get length(){return this.m.size;}
  key(i){return [...this.m.keys()][i];}
  getItem(k){return this.m.get(k)??null;}
  setItem(k,v){this.m.set(k,String(v));this[k]=String(v);}
  removeItem(k){this.m.delete(k);delete this[k];}
}
function client(storage=new Storage()) {
  const nodes=new Map(), events={}, timers=new Map();let timerId=0;
  const element=id=>{if(!nodes.has(id))nodes.set(id,{id,innerHTML:'',value:'',textContent:'',setAttribute(){},classList:{toggle(){},add(){},remove(){}},querySelectorAll:()=>[]});return nodes.get(id);};
  const ctx={localStorage:storage,crypto:require('node:crypto').webcrypto,console,URLSearchParams,
    location:{search:'',origin:'https://example.test',pathname:'/sync-test/'},navigator:{onLine:false},
    matchMedia:()=>({matches:false,addEventListener(){}}),performance:{now:()=>0},
    document:{hidden:false,body:{classList:{toggle(){}}},documentElement:{dataset:{}},getElementById:element,
      querySelector:()=>null,querySelectorAll:()=>[],addEventListener:(e,f)=>(events[e]??=[]).push(f)},
    addEventListener:(e,f)=>(events[e]??=[]).push(f),scrollTo(){},
    setTimeout:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id;},
    clearTimeout:id=>timers.delete(id),setInterval(){},fetch:async()=>{throw Error('isolated offline QA');}};
  ctx.window=ctx;vm.createContext(ctx);
  for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    const src=m[1].match(/src="\.\/([^"?]+)/)?.[1];if(src==='supabase.min.js')continue;
    vm.runInContext(src?fs.readFileSync('sync-test/'+src,'utf8'):m[2],ctx);
  }
  const run=s=>vm.runInContext(s,ctx),copy=s=>JSON.parse(JSON.stringify(run(s)));
  let saves=0,spoken=[];ctx.onSave=()=>saves++;ctx.playSpeech=parts=>spoken.push(parts);
  run('const originalQuickTestSave=saveState;saveState=()=>{originalQuickTestSave();onSave()};');
  return {ctx,run,copy,storage,events,timers,element,get saves(){return saves;},get spoken(){return spoken;}};
}
const c=client(),{run,copy}=c;
run(`state.records={0:{status:'done',level:3,learnedAt:dayKey(),due:dayKey(),wrong:0},
  1:{status:'hard',level:1,learnedAt:dayKey(),due:dayKey(),wrong:3},
  2:{status:'hard',level:1,learnedAt:dayKey(),due:addDays(dayKey(),1),wrong:8},
  3:{status:'new'},99999:{status:'hard',due:dayKey()}};`);
assert.deepEqual(copy('quickPool()'),[1,0,2],'due hard words first, supplemental hard words last; new and invalid excluded');
run('delete state.records[99999];quickStart(10);');assert.equal(run('quickSession.total'),3);
const promptHtml=c.element('app').innerHTML;
assert.ok(!promptHtml.includes(run('getWord(1).meaning')),'answer hidden before recall');
assert.equal(c.saves,0);run('quickReveal();');assert.equal(c.saves,0,'revealing is not a grade');
run("quickGrade('again');quickGrade('good');");
assert.equal(c.saves,1,'double click cannot grade twice');
assert.equal(run('state.records[1].wrong'),4);
assert.equal(run('state.records[1].due'),run('addDays(dayKey(),1)'));
assert.equal(run('quickSession.queue.length'),4);
run('quickNext();');assert.equal(run('quickSession.revealed'),undefined,'next card hides answer again');
run("quickGrade('good');");assert.equal(run('state.records[0].level'),4);
run('quickUndoGrade();');assert.equal(run('state.records[0].level'),3,'undo restores original schedule');
run("quickGrade('good');quickUndoGrade('again');");
assert.equal(run('state.records[0].level'),1,'correction removes optimistic grade');
assert.equal(run('state.records[0].status'),'hard');
// Drain the round. Automatic retries cannot boost mastery or count another error.
for(let safety=0;safety<15&&run("quickSession.phase!=='result'");safety++) {
  if(run("quickSession.phase==='feedback'"))run('quickNext();');
  else run("quickGrade('good');");
}
assert.equal(run('quickSession.phase'),'result');
assert.equal(run('state.records[1].wrong'),4);
assert.equal(run('state.records[1].level'),1);
assert.equal(run('state.records[2].level'),1,'early supplemental recall never extends interval');
assert.deepEqual(copy('quickMissed()'),[],'successful retry clears the session miss list');
// A one-word failure round terminates after one automatic repeat.
run('quickStart(1,"forward",[1]);');
run("quickGrade('again');quickNext();quickGrade('again');quickNext();");
assert.equal(run('quickSession.phase'),'result');assert.equal(run('quickSession.queue.length'),2);
assert.deepEqual(copy('quickMissed()'),[1]);
// Reverse direction writes only the existing independent reverse records.
const forward=run('JSON.stringify(state.records)');
run('quickStart(1,"reverse",[0]);');
assert.ok(!c.element('app').innerHTML.includes(run('getWord(0).word')),'no English answer leakage');
run("quickGrade('good');");assert.equal(run('state.reverseRecords[0].lastCorrect'),true);
assert.equal(run('JSON.stringify(state.records)'),forward);
// Listen-only playback and completion never count as successful recall.
const beforeListen=c.saves;
run('quickStart(1,"listen",[0]);quickReveal();quickNext();');
assert.equal(c.saves,beforeListen);assert.equal(run('quickSession.heard'),1);
// Grade writes enter the existing offline sync overlay, without persisting queues there.
assert.ok(run('syncEngine.pending().some(e=>JSON.parse(e.key)[1]==="records")'));
assert.ok(!run('syncEngine.pending().some(e=>e.key.includes("quick"))'));
// A refreshed page restores the checkpoint, paused, without replaying a grade.
run('quickStart(1,"forward",[0]);quickReveal();quickGrade("again");quickLeave();');
const restored=client(c.storage);
assert.equal(restored.run('quickSession.at'),run('quickSession.at'));
assert.equal(restored.run('quickSession.phase'),'feedback');
assert.equal(restored.run('quickRunning'),false);assert.equal(restored.saves,0);
restored.run('quickResume();');assert.equal(restored.run('quickRunning'),true);
// Leaving/backgrounding cancels pending movement and speech.
restored.ctx.document.hidden=true;
for(const f of restored.events.visibilitychange)f();
assert.equal(restored.run('quickRunning'),false);assert.equal(restored.run('quickTimer'),null);
// Checkpoints are isolated between accounts.
restored.run('quickOwner=()=>"another-account";quickLoad();');
assert.equal(restored.run('quickSession'),null);
// Undo refuses to overwrite a newer record from another device.
run('quickStart(1,"forward",[0]);quickGrade("again");state.records[0].wrong=100;quickUndoGrade();');
assert.equal(run('state.records[0].wrong'),100);
// Cloud acknowledgements add updatedAt; this alone must not block Undo.
run('quickStart(1,"forward",[0]);quickGrade("again");state.records[0].updatedAt=Date.now();quickUndoGrade();');
assert.equal(run('state.records[0].wrong'),100);
// Completed supplemental words are excluded from the next group for this mode only.
run('quickStart(1,"forward",[2]);quickGrade("good");quickNext();');
assert.ok(!copy('quickPool()').includes(2));
assert.ok(copy('quickPool("reverse")').includes(2));
// Exercise the actual scheduled callback, not just the manual Next button.
run('quickStart(2,"forward",[0,1]);quickGrade("good");');
const auto=c.timers.get(run('quickTimer'));assert.ok(auto);auto.fn();
assert.equal(run('quickSession.at'),1);assert.equal(run('quickSession.phase'),'recall');
run('quickPause();');assert.equal(run('quickTimer'),null);
// Automatic listening reveals then moves on, with no writes to either mastery model.
const beforeAutoListen=c.saves;
run('quickStart(1,"listen",[2]);');c.timers.get(run('quickTimer')).fn();
assert.equal(run('quickSession.revealed'),true);
c.timers.get(run('quickTimer')).fn();assert.equal(run('quickSession.phase'),'result');
assert.equal(c.saves,beforeAutoListen);
// Retry success is recorded in the independent Chinese-to-English results.
run('quickStart(1,"reverse",[2]);quickGrade("again");quickNext();quickGrade("good");');
assert.equal(run('state.reverseRecords[2].lastCorrect'),true);
console.log('PASS quick review: priority, hidden answers, grading, correction, capped retries, reload, background pause, account isolation and independent reverse/listening modes');
