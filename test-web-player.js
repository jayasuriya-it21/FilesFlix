'use strict';
// Browser-player logic tests; no codec support or rendering is simulated here.
const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const source = fs.readFileSync('public/js/player.js', 'utf8');
const playerMarkup = fs.readFileSync('public/index.html', 'utf8');
for (const id of ['pPrev', 'pRepeat', 'pQueue']) {
  assert.match(playerMarkup, new RegExp(`id="${id}"`), `${id} control is present in the player`);
}
assert.match(source, /function playSibling\(step\)/, 'previous/next share playlist navigation');
assert.match(source, /function openQueueMenu\(\)/, 'queue menu is implemented');
assert.match(source, /repeatMode === 'one'/, 'repeat-one behavior is implemented');
assert.match(source, /repeatMode === 'all'/, 'repeat-all behavior is implemented');
assert.match(source, /pPrev\.addEventListener\('click'/, 'previous control is wired');
assert.match(source, /pRepeat\.addEventListener\('click'/, 'repeat control is wired');
assert.match(source, /pQueue\.addEventListener\('click'/, 'queue control is wired');
function section(start, end) { return source.slice(source.indexOf(start), source.indexOf(end)); }
const storage = new Map();
const context = vm.createContext({ assert, console, localStorage: {
  getItem: key => storage.get(key) || null,
  setItem: (key, value) => storage.set(key, value)
} });
vm.runInContext(`
const PREF_KEY = 'prefs', RESUME_KEY = 'resume';
let current = {rel:'movie.mkv'}, session = {mode:'hls',startOffset:120};
let subtitleDelay = 0;
const cueTimes = new WeakMap();
const video = {volume:0.4, muted:false, playbackRate:1.5, readyState:1, currentTime:30, duration:1000, ended:false};
let metaInfo = null;
${section('  function readStored(', '  function setLocked(')}
${section('  function applySubtitleDelay(', '  const HIDE_AFTER')}
${section('  function effectiveDuration(', '  /* ---------- open / close')}
assert.equal(currentVirtualTime(), 150);
saveResume();
assert.equal(resumePosition('movie.mkv'), 150, 'resume stores virtual rather than segment time');
assert.equal(readStored(RESUME_KEY, {})['movie.mkv'].duration, 1000);
video.ended = true; saveResume();
assert.equal(resumePosition('movie.mkv'), 0, 'completed files do not resume');
video.ended = false;
for (let i=0; i<110; i++) { current.rel = 'movie'+i; saveResume(); }
assert.equal(Object.keys(readStored(RESUME_KEY, {})).length, 100, 'resume history is bounded');
savePreferences();
assert.equal(readStored(PREF_KEY, {}).speed, 1.5);
assert.equal(readStored(PREF_KEY, {}).volume, 0.4);
const cue = {startTime:10,endTime:12}, track = {cues:[cue]};
subtitleDelay = 1.5; applySubtitleDelay(track,120.25);
assert.equal(cue.startTime,11.25, 'delay accounts for fractional HLS offset');
assert.equal(cue.endTime,13.25);
subtitleDelay = -0.5; applySubtitleDelay(track,120.25);
assert.equal(cue.startTime,9.25, 'delay is applied against original, not adjusted cue');
subtitleDelay = 0; applySubtitleDelay(track,0);
assert.equal(cue.startTime,10, 'reset restores exact timing');
const earlyCue = {startTime:0.1,endTime:0.3};
subtitleDelay = -1; applySubtitleDelay({cues:[earlyCue]},0);
assert.ok(earlyCue.startTime >= 0 && earlyCue.endTime > earlyCue.startTime);
applySubtitleDelay({cues:null},0);
`, context);
storage.set('bad', '{broken');
assert.equal(vm.runInContext('readStored("bad", 42)', context), 42);
storage.set('bad', '[]');
assert.equal(vm.runInContext('readStored("bad", 42)', context), 42);
vm.runInContext(`
let locked = false, menuOpen = false, playCount = 0, focused = null;
const shell = {querySelectorAll(){return [pPlay,pBack]}, contains(){return true}};
const layer = {querySelectorAll(){return []}};
const pPlay = {focus(){focused='play'},disabled:false,closest(){return false},getClientRects(){return [1]}};
const pBack = {focus(){focused='back'},disabled:false,closest(){return false},getClientRects(){return [1]}};
const pUnlock = {focus(){focused='unlock'}};
const pVol = {}, pBar = {};
const document = {activeElement:shell};
function isOpen(){return true} function wakeControls(){} function togglePlay(){playCount++}
function showTapGlyph(){} function setLocked(value){locked=value} function seekBy(){}
function event(key,target=shell) {return {key,target,preventDefault(){this.prevented=true},stopPropagation(){}}}
${section('  function moveControlFocus(', '  /* ---------- expose')}
let ev = event('Home'); onKey(ev); assert.equal(ev.prevented,undefined,'Home belongs to the browser/TV');
ev = event('ArrowDown'); onKey(ev); assert.equal(focused,'play','D-pad enters controls');
ev = event('ArrowUp'); onKey(ev); assert.equal(focused,'back');
ev = event('MediaPlayPause'); onKey(ev); assert.equal(playCount,1);
ev = event(' '); ev.ctrlKey=true; onKey(ev); assert.equal(playCount,1,'browser modifier shortcuts survive');
locked=true; ev=event('MediaPlayPause'); onKey(ev); assert.equal(playCount,1,'lock blocks transport');
ev=event('Home'); onKey(ev); assert.equal(ev.prevented,undefined,'lock preserves system Home');
ev=event('Escape'); onKey(ev); assert.equal(locked,false,'Escape unlocks before closing');
`, context);
vm.runInContext(`
const handlers = {};
shell.addEventListener = (name, handler) => { handlers[name] = handler; };
shell.getBoundingClientRect = () => ({width:1000});
shell.setPointerCapture = () => {};
let gesture = null, lastTouchTap = 0, lastTouchTime = 0, lastMenuCloseAt = 0;
let seekTarget = null, message = '';
function notice(text) { message=text; }
function seekTo(target) { seekTarget=target; }
function touchTap() {}
${section('  const fmt =', '  function effectiveDuration(')}
${section("  const INTERACTIVE =", '  function touchTap(')}
const surface = {closest(){return false}}, control = {closest(){return true}};
function pointer(x,y=0,target=surface) { return {pointerType:'touch',isPrimary:true,pointerId:1,clientX:x,clientY:y,target}; }
handlers.pointerdown(pointer(0,0,control));
assert.equal(gesture,null,'touch gestures exclude controls');
locked=true; handlers.pointerdown(pointer(0)); assert.equal(gesture,null);
locked=false; handlers.pointerdown(pointer(0)); handlers.pointermove(pointer(5,40));
assert.equal(gesture,null,'vertical touch is not hijacked');
handlers.pointerdown(pointer(0)); handlers.pointermove(pointer(500));
assert.equal(seekTarget,null,'drag preview does not restart playback');
assert.match(message,/Seek to/);
handlers.pointerup(pointer(500));
assert.equal(seekTarget,210,'release commits virtual-time seek once');
handlers.pointerdown(pointer(0)); handlers.pointermove(pointer(500)); handlers.pointercancel();
assert.equal(gesture,null,'cancel discards gesture');
${section('  async function togglePip(', '  function setupNextButton(')}
video.requestPictureInPicture=async()=>{throw new Error('unsupported')};
this.pipCheck=async()=>{await togglePip(); assert.match(message,/Picture in picture is unavailable/)};
`, context);
context.pipCheck().then(() => console.log('PASS: web player preferences, resume, subtitles, lock, remote keys, gestures, PiP errors, playlist and repeat controls'))
  .catch(error => { console.error(error); process.exitCode=1; });
