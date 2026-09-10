const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('sync-test/index.html', 'utf8');

assert.match(html, /data-view="hard"/, 'bottom navigation exposes the hard-word study view');
assert.match(html, /function hardIndices\(\).*status==='hard'/, 'the queue reuses the existing hard status');
assert.match(html, /function renderHard\(\)/, 'hard-word study view must render');
assert.match(html, /slice\(0,20\)/, 'a session is capped to a manageable visible batch');
assert.match(html, /hardRecall\(\$\{i\},true\)/, 'remembered action is wired');
assert.match(html, /hardRecall\(\$\{i\},false\)/, 'still-hard action is wired');
assert.match(html, /r\.wrong=\(r\.wrong\|\|0\)\+1/, 'still-hard action records an error');
assert.match(html, /r\.due=addDays\(dayKey\(\),1\)/, 'still-hard action schedules tomorrow');
assert.doesNotMatch(html, /state\.hard(?:Words|Session|Queue)/, 'session UI must not create a second persisted progress model');

console.log('PASS dedicated hard-word study reuses synced per-word state');
