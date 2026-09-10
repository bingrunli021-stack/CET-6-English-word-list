#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = path.join(root, 'sync-test', 'index.html');
const outputPath = path.join(root, 'sync-test', 'translations-reviewed.js');
const ecdictPath = process.argv[2];

if (!ecdictPath || !fs.existsSync(ecdictPath)) {
  console.error('Usage: node scripts/build-translation-review.mjs /absolute/path/to/ecdict.csv');
  process.exit(1);
}

function extractJsonConstant(source, name, opener, closer) {
  const declaration = `const ${name}=`;
  const at = source.indexOf(declaration);
  if (at < 0) throw new Error(`Missing ${name}`);
  const start = source.indexOf(opener, at + declaration.length);
  let depth = 0;
  let quote = '';
  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (char === '\\') i += 1;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === opener) depth += 1;
    else if (char === closer && --depth === 0) {
      const literal = source.slice(start, i + 1)
        .replace(/^\{\.\.\.\(window\.CET6_REVIEWED_TRANSLATIONS\|\|\{\}\),/, '{');
      return JSON.parse(literal);
    }
  }
  throw new Error(`Unclosed ${name}`);
}

function parseCsvLine(line) {
  const fields = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        value += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      fields.push(value);
      value = '';
    } else value += char;
  }
  fields.push(value);
  return fields;
}

function tidyText(value = '') {
  let text = String(value).replace(/[\t\r\n]+/g, ' ');
  text = text.replace(/\[([^\]]*)\]/g, (match, inner) => /[\u4e00-\u9fff]/.test(inner) ? `（${inner}）` : ' ');
  text = text.replace(/\.\.\./g, '……').replace(/\s+/g, ' ').replace(/\s*([，；：。])\s*/g, '$1').trim();
  return text.replace(/（C-）|（-s）|（theO-）/g, '');
}

function normalizePos(value = '') {
  return tidyText(value)
    .replace(/\bn\s*&\s*[；;]\s*v\./g, 'n./v.')
    .replace(/\b(?:vt|vi)\./g, 'v.')
    .replace(/(^|[；;。]\s*)a\./g, '$1adj.')
    .replace(/(^|[；;。]\s*)ad\./g, '$1adv.')
    .replace(/\bn\.\s*&\s*v\./g, 'n./v.')
    .replace(/\s*[,，]\s*/g, '，')
    .replace(/\s*[;；]\s*/g, '；')
    .replace(/；{2,}/g, '；')
    .replace(/[；。]+$/g, '');
}

function meaningScore(value = '') {
  const text = tidyText(value);
  const posCount = (text.match(/\b(?:n|v|vt|vi|adj|adv|prep|conj)\./g) || []).length;
  const senseCount = Math.min(4, (text.match(/[；;]/g) || []).length + 1);
  let score = Math.min(posCount, 2) * 20 + senseCount * 10;
  score -= Math.max(0, text.length - 72) * 0.75;
  if (/（(?:计|医|化|机|数|物|生|法|经|农|军|航|地|电)）/.test(text)) score -= 22;
  if (/人名|地名|古语|古义|俚语|方言/.test(text)) score -= 20;
  if (/(?:n|v|vt|vi|adj|adv)\.\s*$/.test(text)) score -= 55;
  if (/[A-Za-z]{3,}/.test(text.replace(/(?:adj|adv|prep|conj|vt|vi|n|v)\./g, ''))) score -= 25;
  return score;
}

function compactMainMeaning(value = '') {
  const text = normalizePos(value);
  const sections = text.split(/(?=\b(?:n|v|adj|adv|prep|conj)\.)/).map((part) => part.trim()).filter(Boolean);
  if (!sections.length) return text;
  const parsedSections = sections.map((section) => {
    const match = section.match(/^((?:n|v|adj|adv|prep|conj)\.)\s*(.*)$/);
    const pos = match ? match[1] : '';
    const body = match ? match[2] : section;
    let senses = body.split(/[；;]/).map((sense) => sense.trim().replace(/^[，,\s]+|[，,\s]+$/g, '')).filter(Boolean);
    const general = senses.filter((sense) => !/（(?:计|医|化|机|数|物|生|法|经|农|军|航|地|电)）|人名|地名/.test(sense));
    if (general.length) senses = general;
    return { pos, senses };
  }).filter((section) => section.senses.length);
  const parsed = [];
  for (const section of parsedSections) {
    const existing = parsed.find((item) => item.pos === section.pos);
    if (existing) existing.senses.push(...section.senses.filter((sense) => !existing.senses.includes(sense)));
    else parsed.push(section);
  }
  if (!parsed.length) return text;
  const output = [];
  const allocation = parsed.length === 2 ? [2, 2] : [2, 1, 1];
  parsed.slice(0, 3).forEach((section, sectionIndex) => {
    section.senses.slice(0, parsed.length === 1 ? 4 : allocation[sectionIndex] || 1).forEach((sense, senseIndex) => {
      output.push(`${senseIndex === 0 && section.pos ? `${section.pos} ` : ''}${sense}`);
    });
  });
  return output.slice(0, 4).join('；') || text;
}

function ecdictMeaning(value = '') {
  const lines = String(value).replace(/\\n/g, '\n').split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const general = lines.filter((line) => !/^\[(?:医|化|计|法|经|农|军|航|地|电|生|物)\]/.test(line));
  const selected = (general.length ? general : lines).slice(0, 3).map((line) => line
    .replace(/^\[[^\]]+\]\s*/, '')
    .replace(/,\s*/g, '；'));
  return compactMainMeaning(selected.join('；'));
}

function chineseLength(value = '') {
  return (value.match(/[\u3400-\u9fff]/g) || []).length;
}

function isSuspicious(value = '') {
  return /\badj\.\s*(?:干涉|妨碍)|股票经理人|单位团体|革命化|\bn\. 发票$|有利益的|勇敢，敢于做|证明，检验$|过于激烈的/.test(value)
    || /\[[^\]]+\]|\s{2,}|[；，]\s*$/.test(value);
}

function mergeMeaning(primary, supplemental, row) {
  if (!supplemental || supplemental === primary) return primary;
  if (isSuspicious(primary)) return supplemental;
  const highFrequency = row && row.frq > 0 && row.frq <= 3000;
  const examRelevant = row && (row.tags.has('cet6') || row.oxford || row.collins >= 2);
  if (highFrequency && examRelevant && chineseLength(primary) <= 10 && supplemental.length <= 72) return supplemental;
  return primary;
}

const SOURCE_FIXES = {
  action: 'n. 行动；作用；行为；诉讼',
  affiliation: 'n. 联系；隶属关系；加入，附属',
  audience: 'n. 观众；听众；读者',
  board: 'n. 板；董事会；膳食 v. 登上（交通工具）；寄宿',
  campaign: 'n. 运动；战役；竞选活动 v. 发起运动，参加竞选',
  capital: 'n. 首都；资本；大写字母 adj. 主要的；资本的；大写的',
  choice: 'n. 选择；选择权；入选者 adj. 优质的',
  complaint: 'n. 抱怨，投诉；疾病，病痛',
  consistent: 'adj. 一致的；始终如一的；相符的',
  count: 'v. 计算；算作；重要 n. 计数；总数',
  dare: 'v. 敢于；激（某人做某事） n. 挑战，激将',
  deal: 'v. 处理；交易；分发 n. 交易；大量',
  despite: 'prep. 尽管；不顾',
  defy: 'v. 违抗，反抗；蔑视；使成为不可能',
  economy: 'n. 经济；节约；经济制度',
  emerge: 'v. 出现，浮现；显露；兴起',
  estate: 'n. 财产；房地产；庄园',
  evolution: 'n. 演变；发展；进化',
  exchange: 'n. 交换；交流；兑换 v. 交换；兑换',
  exceptional: 'adj. 杰出的，非凡的；异常的；例外的',
  fair: 'adj. 公平的；尚可的；晴朗的 n. 展览会，市集',
  focus: 'n. 焦点，中心 v. 聚焦；集中',
  flight: 'n. 飞行；航班；逃跑；一段楼梯',
  follow: 'v. 跟随；遵循；接着发生；理解',
  hide: 'v. 隐藏；隐瞒 n. 兽皮',
  hit: 'v. 打；击中；袭击 n. 打击；热门的人或事物',
  honorary: 'adj. 荣誉的，名誉的；无报酬的',
  inspire: 'v. 激励；启发；赋予灵感',
  interfere: 'v. 干涉；妨碍；冲突',
  interview: 'n. 面试；采访；会谈 v. 面试；采访',
  impose: 'v. 把……强加于；征收；使接受',
  line: 'n. 线；线路；队列；界限 v. 排队；给……加衬',
  measure: 'n. 措施；测量；程度 v. 测量；衡量',
  observe: 'v. 观察；注意到；遵守；庆祝；评论',
  offer: 'v. 提供；提出；出价 n. 提议；报价',
  overexcited: 'adj. 过度兴奋的',
  particular: 'adj. 特定的；特别的；挑剔的 n. 细节',
  position: 'n. 位置；职位；立场 v. 安置，定位',
  personnel: 'n. 人员，员工；人事部门',
  personality: 'n. 个性；人格；名人',
  private: 'adj. 私人的；私立的；秘密的 n. 列兵',
  program: 'n. 程序；节目；计划 v. 编程；安排',
  rate: 'n. 比率；速度；费用；等级 v. 评价；评定',
  receipt: 'n. 收到；收据',
  revolutionize: 'v. 彻底改革；使发生革命性变化',
  rule: 'n. 规则；规律；统治 v. 统治；裁定',
  sign: 'n. 标志；迹象；招牌 v. 签署；示意',
  senator: 'n. 参议员',
  situation: 'n. 情况；处境；位置',
  stockbroker: 'n. 股票经纪人',
  support: 'v. 支持；支撑；供养 n. 支持；支撑物',
  team: 'n. 队；组 v. 合作',
  testify: 'v. 作证；证实，表明',
  value: 'n. 价值；数值 v. 重视；估价',
  version: 'n. 版本；说法；译本',
  view: 'n. 观点；视野；景色 v. 看待；观看',
  genetic: 'adj. 遗传的；基因的',
  electricity: 'n. 电；电力；电流',
  addition: 'n. 增加；添加物；加法',
  coach: 'n. 教练；长途汽车；客车车厢 v. 训练；指导',
  crew: 'n. 全体工作人员；机组人员；船员',
  division: 'n. 分开；部门；分歧；除法',
  hurt: 'v. 伤害；使伤心 n. 伤害；痛苦',
  misled: 'v. 误导（mislead 的过去式和过去分词）',
  occupy: 'v. 占用；占领；使忙于；担任',
  shrank: 'v. 收缩，缩小（shrink 的过去式）',
  universe: 'n. 宇宙；世界；领域',
  what: 'pron. 什么；……的事物 adj. 什么样的 adv. 多么',
  whoever: 'pron. 无论谁；任何人；究竟是谁',
};

const html = fs.readFileSync(htmlPath, 'utf8');
const rawWords = extractJsonConstant(html, 'RAW_WORDS', '[', ']');
const manualOverrides = extractJsonConstant(html, 'MANUAL_MEANING_OVERRIDES', '{', '}');
const wanted = new Set(rawWords.map((entry) => String(entry.word || '').trim().toLowerCase()).filter(Boolean));

const rows = fs.readFileSync(ecdictPath, 'utf8').split(/\r?\n/);
const headers = parseCsvLine(rows[0]);
const column = Object.fromEntries(headers.map((name, index) => [name, index]));
const dictionary = new Map();
for (let i = 1; i < rows.length; i += 1) {
  if (!rows[i]) continue;
  const values = parseCsvLine(rows[i]);
  const word = String(values[column.word] || '').trim().toLowerCase();
  if (!wanted.has(word)) continue;
  dictionary.set(word, {
    translation: values[column.translation] || '',
    tag: values[column.tag] || '',
    tags: new Set(String(values[column.tag] || '').split(/\s+/).filter(Boolean)),
    collins: Number(values[column.collins]) || 0,
    oxford: values[column.oxford] === '1',
    frq: Number(values[column.frq]) || 0,
  });
}

const groups = new Map();
const order = [];
for (const entry of rawWords) {
  const word = String(entry.word || '').trim();
  const key = word.toLowerCase();
  if (!word) continue;
  if (!groups.has(key)) {
    groups.set(key, { word, meanings: [] });
    order.push(key);
  }
  groups.get(key).meanings.push(entry.meaning || '');
}

const reviewed = {};
const report = { total: order.length, manual: 0, supplemented: 0, normalized: 0, unchanged: 0, missingDictionary: 0 };
for (const key of order) {
  const group = groups.get(key);
  const candidates = [...new Set(group.meanings.map(tidyText).filter(Boolean))];
  const selected = compactMainMeaning(candidates.sort((a, b) => meaningScore(b) - meaningScore(a))[0] || '');
  const normalized = normalizePos(selected);
  const row = dictionary.get(key);
  const supplemental = row ? ecdictMeaning(row.translation) : '';
  let meaning = mergeMeaning(normalized, supplemental, row);
  if (SOURCE_FIXES[key]) {
    meaning = SOURCE_FIXES[key];
    report.manual += 1;
  } else if (manualOverrides[key]) {
    meaning = normalizePos(manualOverrides[key]);
    report.manual += 1;
  } else if (meaning !== normalized) report.supplemented += 1;
  else if (meaning !== selected) report.normalized += 1;
  else report.unchanged += 1;
  if (!row) report.missingDictionary += 1;
  reviewed[key] = meaning;
}

const banner = `// Generated by scripts/build-translation-review.mjs.\n// Full-list normalization plus ECDICT-assisted audit; hand-reviewed overrides in index.html take precedence.\n`;
fs.writeFileSync(outputPath, `${banner}window.CET6_REVIEWED_TRANSLATIONS=Object.freeze(${JSON.stringify(reviewed, null, 2)});\n`);
console.log(JSON.stringify(report, null, 2));
