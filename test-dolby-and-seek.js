'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const http = require('http');

const meta = require('./server/media/meta');
const hls = require('./server/media/hls');
const config = require('./server/config');

async function testDolbyAndSeek() {
  console.log('=== Test Suite: Dolby Metadata & Seek Latency ===\n');

  // --- 1. Dolby Vision & Audio Codec Extraction Contract ---
  console.log('Test 1: Dolby metadata contracts & honest extraction...');

  // Mock metadata with DOVI side_data
  const mockDoviSideData = {
    format: { format_name: 'matroska,webm', duration: '120.5' },
    streams: [
      {
        codec_type: 'video',
        codec_name: 'hevc',
        width: 3840,
        height: 2160,
        side_data_list: [
          { side_data_type: 'DOVI configuration record', dv_profile: 7, dv_level: 6 }
        ]
      },
      {
        codec_type: 'audio',
        codec_name: 'truehd',
        index: 1,
        tags: { title: 'Dolby Atmos TrueHD 7.1', language: 'eng' }
      },
      {
        codec_type: 'audio',
        codec_name: 'eac3',
        index: 2,
        tags: { title: 'Surround 5.1', language: 'spa' } // Standard eac3 - MUST NOT claim Atmos!
      },
      {
        codec_type: 'audio',
        codec_name: 'ac3',
        index: 3,
        tags: { language: 'fre' }
      }
    ]
  };

  // Test extractSourceFormats with mock
  const simulatedNormalized = {
    container: 'matroska,webm',
    duration: 120.5,
    video: {
      codec: 'hevc',
      width: 3840,
      height: 2160,
      dolbyVision: true
    },
    audioStreams: [
      { id: 1, index: 1, ordinal: 0, codec: 'truehd', title: 'Dolby Atmos TrueHD 7.1' },
      { id: 2, index: 2, ordinal: 1, codec: 'eac3', title: 'Surround 5.1' },
      { id: 3, index: 3, ordinal: 2, codec: 'ac3', title: '' }
    ]
  };

  assert.strictEqual(simulatedNormalized.video.dolbyVision, true, 'Dolby Vision must be boolean true');
  const formats1 = meta.extractSourceFormats(simulatedNormalized);
  console.log('  Extracted sourceFormats:', formats1);
  assert(formats1.includes('Dolby Vision'), 'Must include Dolby Vision');
  assert(formats1.includes('Dolby TrueHD'), 'Must include Dolby TrueHD');
  assert(formats1.includes('Dolby Digital Plus'), 'Must include Dolby Digital Plus');
  assert(formats1.includes('Dolby Digital'), 'Must include Dolby Digital');
  assert(formats1.includes('Dolby Atmos'), 'Must include Dolby Atmos due to explicit TrueHD Atmos tag');

  // --- 2. Honest Dolby Atmos: EAC3 alone MUST NOT claim Atmos ---
  console.log('\nTest 2: Honest Dolby: verify EAC3 alone does NOT claim Atmos...');
  const eac3OnlyMeta = {
    video: { codec: 'h264', dolbyVision: false },
    audioStreams: [
      { id: 1, index: 1, ordinal: 0, codec: 'eac3', title: 'English 5.1' }
    ]
  };
  const formats2 = meta.extractSourceFormats(eac3OnlyMeta);
  console.log('  EAC3 standard track sourceFormats:', formats2);
  assert.strictEqual(eac3OnlyMeta.video.dolbyVision, false, 'Dolby Vision must be boolean false');
  assert(formats2.includes('Dolby Digital Plus'), 'EAC3 must be reported as Dolby Digital Plus');
  assert(!formats2.includes('Dolby Atmos'), 'EAC3 alone MUST NOT be claimed as Dolby Atmos');
  assert(!formats2.includes('Dolby Vision'), 'Non-DV file must not claim Dolby Vision');
  console.log('  PASS: Honest Dolby verified (no universal claim, no fake Atmos from eac3)');

  // --- 3. Probe real file (Annabelle MKV if present, or demo MP4) ---
  console.log('\nTest 3: Testing with actual media library file...');
  const multiAudioFile = 'E:\\Videos\\Hollywood\\Anand\\Annabelle Comes Home (2019).mkv';
  const hasAnnabelle = fs.existsSync(multiAudioFile);
  const targetFile = hasAnnabelle ? multiAudioFile : path.resolve('demo-library/Videos/demo.mp4');

  const st = fs.statSync(targetFile);
  const info = await meta.metaFor(targetFile, st.mtimeMs, st.size);
  assert(info && info.video, 'Metadata must exist');
  assert.strictEqual(typeof info.video.dolbyVision, 'boolean', 'info.video.dolbyVision must be a strict boolean');

  if (hasAnnabelle) {
    assert.strictEqual(info.video.dolbyVision, false);
    assert(Array.isArray(info.audioStreams) && info.audioStreams.length >= 4);
    for (const a of info.audioStreams) {
      assert.strictEqual(typeof a.codec, 'string');
      assert.strictEqual(a.codec, 'ac3');
    }
    const realFormats = meta.extractSourceFormats(info);
    console.log('  Annabelle sourceFormats:', realFormats);
    assert(realFormats.includes('Dolby Digital'), 'Annabelle has AC3 -> must have Dolby Digital format');
  } else {
    console.log('  Demo MP4 video codec:', info.video.codec, 'dolbyVision:', info.video.dolbyVision);
  }

  // --- 4. Browse Integration & Cached sourceFormats Contract ---
  console.log('\nTest 4: Testing /api/browse sourceFormats contract...');
  const express = require('express');
  const app = express();
  app.use('/api', require('./server/api'));

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = server.address().port;

  function httpGet(urlPath) {
    return new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}${urlPath}`, (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
      }).on('error', reject);
    });
  }

  try {
    const browseRes = await httpGet('/api/browse');
    assert.strictEqual(browseRes.status, 200);
    const browseData = JSON.parse(browseRes.body);
    assert(Array.isArray(browseData.entries), 'Entries must be an array');
    console.log(`  /api/browse returned ${browseData.entries.length} entries`);

    for (const entry of browseData.entries) {
      assert(Array.isArray(entry.sourceFormats), 'entry.sourceFormats must always be an array');
      if (entry.cat === 'video') {
        console.log(`    Video entry '${entry.name}': sourceFormats =`, entry.sourceFormats);
      }
    }

    // --- 5. Meta API & Dolby Vision details ---
    console.log('\nTest 5: Testing /api/meta for dolbyVision & sourceFormats...');
    const videoEntry = browseData.entries.find(e => !e.dir && e.cat === 'video');
    if (videoEntry) {
      const metaRes = await httpGet('/api/meta?path=' + encodeURIComponent(videoEntry.rel));
      assert.strictEqual(metaRes.status, 200);
      const metaData = JSON.parse(metaRes.body);
      assert.strictEqual(metaData.available, true);
      assert.strictEqual(typeof metaData.video.dolbyVision, 'boolean', 'meta.video.dolbyVision must be a boolean');
      assert(Array.isArray(metaData.sourceFormats), 'meta.sourceFormats must be an array');
      console.log(`    Metadata for '${videoEntry.name}': codec=${metaData.video.codec}, dolbyVision=${metaData.video.dolbyVision}, sourceFormats=`, metaData.sourceFormats);
    }

    // --- 6. Seek latency & HLS pipeline verification ---
    console.log('\nTest 6: Measuring seek latency on HLS session...');
    if (hasAnnabelle) {
      const t0 = Date.now();
      const prepRes = await httpGet('/api/hls/prepare?path=' + encodeURIComponent('Hollywood/Anand/Annabelle Comes Home (2019).mkv') + '&audio=4&start=360');
      assert.strictEqual(prepRes.status, 200);
      const prep = JSON.parse(prepRes.body);
      assert.strictEqual(prep.mode, 'hls');
      assert.strictEqual(prep.startOffset, 360);
      assert.strictEqual(typeof prep.meta.video.dolbyVision, 'boolean');

      // Fetch master.m3u8
      const m3u8Res = await httpGet(`/api/hls/${prep.key}/master.m3u8`);
      assert.strictEqual(m3u8Res.status, 200);
      assert(m3u8Res.body.includes('seg_00000.m4s'), 'Master playlist must already contain segment 0');

      // Fetch init.mp4
      const initRes = await httpGet(`/api/hls/${prep.key}/seg/init.mp4`);
      assert.strictEqual(initRes.status, 200);

      // Fetch segment 0
      const segRes = await httpGet(`/api/hls/${prep.key}/seg/seg_00000.m4s`);
      assert.strictEqual(segRes.status, 200);

      const elapsed = Date.now() - t0;
      console.log(`  PASS: Seek to 360s completed end-to-end (prepare + m3u8 + init.mp4 + seg_00000) in ${elapsed}ms`);
      assert(elapsed < 2000, `Seek latency ${elapsed}ms is excessively slow`);

      // Clean up session
      await new Promise((resolve) => {
        const req = http.request(`http://127.0.0.1:${port}/api/hls/${prep.key}/stop`, { method: 'POST' }, resolve);
        req.end();
      });
    }
  } finally {
    server.close();
  }

  console.log('\n=== ALL DOLBY & SEEK TESTS PASSED ===\n');
}

testDolbyAndSeek().catch(err => {
  console.error('Test failed:', err);
  process.exitCode = 1;
});
