const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('sync-test/index.html', 'utf8');

assert.match(html, /data-view="weak"/, 'bottom navigation exposes the low-mastery study view');
assert.match(html, /function weakIndices\(\).*r\?\.learnedAt.*r\.status!=='new'.*\(r\.level\|\|0\)<4/, 'queue contains only encountered Level 1-3 words');
assert.match(html, /slice\(0,20\)/, 'each study round is capped at 20 words');
assert.match(html, /function renderWeak\(\)/, 'low-mastery study renders its study and result states');
assert.match(html, /重练本轮未记住/, 'session-only missed-word retry is available');

const answerFunction = html.match(/function answerWeakStudy\([\s\S]*?function nextWeakStudy\(/)?.[0] || '';
assert.ok(answerFunction, 'answerWeakStudy must exist');
assert.doesNotMatch(answerFunction, /state\.records|saveState\(|markLocalChange|\.level\s*=|\.status\s*=|\.due\s*=/, 'study answers must not mutate persisted mastery or review state');
assert.doesNotMatch(html, /state\.weakStudy/, 'session UI must not create a second persisted progress model');

console.log('PASS low-mastery study is read-only for mastery and review progress');
