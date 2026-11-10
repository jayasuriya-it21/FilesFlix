'use strict';

const express = require('express');
const fs = require('fs');
const fsp = require('fs').promises;

const types = require('../media/types');
const thumbs = require('../media/thumbs');
const meta = require('../media/meta');
const hls = require('../media/hls');
const poster = require('../media/poster');
const logger = require('../logger');
const { httpError, resolveTarget } = require('../paths');

hls.startReaper();

const router = express.Router();

function contentDisposition(kind, filename) {
  const safe = String(filename).replace(/[\r\n"\\]/g, '_');
  return kind + '; filename="' + safe + '"; filename*=UTF-8\'\'' + encodeURIComponent(filename);
}

// ---- video / audio / image streaming (HTTP Range requests) -----------------

router.get('/stream', async (req, res, next) => {
  let nodeStream = null;
  try {
    const t = await resolveTarget(req.query.path);
    const st = await fsp.stat(t.abs);
    if (!st.isFile()) throw httpError(400, 'Not a file');

    const mime = types.mimeOf(t.abs);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', contentDisposition('inline', t.parts[t.parts.length - 1]));

    const range = req.headers.range;
    let start = 0;
    let end = st.size - 1;
    let partial = false;

    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(String(range).trim());
      if (m && (m[1] || m[2])) {
        if (m[1] === '') {
          // suffix form: bytes=-N
          const n = Math.min(parseInt(m[2], 10) || 0, st.size);
          start = Math.max(0, st.size - n);
          end = st.size - 1;
        } else {
          start = parseInt(m[1], 10);
          end = m[2] === '' ? st.size - 1 : Math.min(parseInt(m[2], 10), st.size - 1);
        }
        if (start > end || start >= st.size) {
          res.setHeader('Content-Range', 'bytes */' + st.size);
          return res.status(416).end();
        }
        partial = true;
      }
    }

    const length = end - start + 1;
    if (partial) {
      res.status(206);
      res.setHeader('Content-Range', 'bytes ' + start + '-' + end + '/' + st.size);
    }
    res.setHeader('Content-Length', length);

    // Activity logging: only the initial fetch of a file, not every range hop.
    if (!partial || start === 0) {
      logger.log('play_or_open', { file: t.parts.join('/'), mime, range: partial ? 'partial' : 'full' });
    }

    if (req.method === 'HEAD') return res.end();

    nodeStream = fs.createReadStream(t.abs, { start, end, autoClose: true });
    res.on('close', () => {
      if (nodeStream && !res.writableEnded) nodeStream.destroy();
    });
    nodeStream.pipe(res);
  } catch (e) { next(e); }
});

// ---- downloads (archives, executables, anything "Other") --------------------

router.get('/download', async (req, res, next) => {
  try {
    const t = await resolveTarget(req.query.path);
    const st = await fsp.stat(t.abs);
    if (!st.isFile()) throw httpError(400, 'Not a file');
    res.setHeader('Content-Type', types.mimeOf(t.abs));
    res.setHeader('Content-Length', st.size);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Disposition', contentDisposition('attachment', t.parts[t.parts.length - 1]));
    logger.log('download', { file: t.parts.join('/') });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(t.abs).pipe(res);
  } catch (e) { next(e); }
});

// ---- HLS "plays anything" pipeline -------------------------------------------
//
// GET /api/hls/prepare?path=<rel>&audio=<index>  -> { mode: 'native' } or
//                                                   { mode: 'hls', key, engine, audioIndex, duration, meta }
// GET /api/hls/:key/master.m3u8                  -> live-growing or finished playlist
// GET /api/hls/:key/seg/:name                    -> fMP4 segments
// GET /api/poster?name=<filename>                -> online movie poster metadata

router.get('/poster', async (req, res, next) => {
  try {
    const raw = req.query.name || '';
    if (!raw) return res.json({ matched: false, posterUrl: null });
    const p = await poster.findPoster(raw);
    res.json(p || { matched: false, posterUrl: null });
  } catch (e) { next(e); }
});

router.get('/hls/prepare', async (req, res, next) => {
  try {
    const t = await resolveTarget(req.query.path);
    const st = await fsp.stat(t.abs);
    if (!st.isFile()) throw httpError(400, 'Not a file');
    if (!types.categorize(t.abs).startsWith('video')) {
      return res.json({ mode: 'native', reason: 'not-video' });
    }
    const audioIdx = req.query.audio != null ? req.query.audio : 0;
    const startSec = Math.max(0, parseFloat(req.query.start || req.query.ss || 0) || 0);

    const info = await meta.metaFor(t.abs, st.mtimeMs, st.size);
    const p = hls.plan(info, t.abs, audioIdx);
    if (p.mode !== 'hls') {
      return res.json({
        mode: 'native',
        reason: p.reason,
        audioIndex: p.audioIndex,
        startOffset: 0,
        duration: info ? info.duration : null,
        meta: info || null,
        sourceFormats: info ? meta.extractSourceFormats(info) : []
      });
    }
    const videoWidth = info && info.video ? info.video.width : null;
    const s = await hls.ensureSession(t.abs, st.mtimeMs, st.size, p.engine, p.audioIndex, videoWidth, p.hasAudio, startSec);
    logger.log('hls_prepare', { file: t.parts.join('/'), engine: p.engine, audioIndex: p.audioIndex, startSec: s.startSec });
    res.json({
      mode: 'hls',
      key: s.key,
      engine: p.engine,
      audioIndex: p.audioIndex,
      reason: p.reason,
      startOffset: s.startSec || 0,
      duration: info ? info.duration : null,
      meta: info || null,
      sourceFormats: info ? meta.extractSourceFormats(info) : []
    });
  } catch (e) { next(e); }
});

router.post('/hls/:key/stop', (req, res) => {
  hls.stopSession(req.params.key);
  res.json({ ok: true });
});

router.get('/hls/:key/master.m3u8', async (req, res, next) => {
  try {
    const ok = await hls.servePlaylist(res, req.params.key);
    if (!ok) throw httpError(404, 'No such HLS session');
  } catch (e) { next(e); }
});

router.get(['/hls/:key/seg/:name', '/hls/:key/init.mp4', '/hls/:key/:name(seg_\\d+\\.m4s)'], async (req, res, next) => {
  try {
    const name = req.params.name || (req.path.endsWith('init.mp4') ? 'init.mp4' : null);
    if (!name) throw httpError(404, 'Invalid segment request');
    const ok = await hls.serveSegment(res, req.params.key, name);
    if (!ok) throw httpError(404, 'Segment not ready');
  } catch (e) { next(e); }
});

// ---- video thumbnails (cached; generated by the background queue) -----------

router.get('/thumb', async (req, res, next) => {
  try {
    const t = await resolveTarget(req.query.path);
    const st = await fsp.stat(t.abs);
    if (!st.isFile()) throw httpError(400, 'Not a file');
    const mt = req.query.mt ? parseInt(req.query.mt, 10) : null;
    const p = thumbs.thumbPathFor(t.abs, st.mtimeMs, st.size);
    if (mt !== null && mt !== Math.round(st.mtimeMs)) {
      // Client cached a thumbnail for an older version of this file.
      return res.status(404).end();
    }
    try {
      await fsp.access(p);
    } catch (_) {
      // Not generated yet — trigger generation and let client retry or fallback
      thumbs.request(t.abs, st.mtimeMs, st.size);
      throw httpError(404, 'Thumbnail not ready');
    }
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=604800');
    fs.createReadStream(p).pipe(res);
  } catch (e) { next(e); }
});

// ---- video metadata ----------------------------------------------------------

router.get('/meta', async (req, res, next) => {
  try {
    const t = await resolveTarget(req.query.path);
    const st = await fsp.stat(t.abs);
    if (!st.isFile()) throw httpError(400, 'Not a file');
    const info = await meta.metaFor(t.abs, st.mtimeMs, st.size);
    if (!info) return res.json({ available: false });
    res.json({
      available: true,
      ...info,
      sourceFormats: meta.extractSourceFormats(info),
      // expose absolute stat values for the frontend cache keys
      mtimeMs: Math.round(st.mtimeMs),
      size: st.size
    });
  } catch (e) { next(e); }
});

// ---- seek-preview sprite sheet ----------------------------------------------

router.get('/sprite', async (req, res, next) => {
  try {
    const t = await resolveTarget(req.query.path);
    if (!types.categorize(t.abs).startsWith('video')) {
      return res.json({ available: false });
    }
    const st = await fsp.stat(t.abs);
    if (!st.isFile()) throw httpError(400, 'Not a file');
    const info = await meta.metaFor(t.abs, st.mtimeMs, st.size);
    const duration = info && info.duration;
    const sprite = await meta.spriteFor(t.abs, st.mtimeMs, duration);
    if (!sprite) return res.json({ available: false });
    res.json({ available: true, ...sprite, duration });
  } catch (e) { next(e); }
});

// Serve the actual sprite sheet image. The key is an internal hash, never a
// user-supplied path.
router.get('/spriteImg', async (req, res, next) => {
  try {
    const info = await meta.spriteImage(req.query.k);
    if (!info) return res.status(404).end();
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    fs.createReadStream(info.path).pipe(res);
  } catch (e) { next(e); }
});

function shiftVttTime(timeStr, offsetSec) {
  const parts = timeStr.trim().split(':');
  let h = 0, m = 0, s = 0;
  if (parts.length === 3) {
    h = parseFloat(parts[0]) || 0;
    m = parseFloat(parts[1]) || 0;
    s = parseFloat(parts[2]) || 0;
  } else if (parts.length === 2) {
    m = parseFloat(parts[0]) || 0;
    s = parseFloat(parts[1]) || 0;
  }
  const total = h * 3600 + m * 60 + s - offsetSec;
  if (total < 0) return null;
  const nh = Math.floor(total / 3600);
  const nm = Math.floor((total % 3600) / 60);
  const ns = (total % 60).toFixed(3);
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}:${ns.padStart(6, '0')}`;
}

function adjustVttOffset(rawVtt, offsetSec) {
  if (!offsetSec || offsetSec <= 0) return rawVtt;
  const lines = rawVtt.split(/\r?\n/);
  const out = [];
  let skippingCue = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^(\d{2}:\d{2}:\d{2}[\.,]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[\.,]\d{3})(.*)$/);
    if (match) {
      const start = shiftVttTime(match[1].replace(',', '.'), offsetSec);
      const end = shiftVttTime(match[2].replace(',', '.'), offsetSec);
      if (end === null) {
        skippingCue = true;
        continue;
      }
      skippingCue = false;
      const safeStart = start || '00:00:00.000';
      out.push(`${safeStart} --> ${end}${match[3] || ''}`);
    } else {
      if (skippingCue) {
        if (line.trim() === '') skippingCue = false;
        continue;
      }
      out.push(line);
    }
  }
  return out.join('\n');
}

// ---- subtitles ---------------------------------------------------------------

/**
 * Embedded subtitle stream:  /api/subtitle?path=<rel>&idx=<stream index>&offset=<seconds>
 * External sibling .srt:     /api/subtitle?srt=<rel of the .srt>&offset=<seconds>
 * Always responds with text/vtt (WebVTT), technically converted when needed.
 */
router.get('/subtitle', async (req, res, next) => {
  try {
    const offsetSec = Math.max(0, parseFloat(req.query.offset || 0) || 0);
    res.setHeader('Cache-Control', 'private, max-age=604800');
    if (req.query.srt != null && req.query.srt !== '') {
      // External subtitle file -> tiny SyncRIP→WebVTT transform.
      const t = await resolveTarget(req.query.srt);
      const st = await fsp.stat(t.abs);
      if (!st.isFile()) throw httpError(400, 'Not a file');
      let raw = await fsp.readFile(t.abs, 'utf8');
      raw = raw.replace(/^\uFEFF/, '').replace(/^\uFEFF/, '');
      let vtt = raw;
      if (!/^\s*WEBVTT/m.test(vtt)) {
        vtt = 'WEBVTT\n\n' + raw.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
      }
      if (offsetSec > 0) vtt = adjustVttOffset(vtt, offsetSec);
      res.setHeader('Content-Type', 'text/vtt');
      logger.log('subtitle_use', { file: t.parts.join('/') });
      return res.send(vtt);
    }

    if (req.query.idx == null) throw httpError(400, 'Missing idx');
    const idx = parseInt(req.query.idx, 10);
    if (!Number.isInteger(idx) || idx < 0 || idx > 100) throw httpError(400, 'Bad idx');

    const t = await resolveTarget(req.query.path);
    const st = await fsp.stat(t.abs);
    if (!st.isFile()) throw httpError(400, 'Not a file');
    const info = await meta.metaFor(t.abs, st.mtimeMs, st.size);
    const stream = info && info.subtitleStreams.find((s) => s.index === idx);
    if (!stream) throw httpError(404, 'No such subtitle stream');
    if (stream.bitmap) throw httpError(415, 'Bitmap subtitles cannot be converted to WebVTT');

    const file = await meta.subtitleFile(t.abs, st.mtimeMs, idx, false);
    res.setHeader('Content-Type', 'text/vtt');
    logger.log('subtitle_extract', { file: t.parts.join('/'), idx });
    if (offsetSec > 0) {
      const raw = await fsp.readFile(file, 'utf8');
      return res.send(adjustVttOffset(raw, offsetSec));
    }
    fs.createReadStream(file).pipe(res);
  } catch (e) { next(e); }
});

module.exports = router;
