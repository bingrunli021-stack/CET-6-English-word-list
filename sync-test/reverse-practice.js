// Chinese -> English recall. Round state stays in memory; only graded results sync.
let reverseSession = null;
let reverseScope = 'learned';
let reverseSeen = new Set();
const REVERSE_SCOPES = {learned:'已学单词', today:'今日新词', hard:'模糊单词', missed:'专项错词', all:'全部词库'};

function resetReversePractice() {
  reverseSession = null;
  reverseSeen.clear();
}
function openReversePractice(scope = null) {
  if (scope && scope !== reverseScope && REVERSE_SCOPES[scope]) {
    reverseScope = scope;
    resetReversePractice();
  }
  view = 'reverse';
  setNav(view);
  render();
  scrollTo({top:0, behavior:'smooth'});
}
function changeReverseScope(scope) {
  if (!REVERSE_SCOPES[scope] || scope === reverseScope) return;
  reverseScope = scope;
  resetReversePractice();
  render();
}
function reverseIndices() {
  const valid = i => Number.isInteger(i) && i >= 0 && i < FALLBACK_WORDS.length;
  let indices;
  if (reverseScope === 'today') indices = getPlan().indices;
  else if (reverseScope === 'all') indices = FALLBACK_WORDS.map((_, i) => i);
  else if (reverseScope === 'hard') indices = hardIndices();
  else if (reverseScope === 'missed') indices = Object.keys(state.reverseRecords || {}).map(Number).filter(i => state.reverseRecords[i]?.lastCorrect === false);
  else indices = Object.keys(state.records).map(Number).filter(i => state.records[i]?.learnedAt && state.records[i].status !== 'new');
  return [...new Set(indices)].filter(valid);
}
function reverseRemaining() { return reverseIndices().filter(i => !reverseSeen.has(i)); }
function reversePrompt(meaning) {
  // Inflection notes can contain the answer (e.g. mislead过去式). Never expose them.
  return String(meaning || '').replace(/[（(][^）)]*[A-Za-z][^）)]*[）)]/g, '')
    .replace(/\b(?:adj|adv|vt|vi|n|v|prep|conj|pron|num|int|aux|pl)\.\s*/gi, '')
    .replace(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g, '').replace(/\s+/g, ' ').replace(/^[\s；;，,.]+|[\s；;，,.]+$/g, '').trim();
}
function reversePos(meaning) {
  const labels = {n:'名词', v:'动词', vt:'动词', vi:'动词', adj:'形容词', adv:'副词', prep:'介词', conj:'连词', pron:'代词', num:'数词', int:'感叹词', aux:'助动词', pl:'复数'};
  return [...new Set((String(meaning).match(/\b(?:adj|adv|vt|vi|n|v|prep|conj|pron|num|int|aux|pl)\./g) || []).map(p => labels[p.slice(0,-1)]))].join(' / ');
}
function shuffleReverse(indices) {
  const out = [...indices];
  for (let j = out.length - 1; j > 0; j--) {
    const k = Math.floor(Math.random() * (j + 1));
    [out[j], out[k]] = [out[k], out[j]];
  }
  return out;
}
function startReversePractice(indices = null, retry = false) {
  let source = indices ? [...new Set(indices)].filter(i => Number.isInteger(i) && getWord(i)) : reverseRemaining();
  if (!source.length && !indices && reverseIndices().length) {
    reverseSeen.clear();
    source = reverseRemaining();
  }
  if (!source.length) { toast('这个范围暂无单词，请选择其他范围'); return; }
  // Missed words take priority; ties shuffle so repeated rounds vary.
  source = shuffleReverse(source).sort((a,b) => Number(state.reverseRecords?.[b]?.lastCorrect === false) - Number(state.reverseRecords?.[a]?.lastCorrect === false));
  const qs = source.slice(0,20).map(i => {
    const w = getWord(i);
    return {i, word:w.word, meaning:w.meaning, prompt:reversePrompt(w.meaning), pos:reversePos(w.meaning), revealed:false, draft:'', checked:false, correct:null};
  });
  reverseSession = {qs, at:0, score:0, again:[], phase:'practice', retry};
  render();
  scrollTo({top:0, behavior:'smooth'});
}
function currentReverseQuestion() {
  return reverseSession?.phase === 'practice' ? reverseSession.qs[reverseSession.at] : null;
}
function updateReverseDraft(value) {
  const q = currentReverseQuestion();
  if (q && !q.revealed) q.draft = value;
}
function normalizeReverseAnswer(value) {
  return String(value || '').normalize('NFKC').trim().toLowerCase().replace(/[’‘]/g,"'").replace(/[‐‑–—]/g,'-').replace(/\s+/g,' ');
}
function checkReverseSpelling(event) {
  event?.preventDefault();
  const q = currentReverseQuestion();
  if (!q || q.revealed) return;
  q.draft = document.getElementById('reverseAnswer')?.value ?? q.draft;
  if (!q.draft.trim()) { toast('请先输入英文，或点击“想不起来”'); return; }
  q.checked = true;
  q.spellingCorrect = normalizeReverseAnswer(q.draft) === normalizeReverseAnswer(q.word);
  q.revealed = true;
  render();
}
function revealReverseAnswer() {
  const q = currentReverseQuestion();
  if (!q || q.revealed) return;
  q.revealed = true;
  render();
}
function forgotReverseAnswer() {
  const q = currentReverseQuestion();
  if (!q || q.correct !== null) return;
  q.revealed = true;
  gradeReverseAnswer(false);
}
function gradeReverseAnswer(correct) {
  const q = currentReverseQuestion();
  if (!q || !q.revealed || q.correct !== null || typeof correct !== 'boolean') return;
  q.correct = correct;
  if (correct) reverseSession.score++;
  else reverseSession.again.push(q.i);
  reverseSeen.add(q.i);
  state.reverseRecords = state.reverseRecords || {};
  const old = state.reverseRecords[q.i] || {};
  state.reverseRecords[q.i] = {
    attempts:(Number(old.attempts) || 0) + 1,
    correct:(Number(old.correct) || 0) + Number(correct),
    missed:(Number(old.missed) || 0) + Number(!correct),
    lastCorrect:correct, lastPracticedAt:Date.now()
  };
  saveState();
  render();
}
function nextReverseQuestion() {
  const q = currentReverseQuestion();
  if (!q || q.correct === null) return;
  if (reverseSession.at < reverseSession.qs.length - 1) reverseSession.at++;
  else reverseSession.phase = 'result';
  render();
  scrollTo({top:0, behavior:'smooth'});
}
function retryReversePractice() {
  if (reverseSession?.again.length) startReversePractice(reverseSession.again, true);
}
function speakReversePrompt() {
  const q = currentReverseQuestion();
  if (q) playSpeech([{text:q.prompt, lang:'zh-CN'}]);
}
function speakReverseAnswer() {
  const q = currentReverseQuestion();
  if (q?.revealed) playSpeech([{text:q.word}]);
}
function reverseHub(indices) {
  const records = Object.values(state.reverseRecords || {});
  const attempts = records.reduce((sum,r) => sum + (Number(r.attempts) || 0), 0);
  const correct = records.reduce((sum,r) => sum + (Number(r.correct) || 0), 0);
  const missed = records.filter(r => r.lastCorrect === false).length;
  return `<section class="panel weak-hub"><span class="kicker">CHINESE → ENGLISH</span><h2>看中文，说英文</h2><p>先看中文，把英文说出来；回忆后再揭晓核对。也可以输入英文检查拼写。</p><div class="reverse-stats"><div><b>${indices.length}</b><span>当前范围</span></div><div><b>${attempts}</b><span>累计练习次数</span></div><div><b>${attempts ? Math.round(correct / attempts * 100) + '%' : '—'}</b><span>专项回忆正确率</span></div><div><b>${missed}</b><span>专项待巩固词</span></div></div>${!reverseSession ? `<div class="field"><label for="reverseScope">练习范围</label><select id="reverseScope" onchange="changeReverseScope(this.value)">${Object.entries(REVERSE_SCOPES).map(([key,label]) => `<option value="${key}" ${key === reverseScope ? 'selected' : ''}>${label}</option>`).join('')}</select></div>` : `<div class="controls"><span class="badge">${REVERSE_SCOPES[reverseScope]}</span><button class="mini" onclick="resetReversePractice();render()">结束本轮 / 换范围</button></div>`}<p class="hint">专项结果单独保存，登录后自动同步。原有背词进度、掌握等级和复习日期保持原样。</p></section>`;
}
function renderReversePractice() {
  const indices = reverseIndices(), hub = reverseHub(indices), s = reverseSession;
  if (!s) return `${hub}<div class="panel reverse-card"><h3>先回忆，再看答案</h3><p class="hint">每轮最多 20 个词，优先巩固专项错词。中文可能对应多个同义词，本练习以词库中的目标词核对。</p>${indices.length ? '<button class="btn primary" onclick="startReversePractice()">开始中→英练习</button>' : '<p class="hint">这个范围暂无单词，请在上方切换练习范围。</p>'}</div>`;
  if (s.phase === 'result') {
    const remaining = reverseRemaining().length;
    return `${hub}<div class="panel check-result"><div class="check-score">${s.score} / ${s.qs.length}</div><h2>${s.again.length ? `还有 ${s.again.length} 个词需要巩固` : '本轮全部回忆正确'}</h2><p class="hint">${s.retry ? '错词重练' : '本轮'}正确率 ${Math.round(s.score / s.qs.length * 100)}% · 结果已保存在本机</p><div class="check-result-actions">${s.again.length ? `<button class="btn primary" onclick="retryReversePractice()">重练本轮错词（${s.again.length}）</button>` : ''}${remaining ? `<button class="btn blue" onclick="startReversePractice()">继续下一组（剩 ${remaining}）</button>` : ''}<button class="btn" onclick="resetReversePractice();render()">重新选范围</button></div><details class="source-meanings"><summary>查看本轮结果</summary><ol>${s.qs.map(q => `<li>${q.correct ? '✓' : '待巩固'} · ${esc(q.word)} — ${esc(q.prompt)}</li>`).join('')}</ol></details></div>`;
  }
  const q = currentReverseQuestion();
  return `${hub}<article class="panel reverse-card"><div class="progress-head"><span>${s.retry ? '错词重练' : '中→英专项'} · 第 ${s.at + 1}/${s.qs.length} 个</span><span>本轮说对 ${s.score} 个</span></div><div class="progress"><i style="width:${Math.round(s.qs.filter(x => x.correct !== null).length / s.qs.length * 100)}%"></i></div><div class="reverse-prompt"><span class="badge">${esc(q.pos || '中文释义')}</span><h3>${esc(q.prompt)}</h3><button class="btn blue" onclick="speakReversePrompt()">朗读中文</button></div>${q.revealed ? `<div class="reverse-revealed" aria-live="polite"><div class="reverse-word">${esc(q.word)}</div><div class="phonetic">${esc(phoneticFor(q.word))}</div><button class="btn blue" onclick="speakReverseAnswer()">听英文发音</button>${q.checked ? `<p class="hint">你输入的：<b>${esc(q.draft)}</b><br>${q.spellingCorrect ? '拼写与词库目标词一致。' : '拼写与词库目标词不同，请核对上方答案。'}</p>` : ''}</div>${q.correct === null ? '<p class="hint">核对你刚才的回忆；若说的是其他正确同义词，可自行标记“说对了”。</p><div class="reverse-actions"><button class="btn primary" onclick="gradeReverseAnswer(true)">说对了</button><button class="btn warn" onclick="gradeReverseAnswer(false)">没想起 / 说错了</button></div>' : `<p class="check-feedback" role="status">${q.correct ? '✓ 本次回忆正确，已记录' : '已加入专项错词，可在本轮结束后重练'}</p><button class="btn primary reverse-next" onclick="nextReverseQuestion()">${s.at === s.qs.length - 1 ? '查看本轮结果' : '下一个词'}</button>`}` : `<p class="hint reverse-instruction">先把英文说出来，准备好后再核对。</p><div class="reverse-actions"><button class="btn primary" onclick="revealReverseAnswer()">我已回忆，显示英文</button><button class="btn warn" onclick="forgotReverseAnswer()">想不起来</button></div><form class="reverse-spelling" onsubmit="checkReverseSpelling(event)"><label for="reverseAnswer">也可以输入英文自测拼写</label><div><input id="reverseAnswer" type="text" value="${esc(q.draft)}" oninput="updateReverseDraft(this.value)" placeholder="输入英文，不提供字母提示" autocomplete="off" autocorrect="off" autocapitalize="none" spellcheck="false" inputmode="text"><button class="btn blue" type="submit">检查</button></div></form>`}</article>`;
}
