// Device-only display preference; never writes or changes learning progress.
const FOCUS_UI_KEY='test3:cet6_focus_ui_v1';
function applyFocusMode(enabled) {
  document.documentElement.dataset.focusMode=enabled?'on':'off';
  const restore=document.getElementById('focusRestoreBtn');
  if(restore)restore.hidden=!enabled;
}
function setFocusMode(enabled) {
  // Keep the card being read in place when the sticky header disappears.
  const atTop=window.scrollY<20;
  const header=document.querySelector('.topbar');
  const edge=header?.getBoundingClientRect().bottom||0;
  const anchor=!atTop?[...document.querySelectorAll('#app .word-card,#app .quick-card,#app .reverse-card,#app .weak-card')]
    .find(el=>el.getBoundingClientRect().bottom>edge+20):null;
  const before=anchor?.getBoundingClientRect().top;
  applyFocusMode(!!enabled);
  try{studyStorage.setItem(FOCUS_UI_KEY,enabled?'on':'off');}catch(_){}
  if(anchor)requestAnimationFrame(()=>{
    const delta=anchor.getBoundingClientRect().top-before;
    if(Math.abs(delta)>1)window.scrollBy(0,delta);
  });
}
try{applyFocusMode(studyStorage.getItem(FOCUS_UI_KEY)==='on');}catch(_){applyFocusMode(false);}
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&document.documentElement.dataset.focusMode==='on'&&!document.querySelector('.modal.show'))setFocusMode(false);
});
