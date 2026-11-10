// Regression: cleanup must not cancel the newly created prepare request.
const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const source = fs.readFileSync('public/js/player.js', 'utf8');
const prepare = source.slice(source.indexOf('  async function prepareAndAttach('), source.indexOf('  function canNativeHls('));
const teardown = source.slice(source.indexOf('  function teardownMedia('), source.indexOf('  function isOpen('));
const context = vm.createContext({ AbortController, console, assert });
vm.runInContext(`
let current = {rel: 'movie.mkv', audio: true}, currentAudioTrack = 1;
let loadGen = 0, activeAbortController = null, session = null, hlsInstance = null;
let metaInfo = null, subtitleMenuValue = 'off', attached = false;
const enc = encodeURIComponent;
const video = {pause(){}, querySelectorAll(){return []}, removeAttribute(){}, load(){}};
const spinner = {classList:{add(){}}};
function setOptimizing(){} function paintBadge(){} function paintDurationHint(){}
function buildSubtitles(){} function setupNextButton(){} function setupPip(){}
function attachHls(){ attached = true; }
async function fetch(url, options) {
  assert.equal(options.signal.aborted, false, 'prepare signal was aborted by teardown');
  return {ok:true, json:async()=>({mode:'hls',key:'test',duration:3600,audioIndex:1})};
}
${teardown}
${prepare}
this.run = async () => {
  await prepareAndAttach(0, false);
  assert.equal(attached, true, 'HLS must attach');
};
`, context);
context.run().then(() => console.log('PASS: prepare request survives cleanup and attaches HLS')).catch(e => {console.error(e); process.exitCode = 1;});
