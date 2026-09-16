#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'sync-test', 'translations-reviewed.js');
const outputPath = path.join(root, 'sync-test', 'translations-google.js');

const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync(sourcePath, 'utf8'), context);
const words = Object.keys(context.window.CET6_REVIEWED_TRANSLATIONS || {});

if (!words.length) throw new Error('No CET-6 word heads found');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function translateText(text) {
  const params = new URLSearchParams({
    client: 'gtx',
    sl: 'en',
    tl: 'zh-CN',
    dt: 't',
    q: text,
  });
  let lastError;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const response = await fetch('https://translate.googleapis.com/translate_a/single', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'User-Agent': 'Mozilla/5.0 CET6-translation-builder/1.0',
        },
        body: params,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      return (payload[0] || []).map((part) => part[0] || '').join('');
    } catch (error) {
      lastError = error;
      const delay = Math.min(60000, 5000 * (2 ** attempt));
      process.stderr.write(`\nTranslate retry in ${Math.round(delay / 1000)}s: ${error.message}\n`);
      await sleep(delay);
    }
  }
  throw lastError;
}

async function translateBatch(batch) {
  const translated = await translateText(batch.join('\n'));
  const lines = translated.split('\n').map((line) => line.trim());
  if (lines.length === batch.length && lines.every(Boolean)) return lines;
  if (batch.length === 1) return [translated.trim() || batch[0]];
  const midpoint = Math.ceil(batch.length / 2);
  return [
    ...await translateBatch(batch.slice(0, midpoint)),
    ...await translateBatch(batch.slice(midpoint)),
  ];
}

const batchSize = 250;
const batches = [];
for (let i = 0; i < words.length; i += batchSize) batches.push(words.slice(i, i + batchSize));

const translations = {};
let nextBatch = 0;
async function worker() {
  while (nextBatch < batches.length) {
    const batchIndex = nextBatch++;
    const batch = batches[batchIndex];
    const translated = await translateBatch(batch);
    batch.forEach((word, index) => { translations[word] = translated[index]; });
    process.stderr.write(`\rTranslated ${Math.min((batchIndex + 1) * batchSize, words.length)} / ${words.length}`);
    await sleep(1000);
  }
}

await worker();
process.stderr.write('\n');

const ordered = Object.fromEntries(words.map((word) => [word, translations[word]]));
if (Object.keys(ordered).length !== words.length || Object.values(ordered).some((value) => !value)) {
  throw new Error('Google translation output is incomplete');
}

const output = [
  '// Generated from Google Translate by scripts/build-google-translations.mjs.',
  '// Used only for words without an existing learning record.',
  `window.CET6_GOOGLE_TRANSLATIONS=Object.freeze(${JSON.stringify(ordered, null, 2)});`,
  '',
].join('\n');
fs.writeFileSync(outputPath, output);
console.log(`Wrote ${words.length} translations to ${path.relative(root, outputPath)}`);
