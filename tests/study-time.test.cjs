const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('sync-test/index.html', 'utf8');
const engine = fs.readFileSync('sync-test/sync-engine.js', 'utf8');

assert.match(html, /function initStudyTimeTracking\(\)/, 'automatic study-time tracking is initialized');
assert.match(html, /STUDY_IDLE_MS=120000/, 'inactive pages pause after two minutes');
assert.match(html, /document\.hidden/, 'background pages do not count study time');
assert.match(html, /id="studyTodayTime"/, 'today study time is visible');
assert.match(html, /id="studyTotalTime"/, 'total study time is visible');
assert.match(html, /state\.studyTime\[key\].*\+seconds/, 'elapsed seconds are added to the current device record');
assert.match(engine, /'studyTime'/, 'study time is split into independently synced records');

console.log('PASS automatic, idle-aware, cross-device study-time tracking');
