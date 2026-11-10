// Sprint grades and checkpoints are device-local and scoped like quick review.
const SPRINT_SIZE = 100;
const SPRINT_KEY = 'test3:cet6_sprint_v1:';
let sprintIndex = null;
let sprintRevealCard = null;
let sprintLastGrade = null;

function sprintWords() {
  if (!sprintIndex) {
    const site = new Map(FALLBACK_WORDS.map((word, i) => [word.word.toLowerCase(), i]));
    sprintIndex = new Map(SPRINT_HEADWORDS.filter(word => site.has(word)).map(word => [word, site.get(word)]));
  }
  return sprintIndex;
}

function sprintKey() {
  return SPRINT_KEY + quickOwner();
}

function sprintProgress() {
  const words = sprintWords();
  const empty = {next:0, marks:{}, weakSeen:[], round:null};
  try {
    const saved = JSON.parse(studyStorage.getItem(sprintKey()));
    if (!saved) return empty;
    const next = Number.isInteger(saved.next) ? Math.max(0, Math.min(saved.next, words.size)) : 0;
    const marks = Object.fromEntries(Object.entries(saved.marks || {}).filter(
      ([word, grade]) => words.has(word) && ['fuzzy', 'forgot'].includes(grade)));
    const weakSeen = Array.isArray(saved.weakSeen) ? saved.weakSeen.filter(word => marks[word]) : [];
    const round = saved.round;
    if (!round || !['all', 'weak'].includes(round.mode) || !Array.isArray(round.words) ||
        !round.words.length || round.words.length > SPRINT_SIZE ||
        !round.words.every(word => words.has(word)) ||
        !Number.isInteger(round.at) || round.at < 0 || round.at > round.words.length) {
      return {next, marks, weakSeen, round:null};
    }
    return {next, marks, weakSeen, round};
  } catch (_) {
    return empty;
  }
}

function sprintSave(progress) {
  try {
    studyStorage.setItem(sprintKey(), JSON.stringify(progress));
    return true;
  } catch (_) {
    toast('本机存储空间不足，当前冲刺进度未保存');
    return false;
  }
}

function sprintWeakWords(marks) {
  const words = [...sprintWords().keys()];
  return [...words.filter(word => marks[word] === 'forgot'), ...words.filter(word => marks[word] === 'fuzzy')];
}

function sprintOpen() {
  view = 'sprint';
  setNav('review');
  render();
  scrollTo({top:0});
}

function sprintListOpen() {
  view = 'sprint-list';
  setNav('review');
  render();
  scrollTo({top:0});
}

function sprintListSettings(groups) {
  try {
    const saved = JSON.parse(studyStorage.getItem(sprintKey() + ':list'));
    if (Number.isInteger(saved?.group) && saved.group >= 0 && saved.group <= groups) {
      return {group:saved.group, translations:saved.translations === true, markedOnly:saved.markedOnly === true};
    }
  } catch (_) {}
  return {group:1, translations:false, markedOnly:false};
}

function sprintListChange(changes) {
  const groups = Math.ceil(sprintWords().size / SPRINT_SIZE);
  const current = sprintListSettings(groups);
  const settings = {...current, ...changes};
  const {group, translations, markedOnly} = settings;
  if (!Number.isInteger(group) || group < 0 || group > groups) return;
  try {
    studyStorage.setItem(sprintKey() + ':list', JSON.stringify(settings));
  } catch (_) {
    toast('当前浏览器无法保存列表设置');
    render();
    return;
  }
  if (group !== current.group || markedOnly !== current.markedOnly) {
    render();
    scrollTo({top:0, behavior:'instant'});
    return;
  }
  // Toggle visibility without rebuilding the word rows.
  document.getElementById('sprintWordList').dataset.translations = translations ? 'show' : 'hide';
  document.getElementById('sprintListTranslation').textContent = translations ? '隐藏翻译' : '显示翻译';
}

function sprintListToggle() {
  const {translations} = sprintListSettings(Math.ceil(sprintWords().size / SPRINT_SIZE));
  sprintListChange({translations:!translations});
}

function sprintListGroup(group) {
  sprintListChange({group});
}

function sprintListToggleFilter() {
  const {markedOnly} = sprintListSettings(Math.ceil(sprintWords().size / SPRINT_SIZE));
  sprintListChange({markedOnly:!markedOnly});
  document.getElementById('sprintListFilter').focus({preventScroll:true});
}

function sprintListStars() {
  try {
    const saved = JSON.parse(studyStorage.getItem(sprintKey() + ':stars'));
    if (Array.isArray(saved)) return new Set(saved.filter(word => sprintWords().has(word)));
  } catch (_) {}
  return new Set();
}

function sprintListToggleStar(i, button) {
  const word = FALLBACK_WORDS[i]?.word.toLowerCase();
  if (!sprintWords().has(word)) return;
  const stars = sprintListStars();
  const marked = !stars.delete(word);
  if (marked) stars.add(word);
  try {
    studyStorage.setItem(sprintKey() + ':stars', JSON.stringify([...stars]));
  } catch (_) {
    toast('当前浏览器无法保存重点词');
    return;
  }
  document.getElementById('sprintListStarCount').textContent = stars.size;
  const list = document.getElementById('sprintWordList');
  if (list.dataset.markedOnly === 'true' && !marked) {
    const row = button.closest('li');
    const neighbor = row.nextElementSibling || row.previousElementSibling;
    row.remove();
    list.hidden = !list.firstElementChild;
    document.getElementById('sprintListEmpty').hidden = !list.hidden;
    (neighbor?.querySelector('button') || document.getElementById('sprintListFilter')).focus({preventScroll:true});
    return;
  }
  button.setAttribute('aria-pressed', String(marked));
  button.title = marked ? '取消重点' : '标为重点';
  button.textContent = marked ? '★' : '☆';
}

function renderSprintList() {
  const ranked = [...sprintWords().entries()];
  const total = ranked.length, groups = Math.ceil(total / SPRINT_SIZE);
  const {group, translations, markedOnly} = sprintListSettings(groups);
  const stars = sprintListStars();
  const start = group ? (group - 1) * SPRINT_SIZE : 0;
  const end = group ? Math.min(start + SPRINT_SIZE, total) : total;
  const options = Array.from({length:groups}, (_, index) => {
    const number = index + 1, first = index * SPRINT_SIZE + 1, last = Math.min(number * SPRINT_SIZE, total);
    return `<option value="${number}"${number === group ? ' selected' : ''}>第 ${number} 组 · ${first}–${last} 词</option>`;
  }).join('');
  const shown = markedOnly ? ranked : ranked.slice(start, end);
  const rows = shown.map(([headword, i], position) => {
    const marked = stars.has(headword);
    if (markedOnly && !marked) return '';
    const word = getWord(i);
    return `<li${markedOnly ? ` value="${position + 1}"` : ''}><strong lang="en">${esc(word.word)}</strong>
      <span class="sprint-list-meaning">${esc(word.meaning)}</span>
      <button class="sprint-star" type="button" aria-label="重点词 ${esc(word.word)}" aria-pressed="${marked}" title="${marked ? '取消重点' : '标为重点'}" onclick="sprintListToggleStar(${i},this)">${marked ? '★' : '☆'}</button></li>`;
  }).join('');
  return `<section class="sprint-list">
    <header class="sprint-list-header"><div><span class="kicker">CET-6 SPRINT</span><h2>高频词列表复习</h2></div>
      <button class="btn" onclick="sprintOpen()">逐词自测</button></header>
    <div class="sprint-list-controls">
      <select aria-label="选择词表分组" onchange="sprintListGroup(Number(this.value))"${markedOnly ? ' hidden' : ''}>
        ${options}<option value="0"${group === 0 ? ' selected' : ''}>全部 ${total} 词</option></select>
      <button class="btn sprint-filter" id="sprintListFilter" aria-pressed="${markedOnly}" onclick="sprintListToggleFilter()">只看重点 <span id="sprintListStarCount">${stars.size}</span></button>
      <button class="btn primary" id="sprintListTranslation" aria-controls="sprintWordList" onclick="sprintListToggle()">${translations ? '隐藏翻译' : '显示翻译'}</button>
    </div>
    <ol class="panel sprint-word-list" id="sprintWordList" start="${markedOnly ? 1 : start + 1}" data-translations="${translations ? 'show' : 'hide'}" data-marked-only="${markedOnly}"${rows ? '' : ' hidden'}>${rows}</ol>
    <p class="panel empty" id="sprintListEmpty"${rows ? ' hidden' : ''}>还没有重点词。关闭「只看重点」，点单词旁边的 ☆ 添加。</p>
    <div class="quick-start-actions">
      ${!markedOnly && group > 1 ? `<button class="btn" onclick="sprintListGroup(${group - 1})">← 上一组</button>` : ''}
      ${!markedOnly && group > 0 && group < groups ? `<button class="btn primary" onclick="sprintListGroup(${group + 1})">下一组 →</button>` : ''}
      <button class="btn" onclick="sprintLeave()">返回复习</button>
    </div></section>`;
}

function sprintLeave() {
  sprintRevealCard = null;
  view = 'review';
  setNav('review');
  render();
  scrollTo({top:0});
}

function sprintStart(mode) {
  const progress = sprintProgress();
  if (progress.round && progress.round.at < progress.round.words.length) return;
  const ranked = [...sprintWords().keys()];
  if (mode === 'all' && progress.next === ranked.length) progress.next = 0;
  let words = ranked.slice(progress.next);
  if (mode === 'weak') {
    const marked = sprintWeakWords(progress.marks);
    const seen = new Set(progress.weakSeen);
    words = marked.filter(word => !seen.has(word));
    if (!words.length) {
      words = marked;
      progress.weakSeen = [];
    }
  }
  if (!words.length) return;
  progress.round = {mode, words:words.slice(0, SPRINT_SIZE), at:0, weakCount:0};
  if (!sprintSave(progress)) return;
  sprintRevealCard = null;
  sprintLastGrade = null;
  sprintOpen();
}

function sprintReveal(i) {
  sprintRevealCard = {i, key:sprintKey()};
  render();
}

function sprintGrade(i, grade) {
  const word = FALLBACK_WORDS[i]?.word.toLowerCase();
  const progress = sprintProgress(), round = progress.round;
  if (view !== 'sprint' || !round || round.words[round.at] !== word || !['known', 'fuzzy', 'forgot'].includes(grade)) return;
  const before = {next:progress.next, mark:progress.marks[word], weakCount:round.weakCount,
    seen:progress.weakSeen.includes(word)};
  if (round.mode === 'weak' && grade !== 'known') progress.weakSeen.push(word);
  else progress.weakSeen = progress.weakSeen.filter(item => item !== word);
  if (grade === 'known') delete progress.marks[word];
  else {
    progress.marks[word] = grade;
    round.weakCount++;
  }
  round.at++;
  if (round.mode === 'all') progress.next++;
  if (!sprintSave(progress)) return;
  sprintLastGrade = {word, before, key:sprintKey(), at:round.at, mode:round.mode,
    feedback:grade !== 'known' && !sprintRevealed(i)};
  sprintRevealCard = null;
  render();
}

function sprintMatchesLast(round) {
  return sprintLastGrade && round && sprintLastGrade.key === sprintKey() &&
    round.mode === sprintLastGrade.mode && round.at === sprintLastGrade.at &&
    round.words[round.at - 1] === sprintLastGrade.word;
}

function sprintUndo() {
  const progress = sprintProgress(), round = progress.round;
  if (!sprintMatchesLast(round)) return;
  const {word, before} = sprintLastGrade;
  progress.next = before.next;
  if (before.mark) progress.marks[word] = before.mark;
  else delete progress.marks[word];
  progress.weakSeen = progress.weakSeen.filter(item => item !== word);
  if (before.seen) progress.weakSeen.push(word);
  round.at--;
  round.weakCount = before.weakCount;
  if (!sprintSave(progress)) return;
  sprintRevealCard = null;
  sprintLastGrade = null;
  render();
}

function sprintNext() {
  if (sprintLastGrade) sprintLastGrade.feedback = false;
  render();
}

function sprintRead(i) {
  playSpeech([{text:getWord(i).word}]);
}

function sprintRevealed(i) {
  return sprintRevealCard?.i === i && sprintRevealCard.key === sprintKey();
}

function sprintClearProgress() {
  studyStorage.removeItem(sprintKey());
  sprintRevealCard = null;
  sprintLastGrade = null;
}

function sprintEntry() {
  const total = sprintWords().size;
  if (!total) return '';
  const {next, round} = sprintProgress();
  const active = round && round.at < round.words.length;
  return `<section class="panel quick-hub"><div class="quick-hub-copy"><span class="kicker">CET-6 SPRINT</span><h2>高频词冲刺</h2>
    <p>列表快速扫词，逐词自测可以把卡住的词留下来重刷。</p></div>
    <div class="quick-hub-count"><b>${total}</b><span>冲刺词 · 已过 ${next}</span></div>
    <div class="quick-start-actions"><button class="btn primary" onclick="sprintListOpen()">列表复习</button>
    <button class="btn" onclick="sprintOpen()">${active?'继续逐词自测':'逐词自测'}</button></div></section>`;
}

function renderSprint() {
  const {next, marks, round} = sprintProgress();
  const total = sprintWords().size, weak = Object.keys(marks).length;
  const last = sprintMatchesLast(round) ? sprintLastGrade : null;
  const feedback = !!last?.feedback;
  if (!feedback && (!round || round.at === round.words.length)) {
    return `<section class="panel quick-result"><span class="kicker">CET-6 SPRINT</span><h2>高频词冲刺</h2>
      ${round?`<p>本组已刷 ${round.at} 词 · ${round.weakCount} 词标为模糊或忘了</p>`:'<p>看英文，给自己两秒回忆词义。</p>'}
      <div class="progress-head"><span>本轮已扫 ${next} / ${total}</span><span>待重刷 ${weak} 词</span></div>
      <div class="progress"><i style="width:${total?next/total*100:0}%"></i></div>
      <div class="quick-start-actions" style="margin-top:20px">
        ${total?`<button class="btn primary" onclick="sprintStart('all')">${next===total?'再过一轮':next?'继续下一组':'开始第一组'} · ${SPRINT_SIZE} 词</button>`:''}
        ${weak?`<button class="btn warn" onclick="sprintStart('weak')">只刷卡词 · 最多 ${Math.min(SPRINT_SIZE,weak)} 词</button>`:''}
        ${last?'<button class="btn" onclick="sprintUndo()">撤销上一词</button>':''}
        <button class="btn" onclick="sprintListOpen()">列表复习</button>
        <button class="btn" onclick="sprintLeave()">返回复习</button>
      </div>
      <p class="hint">冲刺进度与卡词保存在当前设备。释义沿用站内词库。</p>
      <p class="hint">词序依据 <a href="https://github.com/exam-data/CETVocabulary" target="_blank" rel="noopener">CETVocabulary 公开试卷词频数据</a>筛选调整，<a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noopener">CC BY-NC-SA 4.0</a>。</p></section>`;
  }
  document.body.classList.add('quick-active');
  const word = feedback ? last.word : round.words[round.at];
  const i = sprintWords().get(word), card = getWord(i);
  const revealed = feedback || sprintRevealed(i);
  const position = feedback ? round.at : round.at + 1;
  return `<section class="quick-session"><div class="quick-toolbar"><button class="mini" onclick="sprintLeave()">← 返回复习</button>
    <span class="badge">${round.mode==='weak'?'卡词重刷':'高频词冲刺'}</span>
    <button class="mini" onclick="sprintListOpen()">列表复习</button></div>
    <div class="progress-head"><span>本组 ${position} / ${round.words.length}</span><span>本轮已扫 ${next} / ${total} · 卡词 ${weak}</span></div>
    <div class="progress"><i style="width:${round.at/round.words.length*100}%"></i></div>
    <article class="panel quick-card"><p class="quick-instruction">看英文，先回忆常见词义</p>
      <button class="quick-prompt" onclick="sprintRead(${i})" aria-label="朗读 ${esc(card.word)}">${esc(card.word)}</button>
      <div class="phonetic">${esc(phoneticFor(card.word))}</div>
      <div class="quick-answer ${revealed?'is-revealed':''}" aria-live="polite">${revealed?`<div class="quick-meaning">${esc(card.meaning)}</div>${secondaryMeaningHtml(card)}`:
        `<button class="quick-reveal" onclick="sprintReveal(${i})">点一下看词义</button>`}</div></article>
    <div class="quick-dock">${feedback?`<button class="btn primary quick-wide" onclick="sprintNext()">${round.at===round.words.length?'查看本组结果':'下一词 →'}</button>`:
      `<div class="quick-grade-buttons"><button class="btn primary" onclick="sprintGrade(${i}, 'known')">记得</button>
        <button class="btn warn" onclick="sprintGrade(${i}, 'fuzzy')">模糊</button>
        <button class="btn quick-forgot" onclick="sprintGrade(${i}, 'forgot')">忘了</button></div>`}
      <div class="quick-dock-note">${last?'<button class="mini" onclick="sprintUndo()">↶ 撤销上一词</button>':''}
        <span>${feedback?'已加入卡词，核对完继续':'记得就跳过，卡词留到下一轮'}</span></div></div></section>`;
}
