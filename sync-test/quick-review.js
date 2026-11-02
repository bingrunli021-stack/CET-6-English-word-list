// A device-local resumable queue. Grades use the existing synced word records.
let quickSession = null;
let quickScope = null;
let quickRunning = false;
let quickTimer = null;
let quickSpoken = '';
let quickUndo = null;
let quickDeadline = 0;
const QUICK_PREFIX = 'test3:cet6_quick_v1:';
const quickCopy = value => JSON.parse(JSON.stringify(value));
const quickValid = i => Number.isInteger(i) && i >= 0 && i < FALLBACK_WORDS.length;
function quickOwner() { return syncEngine?.scope || currentUser?.id || 'guest'; }
function quickCancel() { clearTimeout(quickTimer); quickTimer = null; }
function quickResetMemory() {
  quickCancel(); quickSession = null; quickScope = null; quickUndo = null;
  quickRunning = false; quickSpoken = ''; quickDeadline = 0;
}
function quickLoad() {
  const owner = quickOwner();
  if (quickScope === owner) return;
  quickResetMemory(); quickScope = owner;
  try {
    const saved = JSON.parse(studyStorage.getItem(QUICK_PREFIX + owner) || 'null');
    if (saved?.version === 1 && ['forward','reverse','listen'].includes(saved.mode)
      && Array.isArray(saved.queue) && saved.queue.length > 0 && saved.queue.length <= FALLBACK_WORDS.length * 2
      && saved.queue.every(q => quickValid(q.i) && typeof q.retry === 'boolean')
      && Number.isInteger(saved.at) && saved.at >= 0 && saved.at < saved.queue.length
      && ['recall','feedback','result'].includes(saved.phase)
      && saved.outcomes && saved.graded && saved.shown) quickSession = saved;
  } catch (_) { /* A damaged checkpoint never changes learning records. */ }
}
function quickSave() {
  try {
    if (quickSession) studyStorage.setItem(QUICK_PREFIX + quickScope, JSON.stringify(quickSession));
    else if (quickScope) studyStorage.removeItem(QUICK_PREFIX + quickScope);
  } catch (_) { toast('本机存储空间不足，请保持页面打开'); }
}
function quickClearCheckpoint() {
  const prefix=QUICK_PREFIX+quickOwner();
  const keys=[];for(let i=0;i<studyStorage.length;i++){const k=studyStorage.key(i);if(k===prefix||k?.startsWith(prefix+':seen:'))keys.push(k);}
  for(const key of keys)studyStorage.removeItem(key);
  quickResetMemory();
}
function quickVisitKey(mode='forward') { return QUICK_PREFIX+quickOwner()+':seen:'+dayKey()+':'+mode; }
function quickVisited(mode='forward') {
  try { const items=JSON.parse(studyStorage.getItem(quickVisitKey(mode))||'[]');return new Set(Array.isArray(items)?items.filter(quickValid):[]); }
  catch(_){return new Set();}
}
function quickRememberVisit(i,mode,remember=true) {
  const visited=quickVisited(mode);if(remember)visited.add(i);else visited.delete(i);
  try{studyStorage.setItem(quickVisitKey(mode),JSON.stringify([...visited]));}catch(_){}
}
function quickPool(mode='forward') {
  const due = [...new Set(dueIndices())].filter(quickValid);
  due.sort((a,b) => {
    const ar=rec(a), br=rec(b);
    return Number(br.status==='hard')-Number(ar.status==='hard')
      || (br.wrong||0)-(ar.wrong||0) || (ar.due||'').localeCompare(br.due||'') || a-b;
  });
  const visited=quickVisited(mode);
  return [...new Set([...due, ...hardIndices()])].filter(i=>quickValid(i)&&!visited.has(i));
}
function quickOpen() {
  quickLoad(); view = 'quick'; setNav('review'); quickRunning = false;
  render(); scrollTo({top:0, behavior:'smooth'});
}
function quickStart(limit=30, mode=null, indices=null) {
  quickLoad();
  const selectedMode = mode || document.getElementById('quickMode')?.value || 'forward';
  if (!['forward','reverse','listen'].includes(selectedMode)) return;
  const source = [...new Set(indices || quickPool(selectedMode))].filter(quickValid);
  const words = source.slice(0, limit === 0 ? source.length : Math.max(1, Math.min(Number(limit)||30, source.length)));
  if (!words.length) { toast('目前没有到期或模糊词，先学几个新词吧'); return; }
  quickUndo = null; quickCancel(); quickSpoken = ''; quickDeadline = 0;
  quickSession = {version:1, mode:selectedMode, date:dayKey(), at:0, phase:'recall',
    queue:words.map(i=>({i,retry:false})), total:words.length, outcomes:{}, graded:{}, shown:{}, heard:0};
  quickRunning = true; quickSave(); view='quick'; setNav('review'); render();
  scrollTo({top:0, behavior:'smooth'});
}
function quickResume() {
  quickLoad(); if (!quickSession || quickSession.phase==='result') return;
  quickRunning=true; quickSpoken=''; quickDeadline=0;
  view='quick'; setNav('review'); render(); scrollTo({top:0, behavior:'smooth'});
}
function quickPause() {
  quickRunning = !quickRunning; quickSpoken=''; quickDeadline=0; render();
}
function quickLeave() {
  quickRunning=false; quickSave(); view='review'; setNav('review'); render();
}
function quickQuestion() { return quickSession?.queue[quickSession.at]; }
function quickRecordValue(value) {
  if (!value) return null;
  const copy=quickCopy(value); delete copy.updatedAt; return copy;
}
function quickGrade(quality) {
  const s=quickSession, q=quickQuestion();
  if (view!=='quick' || !q || s.phase!=='recall' || !['good','fuzzy','again'].includes(quality)
    || (s.mode==='listen' && quality==='good')) return;
  const section=s.mode==='reverse'?'reverseRecords':'records';
  if(s.date!==dayKey()){s.date=dayKey();s.graded={};}
  const before=quickCopy(s), original=quickRecordValue(state[section]?.[q.i]), visited=quickVisited(s.mode).has(q.i);
  let changed=false;
  // Repeated appearances in this round cannot repeatedly raise levels or errors.
  if (!s.graded[q.i] || s.mode==='reverse') {
    if (s.mode==='reverse') {
      state.reverseRecords=state.reverseRecords||{};
      const old=state.reverseRecords[q.i]||{}, correct=quality==='good';
      state.reverseRecords[q.i]={attempts:(Number(old.attempts)||0)+1,
        correct:(Number(old.correct)||0)+Number(correct), missed:(Number(old.missed)||0)+Number(!correct),
        lastCorrect:correct, lastPracticedAt:Date.now()}; changed=true;
    } else {
      const r={...rec(q.i)};
      if (quality!=='good') {
        r.status='hard'; r.level=1; r.learnedAt=r.learnedAt||dayKey();
        r.wrong=(r.wrong||0)+1; r.due=addDays(dayKey(),1); changed=true;
      } else if (r.due && r.due<=dayKey() && r.status!=='new') {
        r.level=Math.min((r.level||1)+1,REVIEW_INTERVALS.length);
        r.due=addDays(dayKey(),REVIEW_INTERVALS[r.level-1]); r.status='done'; changed=true;
      }
      if (changed) state.records[q.i]=r;
    }
    s.graded[q.i]=true;
  }
  s.outcomes[q.i]=quality; s.shown[q.i]=(s.shown[q.i]||0)+1;
  if (quality!=='good' && !q.retry) {
    // Leave three other cards between encounters when enough cards remain.
    s.queue.splice(Math.min(s.at+4,s.queue.length),0,{i:q.i,retry:true});
  }
  s.phase='feedback'; s.answer=quality;
  quickUndo={session:before, section, i:q.i, original, changed, visited, date:dayKey(),
    after:quickRecordValue(state[section]?.[q.i]), owner:quickOwner()};
  quickRunning=true; quickSpoken=''; quickDeadline=Date.now()+3200;
  quickRememberVisit(q.i,s.mode);quickSave(); if(changed)saveState(); render();
}
function quickUndoGrade(replacement=null) {
  const u=quickUndo;
  if (!u || u.owner!==quickOwner()) return;
  // A newer grade from another device must never be overwritten by Undo.
  if (u.changed && JSON.stringify(quickRecordValue(state[u.section]?.[u.i]))!==JSON.stringify(u.after)) {
    quickUndo=null; toast('这个词已有更新，已保留最新记录'); render(); return;
  }
  if (u.changed) {
    if (u.original) state[u.section][u.i]=quickCopy(u.original);
    else delete state[u.section][u.i];
  }
  if(u.date===dayKey())quickRememberVisit(u.i,u.session.mode,u.visited);
  quickSession=quickCopy(u.session); quickUndo=null; quickDeadline=0; quickSpoken='';
  quickRunning=false; quickSave(); if(u.changed)saveState();
  if(replacement)quickGrade(replacement);else render();
}
function quickNext() {
  const s=quickSession;
  if(!s || (s.phase!=='feedback' && s.mode!=='listen'))return;
  quickCancel(); quickSpoken=''; quickDeadline=0;
  if(s.mode==='listen'){
    s.listened=s.listened||{};s.listened[quickQuestion().i]=true;s.heard=Object.keys(s.listened).length;
    quickRememberVisit(quickQuestion().i,'listen');
  }
  if(s.at+1<s.queue.length){s.at++;s.phase='recall';delete s.answer;delete s.revealed;}
  else{s.phase='result';quickRunning=false;}
  quickSave();render();
}
function quickMissed() {
  return Object.keys(quickSession?.outcomes||{}).map(Number).filter(i=>quickSession.outcomes[i]!=='good');
}
function quickRetry() {
  const missed=quickMissed(), mode=quickSession?.mode;
  if(missed.length)quickStart(0,mode,missed);
}
function quickNewRound() {
  quickRunning=false; quickSession=null; quickUndo=null; quickSave(); view='quick';setNav('review');render();
}
function quickReveal() {
  if(!quickSession || quickSession.phase!=='recall')return;
  quickSession.revealed=true; quickSave(); quickSpoken=''; render();
}
function quickRead(automatic=false,onComplete=null) {
  const s=quickSession,q=quickQuestion();if(!s||!q)return;
  const w=getWord(q.i), revealed=s.phase==='feedback'||s.revealed;
  if(s.mode==='reverse')playSpeech(revealed?[{text:w.word}]:[{text:reversePrompt(w.meaning),lang:'zh-CN'}],onComplete);
  else {
    const meaning={text:w.meaning.replace(/\b(?:adj|adv|vt|vi|n|v|prep|conj)\.\s*/g,''),lang:'zh-CN'};
    playSpeech(automatic&&revealed?[meaning]:[{text:w.word},...(revealed?[meaning]:[])],onComplete);
  }
}
function quickBeforeRender() {
  quickCancel();
  quickSpoken='';
  if(view!=='quick'){quickRunning=false;quickSpoken='';quickDeadline=0;}
  document.body?.classList.toggle('quick-active',view==='quick' && !!quickSession && quickSession.phase!=='result');
}
function quickAfterRender() {
  const s=quickSession,q=quickQuestion();
  if(view!=='quick'||!s||!q||s.phase==='result'||!quickRunning||document.hidden)return;
  const key=s.at+':'+s.phase+':'+!!s.revealed;
  let advance=null;
  if(s.phase==='feedback') {
    advance=()=>{if(view==='quick'&&quickRunning)quickNext();};
    if(!quickDeadline)quickDeadline=Date.now()+3200;
  } else if(s.mode==='listen') {
    if(!quickDeadline)quickDeadline=Date.now()+(s.revealed?5500:4500);
    advance=()=>{
      if(view!=='quick'||!quickRunning)return;
      quickDeadline=0;
      if(!s.revealed){s.revealed=true;quickSave();render();}else quickNext();
    };
  }
  if(advance)quickTimer=setTimeout(advance,Math.max(400,quickDeadline-Date.now()));
  if(quickSpoken!==key){
    quickSpoken=key;
    // When voices work, finish the utterance before advancing. A timeout still
    // permits silent review on devices without speech support.
    if(advance&&'speechSynthesis' in window&&'SpeechSynthesisUtterance' in window){
      quickCancel();quickDeadline=Date.now()+20000;quickTimer=setTimeout(advance,20000);
    }
    quickRead(true,()=>{
      if(!advance||view!=='quick'||!quickRunning||quickSession!==s||quickSpoken!==key)return;
      const delay=s.phase==='feedback'?1600:s.revealed?2000:3500;
      quickCancel();quickDeadline=Date.now()+delay;quickTimer=setTimeout(advance,delay);
    });
  }
}
function quickHub(compact=false) {
  quickLoad(); const pool=quickPool(), due=dueIndices().filter(quickValid).length;
  const resume=quickSession&&quickSession.phase!=='result';
  return `<section class="panel quick-hub ${compact?'quick-compact':''}"><div class="quick-hub-copy"><span class="kicker">QUICK REVIEW</span><h2>复习，点一下就开始</h2><p>自动选词 · 答后翻页 · 忘词穿插 · 随时接着刷</p></div><div class="quick-hub-count"><b>${pool.length}</b><span>待复习词 · 到期 ${due} 个</span></div><div class="quick-start-actions">${resume?`<button class="btn primary" onclick="quickResume()">继续上次 · ${Math.min(quickSession.at+1,quickSession.queue.length)}/${quickSession.queue.length}</button><button class="btn" onclick="quickOpen()">查看本轮</button><button class="btn blue" onclick="quickNewRound()">换数量 / 模式</button>`:`<button class="btn primary" onclick="quickStart(30)">开始今日复习 · 最多 30 词</button><button class="btn blue" onclick="quickOpen()">10 词速刷 / 更多模式</button>`}</div>${!compact?'<p class="hint">优先处理到期且常忘的词，再补模糊词。评分沿用原有同步；刷到哪的断点保存在当前设备。</p>':''}</section>`;
}
function renderQuickReview() {
  quickLoad(); const s=quickSession;
  if(!s)return `${quickHub()}<section class="panel quick-setup"><h3>今天想怎么过？</h3><div class="field"><label for="quickMode">复习方式</label><select id="quickMode"><option value="forward">看英文，回忆中文 · 默认</option><option value="reverse">看中文，说英文 · 不用打字</option><option value="listen">听着过 · 自动播，不自动判会</option></select></div><div class="quick-start-actions"><button class="btn blue" onclick="quickStart(10)">速刷 10 词</button><button class="btn primary" onclick="quickStart(30)">标准 30 词</button><button class="btn" onclick="quickStart(0)">全部复习</button></div><p class="hint">听着过需要保持页面在前台；暂停或退出随时保存。中→英结果单独记录。</p></section>`;
  const missed=quickMissed(), seen=Object.keys(s.outcomes).length;
  if(s.phase==='result')return `<section class="panel quick-result"><span class="kicker">ROUND COMPLETE</span><div class="check-score">${s.mode==='listen'?s.heard:seen}</div><h2>${s.mode==='listen'?'个词已经听过':`个词已经过完 · 仍不熟 ${missed.length} 个`}</h2><p class="hint">${s.mode==='listen'?'播放不会自动提高熟练度。':'答过的结果已保存。当天穿插重练不会重复提升等级；忘过的词保留后续巩固安排。'}</p><div class="quick-start-actions">${missed.length?`<button class="btn primary" onclick="quickRetry()">只练这 ${missed.length} 个</button>`:''}<button class="btn blue" onclick="quickNewRound()">继续下一组 / 换模式</button>${quickUndo?'<button class="btn" onclick="quickUndoGrade()">撤销上一词</button>':''}<button class="btn" onclick="quickLeave()">返回复习</button></div></section>`;
  const q=quickQuestion(),w=getWord(q.i),revealed=s.phase==='feedback'||s.revealed;
  const reverse=s.mode==='reverse',listening=s.mode==='listen';
  const prompt=reverse?reversePrompt(w.meaning):w.word;
  return `<section class="quick-session"><div class="quick-toolbar"><button class="mini" onclick="quickLeave()">← 稍后接着刷</button><span class="badge">${listening?'听着过':reverse?'中 → 英':'英 → 中'}${q.retry?' · 忘词重练':''}</span><button class="mini" onclick="quickPause()">${quickRunning?'暂停':'继续'}</button></div><div class="progress-head"><span>第 ${s.at+1} / ${s.queue.length} 张${s.queue.length>s.total?' · 含穿插重练':''}</span><span>已过 ${seen} 词</span></div><div class="progress"><i style="width:${Math.round(s.at/s.queue.length*100)}%"></i></div><article class="panel quick-card"><p class="quick-instruction">${reverse?'看中文，在心里或开口说出英文':'看英文，先在心里回忆词义'}</p><button class="quick-prompt ${reverse?'quick-chinese':''}" onclick="quickRead()" aria-label="朗读当前提示：${esc(prompt)}">${esc(prompt)}</button>${!reverse?`<div class="phonetic">${esc(phoneticFor(w.word))}</div>`:''}<div class="quick-answer ${revealed?'is-revealed':''}" aria-live="polite">${revealed?`${reverse?`<div class="quick-answer-word">${esc(w.word)}</div><div class="phonetic">${esc(phoneticFor(w.word))}</div>`:''}<div class="quick-meaning">${esc(w.meaning)}</div>`:`<button class="quick-reveal" onclick="quickReveal()">点此揭晓，也可以直接判断 ↓</button>`}</div>${s.phase==='feedback'?`<p class="quick-feedback">${s.answer==='good'?'✓ 已记下“记得”':s.answer==='fuzzy'?'已标记模糊，稍后再遇见':'已加入巩固，稍后再遇见'}${quickRunning?' · 即将自动下一词':' · 已暂停'}</p>`:`<p class="quick-feedback">${quickRunning?(listening?'自动留出回忆时间，再揭晓答案':'想起来就点“记得”，不用额外翻页'):'已暂停，点“继续”恢复自动朗读和翻页'}</p>`}</article><div class="quick-dock">${s.phase==='feedback'?`<div class="quick-correction">${quickUndo?`<button class="mini" onclick="quickUndoGrade('again')">其实忘了</button><button class="mini" onclick="quickUndoGrade()">撤销本次</button>`:''}<button class="mini" onclick="quickNext()">下一词 →</button></div><button class="btn primary quick-wide" onclick="quickPause()">${quickRunning?'核对答案中 · 点此暂停':'已暂停 · 点此继续'}</button>`:`<div class="quick-grade-buttons">${listening?'<button class="btn blue" onclick="quickNext()">听过，下一词</button>':'<button class="btn primary" onclick="quickGrade(\'good\')">记得</button>'}<button class="btn warn" onclick="quickGrade('fuzzy')">模糊</button><button class="btn quick-forgot" onclick="quickGrade('again')">忘了</button></div><div class="quick-dock-note">${quickUndo?'<button class="mini" onclick="quickUndoGrade()">↶ 撤销上一词</button>':''}<span>${listening?'只播放不算掌握':'判断后揭晓答案，自动进入下一词'}</span></div>`}</div></section>`;
}
document.addEventListener('visibilitychange',()=>{
  if(document.hidden&&view==='quick'){quickRunning=false;quickCancel();quickDeadline=0;quickSpoken='';quickSave();stopSpeech();}
  else if(view==='quick')render();
});
addEventListener('pagehide',()=>{quickRunning=false;quickCancel();quickSave();});
document.addEventListener('keydown',event=>{
  if(view!=='quick'||event.repeat||event.ctrlKey||event.metaKey||event.altKey
    || /INPUT|TEXTAREA|SELECT/.test(event.target?.tagName)||document.querySelector('.modal.show'))return;
  const s=quickSession;if(!s||s.phase==='result')return;
  if(event.code==='Space'){event.preventDefault();quickPause();}
  else if(s.phase==='recall'&&['1','2','3'].includes(event.key))quickGrade({'1':'good','2':'fuzzy','3':'again'}[event.key]);
  else if(event.key==='ArrowRight'&&s.phase==='feedback')quickNext();
});
