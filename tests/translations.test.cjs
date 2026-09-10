const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('sync-test/index.html', 'utf8');
const reviewedSource = fs.readFileSync('sync-test/translations-reviewed.js', 'utf8');
const worker = fs.readFileSync('sync-test/sw.js', 'utf8');
const context = { window: {} };
vm.createContext(context);
vm.runInContext(reviewedSource, context);
const meanings = context.window.CET6_REVIEWED_TRANSLATIONS;

assert.equal(Object.keys(meanings).length, 3991, 'every unique word head must have a reviewed meaning');
assert.match(html, /translations-reviewed\.js\?v=/, 'the page must load reviewed translations');
assert.match(worker, /translations-reviewed\.js/, 'offline cache must include reviewed translations');

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
