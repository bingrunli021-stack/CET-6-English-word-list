const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('sync-test/index.html','utf8');
const source=html.slice(html.indexOf('// One cancellable queue'),html.indexOf("addEventListener('pagehide',stopSpeech);")+"addEventListener('pagehide',stopSpeech);".length);
let spoken=[];
const context={state:{accent:'en-US',rate:1.1},toast(){},addEventListener(){},getComputedStyle:n=>({display:n.display||'block',visibility:'visible'}),SpeechSynthesisUtterance:class{constructor(text){this.text=text}},speechSynthesis:{cancel(){},getVoices:()=>[{lang:'en-US'},{lang:'zh-CN'}],speak:u=>spoken.push(u)}};
context.window=context;
vm.createContext(context);vm.runInContext(source,context);
const closed={tagName:'DETAILS',open:false};
const primary={textContent:'n. 首都'};
const secondary={textContent:'n. 资本',parentElement:closed};
const root={isConnected:true,querySelectorAll:()=>[primary,secondary]};
assert.equal(context.visibleSpeechMeaning(root),'n. 首都');
closed.open=true;assert.equal(context.visibleSpeechMeaning(root),'n. 首都；n. 资本');
closed.display='none';assert.equal(context.visibleSpeechMeaning(root),'n. 首都');
root.isConnected=false;assert.equal(context.visibleSpeechMeaning(root),'');root.isConnected=true;
context.playSpeech([{text:'capital'},{text:()=>context.visibleSpeechMeaning(root),lang:'zh-CN'}]);
assert.equal(spoken[0].text,'capital');spoken[0].onend();assert.equal(spoken[1].text,'n. 首都');assert.equal(spoken[1].lang,'zh-CN');assert.equal(spoken[1].voice.lang,'zh-CN');assert.equal(spoken[1].rate,1.1);
// Meaning visibility is checked when its turn arrives, never cached before playback.
spoken=[];context.playSpeech([{text:'capital'},{text:()=>context.visibleSpeechMeaning(root),lang:'zh-CN'}]);root.isConnected=false;spoken[0].onend();assert.equal(spoken.length,1);root.isConnected=true;
// Stop and replacement invalidate late callbacks from the previous queue.
spoken=[];context.playSpeech([{text:'first'},{text:'second'}]);const stale=spoken[0];context.stopSpeech();stale.onend();assert.equal(spoken.length,1);
context.playSpeech([{text:'replacement'}]);stale.onend();assert.deepEqual(spoken.map(u=>u.text),['first','replacement']);
// Phrase reader uses the supplied card scope, never the whole word's translations.
context.getWord=()=>({word:'capital',phrases:[{phrase:'capital city',translation:'首都城市'}]});
const phraseRoot={isConnected:true,querySelectorAll:()=>[{textContent:'首都城市'}]};
spoken=[];context.speakPhrase(0,0,{closest:()=>phraseRoot});spoken[0].onend();assert.deepEqual(spoken.map(u=>u.text),['capital city','首都城市']);
phraseRoot.querySelectorAll=()=>[];spoken=[];context.speakPhrase(0,0,{closest:()=>phraseRoot});spoken[0].onend();assert.equal(spoken.length,1);
context.getPlan=()=>({indices:[0,1]});context.document={querySelector:()=>root};spoken=[];context.speakBatch();spoken[0].onend();spoken[1].onend();assert.deepEqual(spoken.map(u=>u.text),['capital','n. 首都','capital']);
assert.match(html,/onclick="speakPhrase\(\$\{i\},\$\{j\},this\)"/);
assert.match(html,/function render\(\)\{stopSpeech\(\)/);
console.log('PASS bilingual order and voices, visible/hidden/folded meanings, phrase scope, batch order and cancellation');
