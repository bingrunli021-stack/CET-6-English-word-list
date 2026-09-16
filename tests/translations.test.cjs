const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('sync-test/index.html', 'utf8');
const reviewedSource = fs.readFileSync('sync-test/translations-reviewed.js', 'utf8');
const googleSource = fs.readFileSync('sync-test/translations-google.js', 'utf8');
const googleBuilder = fs.readFileSync('scripts/build-google-translations.mjs', 'utf8');
const worker = fs.readFileSync('sync-test/sw.js', 'utf8');
const context = { window: {} };
vm.createContext(context);
vm.runInContext(reviewedSource, context);
vm.runInContext(googleSource, context);
const meanings = context.window.CET6_REVIEWED_TRANSLATIONS;
const googleMeanings = context.window.CET6_GOOGLE_TRANSLATIONS;

assert.equal(Object.keys(meanings).length, 3991, 'every unique word head must have a reviewed meaning');
assert.match(html, /translations-reviewed\.js\?v=/, 'the page must load reviewed translations');
assert.match(html, /translations-google\.js\?v=/, 'the page must load Google translations');
assert.match(worker, /translations-reviewed\.js/, 'offline cache must include reviewed translations');
assert.match(worker, /translations-google\.js/, 'offline cache must include Google translations');
assert.equal(Object.keys(googleMeanings).length, 3991, 'every unique word head must have a Google translation');
assert.deepEqual(Object.keys(googleMeanings), Object.keys(meanings), 'Google translation keys must match the reviewed word heads');
assert.match(html, /function isLearnedWord\(i\)/, 'the page must distinguish learned and unlearned words');
assert.match(html, /CET6_GOOGLE_TRANSLATIONS/, 'unlearned words must read from the Google translation map');
assert.match(html, /function secondaryMeaningHtml\(w\)/, 'unlearned words must offer collapsible secondary meanings');
assert.match(html, /<details class="secondary-meanings">/, 'secondary meanings must be collapsed by default');
assert.match(html, /校订词典补充/, 'secondary meanings must identify their reviewed source');
assert.match(html, /secondaryMeaning=comparableMeaning\(b\.meaning\)/, 'the reviewed meaning must supplement the Google primary meaning');
assert.match(html, /x\.w\.secondaryMeaning\|\|''/, 'library search must include collapsed secondary meanings');
assert.match(googleBuilder, /MkEWBc/, 'Google translations must use isolated batch RPC calls');
assert.doesNotMatch(googleBuilder, /batch\.join\(['"]\\n['"]\)/, 'word heads must not be combined into one contextual text');

for (const [word, meaning] of Object.entries(googleMeanings)) {
  assert.ok(meaning.trim(), `${word} has an empty Google translation`);
  assert.match(meaning, /[\u3400-\u9fff]/, `${word} Google translation has no Chinese text`);
  assert.doesNotMatch(meaning, /[\t\r\n]/, `${word} Google translation contains a line break`);
}

const isolatedGoogleSamples = {
  capital: '首都',
  consistent: '持续的',
  battery: '电池',
  strap: '带子',
  refrain: '避免',
};
for (const [word, meaning] of Object.entries(isolatedGoogleSamples)) assert.equal(googleMeanings[word], meaning);

for (const [word, meaning] of Object.entries(meanings)) {
  assert.ok(meaning.trim(), `${word} has an empty meaning`);
  assert.ok(meaning.length <= 100, `${word} meaning is too long for a study card`);
  assert.doesNotMatch(meaning, /[\t\r\n\[\]]/, `${word} contains an unclean artifact`);
  assert.doesNotMatch(meaning, /\s{2,}|[；，]\s*$/, `${word} has malformed spacing or punctuation`);
}

const expected = {
  consistent: 'adj. 一致的；始终如一的；相符的',
  defy: 'v. 违抗，反抗；蔑视；使成为不可能',
  receipt: 'n. 收到；收据',
  stockbroker: 'n. 股票经纪人',
  interfere: 'v. 干涉；妨碍；冲突',
  program: 'n. 程序；节目；计划 v. 编程；安排',
};
for (const [word, meaning] of Object.entries(expected)) assert.equal(meanings[word], meaning);

console.log('PASS 3991 reviewed translations and representative corrections');
