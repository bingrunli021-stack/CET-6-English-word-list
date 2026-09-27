const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('sync-test/index.html','utf8');
const ctx={window:{},enriched:new Map()};vm.createContext(ctx);
for(const f of ['translations-reviewed.js','translations-google.js','translations-pos.js'])vm.runInContext(fs.readFileSync('sync-test/'+f,'utf8'),ctx);
vm.runInContext(html.slice(html.indexOf('const RAW_WORDS='),html.indexOf('function escapeRegExp')),ctx);
vm.runInContext(html.slice(html.indexOf('function comparableMeaning'),html.indexOf('// One cancellable queue')),ctx);
const words=vm.runInContext('FALLBACK_WORDS.map((_,i)=>getWord(i))',ctx),by=Object.fromEntries(words.map(w=>[w.word.toLowerCase(),w]));
assert.equal(words.length,3991);
for(const [word,c] of Object.entries(ctx.window.CET6_POS_CORRECTIONS))assert.equal(by[word].meaning,c.pos+' '+c.meaning,word);
for(const [w,m] of Object.entries({ultimate:'adj. 最终的',strap:'n. 带子',cement:'n. 水泥',planetary:'adj. 行星的',stationery:'n. 文具',host:'n. 主持人',suspect:'v. 怀疑',melancholy:'adj. 忧郁的'}))assert.equal(by[w].meaning,m);
assert.equal(ctx.inferPrimaryPartOfSpeech('n. 被怀疑者 v. 怀疑','怀疑'),'v.');
assert.equal(ctx.inferPrimaryPartOfSpeech('n. 原因 v. 推论','论证'),'');
assert.equal(ctx.inferPrimaryPartOfSpeech('n. 支持 v. 支持','支持'),'');
assert.equal(ctx.inferPrimaryPartOfSpeech('n. 原因 v. 推论','原因'),'n.');
for(const w of words){assert.match(w.meaning,/^(n|v|adj|adv|prep|conj|pron|num|int|aux|pl)\./,w.word);assert.ok(!w.meaning.includes('undefined'));}
assert.match(by.favor.meaning+by.favor.secondaryMeaning,/n\. 恩惠/);
assert.doesNotMatch(by.genetic.secondaryMeaning||'',/n\./);
assert.match(fs.readFileSync('sync-test/sw.js','utf8'),/translations-pos\.js/);
console.log('PASS 3991 runtime meanings, 188 corrections, ambiguous fallback, secondary repairs');
