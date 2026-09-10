const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('sync-test/index.html', 'utf8');

assert.match(html, /onclick="startDailyCheck\(\)">检测今日新词</, 'today view exposes the daily check');
assert.match(html, /indices\|\|getPlan\(\)\.indices/, 'the check uses the existing fixed daily plan');
assert.match(html, /function renderDailyCheck\(\)/, 'daily quiz and result views are rendered');
assert.match(html, /function retryDailyMistakes\(\)/, 'wrong-only retest is available');
assert.match(html, /r\.status='hard';r\.level=1;r\.due=addDays\(dayKey\(\),1\)/, 'wrong answers become fuzzy and are due tomorrow');
assert.match(html, /if\(r\.status==='new'\).*r\.status='done'/, 'a correct first encounter enters the normal review path');
assert.doesNotMatch(html, /state\.dailyCheck/, 'quiz UI does not introduce a second persisted progress model');

console.log('PASS daily new-word check reuses the daily plan and synced word records');
