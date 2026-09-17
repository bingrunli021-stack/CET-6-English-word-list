const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('sync-test/index.html', 'utf8');
const worker = fs.readFileSync('sync-test/sw.js', 'utf8');

assert.match(html, /<details class="oxford-definition">/, 'Oxford lookup must be collapsed by default');
assert.match(html, /<summary>查看牛津英英释义<\/summary>/, 'Oxford lookup must have a clear Chinese label');
assert.match(html, /https:\/\/www\.oxfordlearnersdictionaries\.com\/search\/english\/direct\/\?q=/, 'lookup must use the official Oxford Learner’s Dictionaries search endpoint');
assert.match(html, /encodeURIComponent\(word\)/, 'word heads must be safely encoded in Oxford lookup URLs');
assert.match(html, /target="_blank" rel="noopener noreferrer"/, 'Oxford lookup must open safely in a new tab');
assert.match(html, /\$\{oxfordDefinitionHtml\(w\)\}/, 'every rendered study card must include the Oxford foldout');
assert.doesNotMatch(html, /OXFORD_(?:API|APP)_(?:KEY|ID)|api[_-]?key/i, 'the static page must not expose Oxford API credentials');
assert.match(worker, /cet6-test3-shell-12/, 'offline shell version must be current');

console.log('PASS collapsible Oxford official lookup on every word card');
