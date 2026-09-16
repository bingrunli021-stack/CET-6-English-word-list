#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'sync-test', 'translations-reviewed.js');
const outputPath = path.join(root, 'sync-test', 'translations-google.js');
const cachePath = path.join(root, '.google-translations-independent-cache.json');

const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync(sourcePath, 'utf8'), context);
const words = Object.keys(context.window.CET6_REVIEWED_TRANSLATIONS || {});

if (!words.length) throw new Error('No CET-6 word heads found');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function requestIndependentBatch(batch) {
  const calls = batch.map((word) => [
    'MkEWBc',
    JSON.stringify([[word, 'en', 'zh-CN', true], [null]]),
    null,
    'generic',
  ]);
  const params = new URLSearchParams({ 'f.req': JSON.stringify([calls]) });
  let lastError;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const response = await fetch('https://translate.google.com/_/TranslateWebserverUi/data/batchexecute?rpcids=MkEWBc', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'User-Agent': 'Mozilla/5.0 CET6-translation-builder/1.0',
        },
        body: params,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      const jsonAt = text.indexOf('[');
      if (jsonAt < 0) throw new Error('Missing Google batch payload');
      const payload = JSON.parse(text.slice(jsonAt));
      const translated = new Map();
      for (const row of payload) {
        if (row?.[0] !== 'wrb.fr' || row?.[1] !== 'MkEWBc') continue;
        const result = JSON.parse(row[2]);
        const source = String(result?.[1]?.[4]?.[0] || result?.[0]?.[6]?.[0] || '').trim();
        const value = (result?.[1]?.[0] || [])
          .map((segment) => segment?.[5]?.[0]?.[0] || '')
          .join('')
          .trim();
        if (source && value) translated.set(source.toLowerCase(), value);
      }
      const missing = batch.filter((word) => !translated.has(word.toLowerCase()));
      if (missing.length) throw new Error(`Missing ${missing.length} translations`);
      return Object.fromEntries(batch.map((word) => [word, translated.get(word.toLowerCase())]));
    } catch (error) {
      lastError = error;
      const delay = Math.min(60000, 5000 * (2 ** attempt));
      process.stderr.write(`\nTranslate retry in ${Math.round(delay / 1000)}s: ${error.message}\n`);
      await sleep(delay);
    }
  }
  throw lastError;
}

const batchSize = 100;
const batches = [];
const translations = fs.existsSync(cachePath)
  ? JSON.parse(fs.readFileSync(cachePath, 'utf8'))
  : {};
const remaining = words.filter((word) => !translations[word]);
for (let i = 0; i < remaining.length; i += batchSize) batches.push(remaining.slice(i, i + batchSize));

let nextBatch = 0;
let completed = words.length - remaining.length;
async function worker() {
  while (nextBatch < batches.length) {
    const batchIndex = nextBatch++;
    const batch = batches[batchIndex];
    Object.assign(translations, await requestIndependentBatch(batch));
    completed += batch.length;
    fs.writeFileSync(cachePath, JSON.stringify(translations));
    process.stderr.write(`\rTranslated ${completed} / ${words.length}`);
    await sleep(500);
  }
}

await Promise.all([worker(), worker()]);
process.stderr.write('\n');

const ordered = Object.fromEntries(words.map((word) => [word, translations[word]]));
if (Object.keys(ordered).length !== words.length || Object.values(ordered).some((value) => !value)) {
  throw new Error('Google translation output is incomplete');
}

const output = [
  '// Generated from Google Translate by scripts/build-google-translations.mjs.',
  '// Every headword is submitted as an independent translation task to avoid cross-word context.',
  '// Used only for words without an existing learning record.',
  `window.CET6_GOOGLE_TRANSLATIONS=Object.freeze(${JSON.stringify(ordered, null, 2)});`,
  '',
].join('\n');
fs.writeFileSync(outputPath, output);
fs.rmSync(cachePath, { force: true });
console.log(`Wrote ${words.length} translations to ${path.relative(root, outputPath)}`);
