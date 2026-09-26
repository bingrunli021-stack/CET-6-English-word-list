const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const context={window:{},state:{accent:'en-US'}};vm.createContext(context);
vm.runInContext(fs.readFileSync('sync-test/phonetics.js','utf8'),context);
vm.runInContext(fs.readFileSync('sync-test/translations-reviewed.js','utf8'),context);
const ipa=context.window.CET6_PHONETICS,words=context.window.CET6_REVIEWED_TRANSLATIONS;
assert.deepEqual(Object.keys(ipa),Object.keys(words));assert.equal(Object.keys(ipa).length,3991);
for(const [word,p] of Object.entries(ipa)){
 for(const entry of [p,...(p.variants||[])])for(const accent of ['uk','us']){
  const value=entry[accent];assert.ok(value?.trim(),`${word} missing ${accent}`);
  assert.doesNotMatch(value,/[\u200b\u200c\u200d\ufeff\u4e00-\u9fff0-9<>\\]/,`${word} contains invalid artifacts`);
  assert.equal((value.match(/\(/g)||[]).length,(value.match(/\)/g)||[]).length);
  for(const variant of value.split(';'))assert.ok((variant.match(/ˈ/g)||[]).length<=1,`${word}: joined pronunciations`);
  if(accent==='us')assert.ok(!value.includes('əʊ'),`${word}: UK diphthong in US field`);
 }
}
assert.equal(ipa.consistent.us,'kənˈsɪstənt');
assert.equal(ipa.proximately.uk,'ˈprɒksɪmətli');
assert.equal(ipa.proximately.us,'ˈprɑːksəmətli');
assert.equal(ipa.excuse.variants.find(v=>v.label==='v.').us,'ɪkˈskjuːz');
assert.equal(ipa.attribute.variants.find(v=>v.label==='n.').uk,'ˈætrɪbjuːt');
assert.equal(ipa.present.variants.find(v=>v.label==='v.').us,'prɪˈzent');
const html=fs.readFileSync('sync-test/index.html','utf8');
vm.runInContext(html.slice(html.indexOf('function phoneticFor(word)'),html.indexOf('\nfunction card(',html.indexOf('function phoneticFor(word)'))),context);
assert.match(context.phoneticFor('competent'),/^美 \/ˈkɑːmpɪtənt\/$/);
context.state.accent='en-GB';assert.match(context.phoneticFor('competent'),/^英 \/ˈkɒmpɪtənt\/$/);
assert.match(context.phoneticFor('compact'),/adj\.\/v\. \/kəmˈpækt\/；n\. \/ˈkɒmpækt\//);
assert.equal(context.phoneticFor('missing-word'),'音标待核对');
ipa.legacy='test';assert.equal(context.phoneticFor('legacy'),'/test/');delete ipa.legacy;
const audit=JSON.parse(fs.readFileSync('audits/phonetics-20260926.json','utf8'));
assert.equal(audit.entries.length,3991);assert.equal(audit.summary.missing,0);
for(const row of audit.entries){assert.ok(row.source);assert.equal(JSON.stringify(row.current),JSON.stringify(ipa[row.word]));}
for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);
console.log('PASS all 3991 UK/US entries, clean notation, source coverage, POS variants, accent switching, cache compatibility and script syntax');
