// Device-only display preference; never writes or changes learning progress.
const FOCUS_UI_KEY='test3:cet6_focus_ui_v1';
function applyFocusMode(enabled) {
  document.documentElement.dataset.focusMode=enabled?'on':'off';
  const restore=document.getElementById('focusRestoreBtn');
  if(restore)restore.hidden=!enabled;
}
function setFocusMode(enabled) {
  // Let native scroll anchoring handle the layout change; do not start a
  // second smooth scroll while the user is reading a card.
  applyFocusMode(!!enabled);
  try{studyStorage.setItem(FOCUS_UI_KEY,enabled?'on':'off');}catch(_){}
}
try{applyFocusMode(studyStorage.getItem(FOCUS_UI_KEY)==='on');}catch(_){applyFocusMode(false);}
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&document.documentElement.dataset.focusMode==='on'&&!document.querySelector('.modal.show'))setFocusMode(false);
});
