'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const http = require('http');

const ffmpeg = require('./server/media/ffmpeg');
const meta = require('./server/media/meta');
const hls = require('./server/media/hls');

async function runTests() {
  console.log('=== FileFlix Playback & Streaming Regression Tests ===\n');

  // Test 1: FFmpeg & FFprobe availability
  console.log('Test 1: Checking FFmpeg & FFprobe...');
  const avail = await ffmpeg.check(true);
  assert.strictEqual(avail.ffmpeg, true, 'ffmpeg should be available');
  assert.strictEqual(avail.ffprobe, true, 'ffprobe should be available');
  console.log('  PASS: ffmpeg & ffprobe detected:', avail.version.trim());

  // Test 2: Metadata probe and audio stream absolute IDs vs ordinals
  console.log('\nTest 2: Probing video file with multiple audio streams...');
  const multiAudioFile = 'E:\\Videos\\Hollywood\\Anand\\Annabelle Comes Home (2019).mkv';
  const hasMultiAudio = fs.existsSync(multiAudioFile);

  if (hasMultiAudio) {
    const st = fs.statSync(multiAudioFile);
    const info = await meta.metaFor(multiAudioFile, st.mtimeMs, st.size);
    assert(info, 'Metadata should not be null');
    assert(info.video, 'Should have video stream');
    assert.strictEqual(info.video.codec, 'h264');
    assert(Array.isArray(info.audioStreams) && info.audioStreams.length >= 4, 'Should have 4 audio streams');

    console.log(`  Found ${info.audioStreams.length} audio streams:`);
    for (const a of info.audioStreams) {
      console.log(`    - Index: ${a.index}, Ordinal: ${a.ordinal}, Lang: ${a.lang}, Codec: ${a.codec}`);
      assert.strictEqual(typeof a.index, 'number', 'index must be number');
      assert.strictEqual(typeof a.ordinal, 'number', 'ordinal must be number');
    }

    // Test 3: Plan resolution
    console.log('\nTest 3: Planning delivery modes...');
    // Video is h264, audio is ac3 -> must be audio-transcode (copy video, transcode audio)
    const planDefault = hls.plan(info, multiAudioFile, 0);
    assert.strictEqual(planDefault.mode, 'hls');
    assert.strictEqual(planDefault.engine, 'audio-transcode');
    // First audio stream in Annabelle is index 1 (Tamil)
    assert.strictEqual(planDefault.audioIndex, 1, 'Default audio index should resolve to first audio stream index 1');

    // Passing absolute index 3 (Hindi)
    const planAbs3 = hls.plan(info, multiAudioFile, 3);
    assert.strictEqual(planAbs3.audioIndex, 3, 'Absolute index 3 should resolve to stream index 3');

    // Passing absolute index 4 (English)
    const planAbs4 = hls.plan(info, multiAudioFile, 4);
    assert.strictEqual(planAbs4.audioIndex, 4, 'Absolute index 4 should resolve to stream index 4');

    // Passing explicit ordinal 3 (which is English, index 4)
    const planOrd3 = hls.plan(info, multiAudioFile, 'ord:3');
    assert.strictEqual(planOrd3.audioIndex, 4, 'Ordinal ord:3 should resolve to absolute stream index 4');

    // Passing explicit ordinal a:3 (which is English, index 4)
    const planA3 = hls.plan(info, multiAudioFile, 'a:3');
    assert.strictEqual(planA3.audioIndex, 4, 'Ordinal a:3 should resolve to absolute stream index 4');

    // Passing absolute index 2 (Telugu)
    const planAbs2 = hls.plan(info, multiAudioFile, 2);
    assert.strictEqual(planAbs2.audioIndex, 2, 'Absolute index 2 should resolve to stream index 2');

    console.log('  PASS: Delivery planning & audio resolution verified');

    // Test 4: Seek-aware HLS session creation with input -ss
    console.log('\nTest 4: Creating seek-aware HLS session with input -ss...');
    const t0 = Date.now();
    // Seek to 120 seconds into the film
    const session120 = await hls.ensureSession(
      multiAudioFile,
      st.mtimeMs,
      st.size,
      planAbs4.engine,
      planAbs4.audioIndex,
      info.video.width,
      planAbs4.hasAudio,
      120
    );
    assert(session120 && session120.key, 'Session should be created');
    assert.strictEqual(session120.startSec, 120, 'Session startSec should be 120');

    // Wait for master.m3u8 and init.mp4
    const initPath = path.join(session120.dir, 'init.mp4');
    const m3u8Path = path.join(session120.dir, 'master.m3u8');

    let ready = false;
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      if (fs.existsSync(initPath) && fs.existsSync(m3u8Path)) {
        const rawM3u8 = fs.readFileSync(m3u8Path, 'utf8');
        if (rawM3u8.includes('seg_00000.m4s')) {
          ready = true;
          break;
        }
      }
      await new Promise(r => setTimeout(r, 100));
    }
    const elapsed = Date.now() - t0;
    assert(ready, 'Seek-aware session did not generate playlist/segments within timeout');
    console.log(`  PASS: Seek-aware session generated at -ss 120 in ${elapsed}ms (key: ${session120.key})`);

    // Verify playlist contents
    const m3u8Content = fs.readFileSync(m3u8Path, 'utf8');
    assert(m3u8Content.includes('#EXT-X-TARGETDURATION'), 'Playlist should have target duration');
    assert(m3u8Content.includes('init.mp4'), 'Playlist should reference init.mp4');
    assert(m3u8Content.includes('seg_00000.m4s'), 'Playlist should have segment 0');

    // Test 5: Audio switching & process cleanup
    console.log('\nTest 5: Audio switching at position 300s & process termination...');
    const oldProc = session120.proc;
    assert(oldProc, 'Session120 should have an active proc before switch');

    // Switch audio track to Telugu (index 2) at timestamp 300s
    const session300 = await hls.ensureSession(
      multiAudioFile,
      st.mtimeMs,
      st.size,
      planAbs2.engine,
      planAbs2.audioIndex,
      info.video.width,
      planAbs2.hasAudio,
      300
    );

    // Old proc for the same file should have been killed!
    assert(oldProc.killed || oldProc.exitCode !== null, 'Old ffmpeg process should be killed on new session');
    assert.strictEqual(session300.startSec, 300, 'New session startSec should be 300');
    assert.strictEqual(session300.audioIndex, 2, 'New session audioIndex should be 2');

    // Clean up session300
    hls.stopSession(session300.key);
    console.log('  PASS: Audio track switch killed old proc and cleanly spawned new session');
  } else {
    console.log('  SKIP: Multi-audio test file not found at E:\\Videos\\Hollywood\\Anand\\Annabelle Comes Home (2019).mkv');
  }

  // Test 6: Demo video test
  console.log('\nTest 6: Testing with demo video...');
  const demoPath = path.resolve('demo-library/Videos/demo.mp4');
  if (fs.existsSync(demoPath)) {
    const st = fs.statSync(demoPath);
    const m = await meta.metaFor(demoPath, st.mtimeMs, st.size);
    assert(m && m.video, 'Demo video metadata should exist');
    const p = hls.plan(m, demoPath, 0);
    console.log('  Demo video delivery mode:', p.mode, p.reason);
    assert.strictEqual(p.mode, 'native', 'MP4 with native codecs should play native');
    console.log('  PASS: Demo video planned native');
  }

  // Test 7: HTTP API End-to-End Test
  console.log('\nTest 7: HTTP API Integration test on ephemeral server...');
  const express = require('express');
  const app = express();
  app.use('/api', require('./server/api'));

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = server.address().port;
  console.log(`  Test HTTP server listening on http://127.0.0.1:${port}`);

  function httpGet(urlPath) {
    return new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}${urlPath}`, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      }).on('error', reject);
    });
  }

  function httpPost(urlPath) {
    return new Promise((resolve, reject) => {
      const req = http.request(`http://127.0.0.1:${port}${urlPath}`, { method: 'POST' }, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      });
      req.on('error', reject);
      req.end();
    });
  }

  try {
    // 7a. Test subtitle offset
    const testSrtPath = path.join(require('./server/config').get().mediaDir, 'test_temp_sub.srt');
    fs.copyFileSync('demo-library/Videos/demo.srt', testSrtPath);

    const subRes = await httpGet('/api/subtitle?srt=' + encodeURIComponent('test_temp_sub.srt') + '&offset=2');
    assert.strictEqual(subRes.status, 200, 'Subtitle request should return 200');
    assert(subRes.body.includes('00:00:00.000 --> 00:00:01.000'), 'Cue 1 should be shifted by 2s');
    assert(subRes.body.includes('00:00:01.500 --> 00:00:04.000'), 'Cue 2 should be shifted by 2s');
    console.log('  PASS: WebVTT offset shifting via HTTP verified');

    // 7b. Test HLS prepare with start offset & audio
    if (hasMultiAudio) {
      const relPath = 'Hollywood/Anand/Annabelle Comes Home (2019).mkv';
      const prepRes = await httpGet('/api/hls/prepare?path=' + encodeURIComponent(relPath) + '&audio=4&start=600');
      assert.strictEqual(prepRes.status, 200, 'Prepare request should return 200');
      const prepData = JSON.parse(prepRes.body);
      assert.strictEqual(prepData.mode, 'hls');
      assert.strictEqual(prepData.startOffset, 600, 'startOffset should be 600');
      assert.strictEqual(prepData.audioIndex, 4, 'audioIndex should be 4');
      assert(prepData.key, 'should have session key');
      console.log(`  PASS: /api/hls/prepare returned seek-aware session at 600s: key=${prepData.key}`);

      // 7c. Fetch master playlist
      const m3u8Res = await httpGet(`/api/hls/${prepData.key}/master.m3u8`);
      assert.strictEqual(m3u8Res.status, 200, 'Master playlist should return 200');
      assert(m3u8Res.body.includes(`/api/hls/${prepData.key}/seg/init.mp4`), 'Playlist should rewrite init.mp4 url');
      console.log('  PASS: /api/hls/:key/master.m3u8 served rewritten valid playlist');

      // 7d. Fetch init segment
      const initRes = await httpGet(`/api/hls/${prepData.key}/seg/init.mp4`);
      assert.strictEqual(initRes.status, 200, 'init.mp4 should return 200');
      assert.strictEqual(initRes.headers['content-type'], 'video/mp4');
      console.log('  PASS: /api/hls/:key/seg/init.mp4 served valid fMP4 init');

      // 7e. Stop session
      const stopRes = await httpPost(`/api/hls/${prepData.key}/stop`);
      assert.strictEqual(stopRes.status, 200, 'Stop should return 200');
      console.log('  PASS: /api/hls/:key/stop cleanly terminated encoder process');
    }
  } finally {
    try { fs.unlinkSync(path.join(require('./server/config').get().mediaDir, 'test_temp_sub.srt')); } catch (_) {}
    server.close();
  }

  console.log('\n=== ALL REGRESSION TESTS PASSED SUCCESSFULLY ===\n');
}

runTests().catch(err => {
  console.error('\nFAIL:', err);
  process.exit(1);
});
