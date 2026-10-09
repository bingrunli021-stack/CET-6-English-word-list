const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {Engine, newer, flatten} = require('../sync-test/sync-engine');
const html = fs.readFileSync('sync-test/index.html','utf8');
const script = fs.readFileSync('sync-test/reverse-practice.js','utf8');
class Storage {
  constructor(){this.m = new Map();}
  get length(){return this.m.size;}
  key(i){return [...this.m.keys()][i];}
  getItem(k){return this.m.get(k) ?? null;}
  setItem(k,v){this.m.set(k,String(v));}
  removeItem(k){this.m.delete(k);}
}
const nodes = new Map();
const element = id => {
  if (!nodes.has(id)) nodes.set(id,{id,innerHTML:'',value:'',textContent:'',classList:{add(){},remove(){},toggle(){}},setAttribute(){},querySelectorAll(){return [];}});
  return nodes.get(id);
};
const ctx = {
  localStorage:new Storage(), crypto:require('node:crypto').webcrypto, console, URLSearchParams,
  navigator:{onLine:true}, location:{search:'',origin:'https://example.test',pathname:'/sync-test/'},
  performance:{now:()=>0}, matchMedia:()=>({matches:false,addEventListener(){}}),
  document:{documentElement:{dataset:{}},getElementById:element,querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},hidden:false},
  addEventListener(){},setTimeout(){},clearTimeout(){},setInterval(){},scrollTo(){},
  fetch:async()=>{throw Error('offline test');}
};
ctx.window = ctx;
vm.createContext(ctx);
for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
  const src = match[1].match(/src="\.\/([^"?]+)/)?.[1];
  // Auth stays disabled in this isolated client. Real user accounts are never touched.
  if (src === 'supabase.min.js') continue;
  vm.runInContext(src ? fs.readFileSync('sync-test/'+src,'utf8') : match[2],ctx);
}
const run = source => vm.runInContext(source,ctx);
const copy = value => JSON.parse(JSON.stringify(value));
let saves = 0, spoken = [];
ctx.playSpeech = parts => {spoken.push(copy(parts));};
run(`const originalSaveState=saveState;saveState=function(){originalSaveState();onTestSave()};`);
ctx.onTestSave = () => saves++;

assert.match(html,/data-view="reverse"/);
assert.ok(html.indexOf('reverse-practice.css') > html.indexOf('</style>'), 'responsive navigation override loads after base styles');
assert.ok(element('app').innerHTML.includes('今日中→英练习'), 'existing homepage initializes with the new entry');
run(`state.records={0:{status:'done',learnedAt:'2026-10-01',level:4,due:'2026-11-01'},1:{status:'hard',learnedAt:'2026-10-01',level:1,due:'2026-10-02'},2:{status:'new'}};`);
const originalRecords = run('JSON.stringify(state.records)'), originalNext = run('state.nextIndex');
run('openReversePractice();startReversePractice([0]);');
const target = run('currentReverseQuestion().word');
assert.ok(element('app').innerHTML.includes(run('currentReverseQuestion().prompt')));
assert.ok(!element('app').innerHTML.includes(target), 'unrevealed HTML does not contain the English answer');
assert.doesNotMatch(element('app').innerHTML,/reverse-revealed|听英文发音/);
run('speakReverseAnswer();');assert.equal(spoken.length,0);
run('speakReversePrompt();');assert.equal(spoken[0][0].lang,'zh-CN');assert.doesNotMatch(spoken[0][0].text,/adj\.|consistent/);
run('nextReverseQuestion();gradeReverseAnswer(true);');assert.equal(saves,0,'cannot skip or grade an unrevealed answer');
run('updateReverseDraft("  CONSISTENT  ");render();');assert.match(element('app').innerHTML,/value="  CONSISTENT  "/);
element('reverseAnswer').value='  CONSISTENT  ';
run('checkReverseSpelling();');assert.equal(run('currentReverseQuestion().spellingCorrect'),true);
assert.equal(saves,0,'spelling feedback waits for user confirmation');
assert.ok(element('app').innerHTML.includes(target));
run('speakReverseAnswer();');assert.equal(spoken.at(-1)[0].text,target);
run('gradeReverseAnswer(true);gradeReverseAnswer(false);');
assert.equal(saves,1,'double clicks only create one saved result');
assert.equal(run('state.reverseRecords[0].attempts'),1);
assert.equal(run('JSON.stringify(state.records)'),originalRecords);
assert.equal(run('state.nextIndex'),originalNext);
run('nextReverseQuestion();');assert.equal(run('reverseSession.phase'),'result');
run('startReversePractice([1]);forgotReverseAnswer();forgotReverseAnswer();');
assert.equal(saves,2);assert.equal(run('state.reverseRecords[1].lastCorrect'),false);
run('nextReverseQuestion();retryReversePractice();');assert.equal(run('reverseSession.retry'),true);
assert.equal(run('currentReverseQuestion().i'),1);assert.equal(run('currentReverseQuestion().revealed'),false);
run('revealReverseAnswer();gradeReverseAnswer(true);');
assert.equal(run('state.reverseRecords[1].attempts'),2);
run('changeReverseScope("missed");');assert.equal(run('reverseIndices().length'),0,'retry success removes the word from the missed range');
run('changeReverseScope("learned");');assert.deepEqual(copy(run('reverseIndices()')),[0,1]);
run('changeReverseScope("hard");');assert.deepEqual(copy(run('reverseIndices()')),[1]);
run('changeReverseScope("today");');assert.deepEqual(copy(run('reverseIndices()')),copy(run('getPlan().indices')));
run('changeReverseScope("all");startReversePractice();');assert.equal(run('reverseSession.qs.length'),20);
for (const q of copy(run('reverseSession.qs'))) run('forgotReverseAnswer();nextReverseQuestion();');
run('startReversePractice();');
assert.equal(run('reverseSession.qs.some(q=>reverseSeen.has(q.i))'),false,'next batch excludes previously graded words');
run('updateReverseDraft("<script>test</script>\\\"");render();');
assert.match(element('app').innerHTML,/&lt;script&gt;/);assert.doesNotMatch(element('app').innerHTML,/<script>test/);
const allPrompts = run('FALLBACK_WORDS.map((_,i)=>reversePrompt(getWord(i).meaning))');
for (const [i,prompt] of allPrompts.entries()) {
  assert.ok(prompt.trim().length, 'nonempty prompt at '+i);
  assert.doesNotMatch(prompt,/[A-Za-z]/,'no English leakage at '+i);
}
assert.equal(ctx.reversePrompt('v. (mislead过去式)误导'),'误导');
assert.equal(ctx.normalizeReverseAnswer('  DON’T   KNOW  '), "don't know");
assert.match(fs.readFileSync('sync-test/sw.js','utf8'),/reverse-practice\.js.*reverse-practice\.css/,'offline shell includes practice assets');
run('resetReversePractice();');assert.equal(run('reverseSession'),null);

// Exercise the existing RPC contract with independent clients and a durable offline queue.
(async () => {
  const server = {}, blank = {state:{version:6,records:{},reverseRecords:{},todayPlans:{},history:{},studyTime:{}},listenState:{completed:{}}};
  let seq=0,clock=100,online=true;
  const rpc = async ({changes,seed}) => {
    if(!online) throw Error('offline');
    for(const e of seed) if(!server[e.key]) server[e.key]=copy(e);
    for(const e of changes) if(newer(e,server[e.key])) server[e.key]=copy(e);
    return {records:copy(Object.values(server))};
  };
  const create = (storage = new Storage()) => new Engine({storage,scope:'test-user',initial:blank,rpc,now:()=>++clock,id:()=>String(++seq).padStart(8,'0')});
  const a=create(),b=create();await a.sync();await b.sync();
  const edit = (client,i,result) => {const p=copy(client.current);p.state.reverseRecords[i]=result;client.capture(p);};
  edit(a,0,{attempts:1,correct:1,missed:0,lastCorrect:true});
  edit(b,1,{attempts:1,correct:0,missed:1,lastCorrect:false});
  await Promise.all([a.sync(),b.sync()]);await a.sync();await b.sync();
  assert.deepEqual(a.current.state.reverseRecords,b.current.state.reverseRecords);
  assert.equal(Object.keys(a.current.state.reverseRecords).length,2);
  assert.ok(Object.keys(flatten(a.current)).includes('["state","reverseRecords","0"]'));
  // A still-open pre-feature tab may send an empty whole-map row. It cannot wipe per-word rows.
  const legacyKey='["state","reverseRecords"]';
  server[legacyKey]={key:legacyKey,value:{},updatedAt:++clock,mutationId:'old-tab',deleted:false};
  await b.sync();assert.equal(Object.keys(b.current.state.reverseRecords).length,2);
  online=false;edit(a,2,{attempts:1,correct:1,lastCorrect:true});await assert.rejects(a.sync());
  const resumed=create(a.storage);assert.equal(resumed.current.state.reverseRecords[2].correct,1);
  online=true;await resumed.sync();await b.sync();assert.equal(b.current.state.reverseRecords[2].correct,1);
  const imported=copy(b.current);imported.state.reverseRecords[3]={attempts:2,correct:1,lastCorrect:false};
  b.importPayload(imported);await b.sync();await resumed.sync();assert.equal(resumed.current.state.reverseRecords[3].attempts,2);
  const fresh=create();await fresh.sync();assert.equal(fresh.current.state.reverseRecords[3].attempts,2);
  fresh.replace(blank);await fresh.sync();await resumed.sync();assert.deepEqual(resumed.current.state.reverseRecords,{});
  console.log('PASS reverse practice: full page bootstrap, answer hiding, all 3991 prompts, spelling, grading, retries, navigation, progress isolation and per-word offline sync');
})().catch(e => {console.error(e);process.exit(1);});
