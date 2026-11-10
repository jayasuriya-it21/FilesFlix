'use strict';

// HLS session engine — makes "any video type" playable in the browser with minimal CPU.
//
//   native       -> direct HTTP Range via /api/stream (MP4/WebM + browser codecs)
//   copy         -> MKV/AVI/TS with browser video + audio: HLS remux with -c copy
//                   (<1% CPU, lossless, starts in ~1s)
//   audio-transcode -> Video is browser-compatible H.264/VP9/AV1, but audio is
//                   AC3/EAC3/DTS/TrueHD/FLAC: uses -c:v copy -c:a aac
//                   (<1% CPU, keeps original 1080p/4K video lossless, instant!)
//   transcode    -> Unsupported video codec (HEVC/10-bit/MPEG2/VC1):
//                   Leverages NVIDIA NVENC hardware acceleration (h264_nvenc)
//                   when available, otherwise libx264 veryfast.
//
// Multi-Audio Support:
//   Sessions are scoped per audio track: key = sha1(abs|mtime|size|engine|audioIdx)
//   Switching audio tracks remuxes/transcodes the requested audio stream cleanly.

const path = require('path');
const fs = require('fs');
const fsp = require('fs').promises;
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');

const config = require('../config');
const ffmpeg = require('./ffmpeg');
const metaMod = require('./meta');
const logger = require('../logger');

const INITIAL_SEG_SECONDS = 2;
const SEG_SECONDS = 3;
const IDLE_KILL_MS = 30 * 1000; // 30s idle reaper to eliminate runaway background ffmpeg processes
const MAX_SESSION_DIRS = 40;

// Codecs the browser can decode natively.
const NATIVE_VIDEO = new Set(['h264', 'vp8', 'vp9', 'av1']);
const NATIVE_AUDIO = new Set(['aac', 'mp3', 'opus', 'flac', 'vorbis']);
const NATIVE_EXT = new Set([
  'mp4', 'm4v', 'mov', 'm4a', 'webm', 'mp3', 'ogg', 'opus', 'wav', 'flac'
]);

// Detect hardware acceleration availability once on startup
let hasNvenc = null;
function checkNvenc() {
  if (hasNvenc !== null) return hasNvenc;
  try {
    const out = execSync(`"${ffmpeg.FFMPEG}" -encoders`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    hasNvenc = out.includes('h264_nvenc');
  } catch (_) {
    hasNvenc = false;
  }
  return hasNvenc;
}

// key -> { key, dir, abs, engine, audioIndex, startSec, proc, startedAt, lastAccess, done }
const sessions = new Map();
let reaper = null;

function killProc(proc) {
  if (!proc) return;
  try { proc.kill('SIGKILL'); } catch (_) {}
  try { proc.kill(); } catch (_) {}
}

function resolveAudioStream(info, requestedAudio) {
  if (!info || !Array.isArray(info.audioStreams) || info.audioStreams.length === 0) {
    return null;
  }
  const streams = info.audioStreams;
  if (requestedAudio === null || requestedAudio === undefined || requestedAudio === '') {
    return streams[0];
  }

  // Explicit ordinal syntax: "ord:N", "a:N"
  if (typeof requestedAudio === 'string' && /^(ord:|a:)/i.test(requestedAudio)) {
    const ord = parseInt(requestedAudio.replace(/^(ord:|a:)/i, ''), 10);
    if (!Number.isNaN(ord) && ord >= 0 && ord < streams.length) {
      return streams[ord];
    }
  }

  const num = Number(requestedAudio);
  if (!Number.isNaN(num)) {
    // 1. Exact match on stream index / id
    const byIndex = streams.find((s) => s.index === num || s.id === num);
    if (byIndex) return byIndex;

    // 2. Exact match on 0-based ordinal index
    if (num >= 0 && num < streams.length) {
      return streams[num];
    }
  }

  return streams[0];
}

function keyFor(absPath, mtimeMs, size, engine, audioIndex = 0, startSec = 0) {
  const ss = Math.floor(Math.max(0, Number(startSec) || 0));
  const aid = (audioIndex !== null && audioIndex !== undefined) ? audioIndex : 'none';
  return crypto.createHash('sha1')
    .update(`${absPath}|${mtimeMs}|${size}|${engine}|a${aid}|s${ss}`)
    .digest('hex')
    .slice(0, 20);
}

/**
 * Decide how a file should be delivered, given ffprobe metadata and selected audio track.
 */
function plan(info, absPath, requestedAudio = 0) {
  if (!info || !info.video) return { mode: 'native', reason: 'unknown-codecs' };
  const ext = path.extname(String(absPath || '')).toLowerCase().replace(/^\./, '');
  const containerNative = NATIVE_EXT.has(ext);
  const v = info.video;

  const a = resolveAudioStream(info, requestedAudio);
  const hasAudioStreams = Array.isArray(info.audioStreams) && info.audioStreams.length > 0;
  const hasAudio = hasAudioStreams && !!a;
  const selAudioIdx = a ? a.index : null;
  const isDefaultAudio = (!a || !hasAudioStreams || a.index === info.audioStreams[0].index);

  const vOk = NATIVE_VIDEO.has(v.codec) &&
    (!v.pixFmt || v.pixFmt === 'yuv420p' || v.pixFmt === 'yuvj420p');
  const aOk = !a || NATIVE_AUDIO.has(a.codec);

  // If container is native AND codecs are native AND default audio is used, browser plays directly
  if (containerNative && vOk && aOk && isDefaultAudio) {
    return { mode: 'native', reason: 'browser-playable', audioIndex: selAudioIdx, hasAudio };
  }

  // If both video and audio are streamable (container not native, or non-default audio track selected):
  // Fast lossless remux with -c copy (<1% CPU, starts in <0.5s)
  if (vOk && aOk) {
    return {
      mode: 'hls',
      engine: 'copy',
      reason: !containerNative ? 'container-not-streamable' : 'audio-track-switch',
      audioIndex: selAudioIdx,
      hasAudio
    };
  }

  // If video is already H.264 / browser compatible, DO NOT re-encode video!
  // Audio-only transcode (-c:v copy -c:a aac) consumes <1% CPU and preserves full video quality!
  if (vOk) {
    return { mode: 'hls', engine: 'audio-transcode', reason: 'audio-transcode-only', audioIndex: selAudioIdx, hasAudio };
  }

  // Video codec is unsupported (e.g. HEVC 10-bit / VP9 / VC1) -> hardware or CPU transcode
  return { mode: 'hls', engine: 'transcode', reason: 'codec-unsupported', audioIndex: selAudioIdx, hasAudio };
}

function playlistPath(dir) { return path.join(dir, 'master.m3u8'); }
function segPath(dir) { return path.join(dir, 'seg_%05d.m4s'); }

async function hasEndlist(dir) {
  try {
    const raw = await fsp.readFile(playlistPath(dir), 'utf8');
    await fsp.access(path.join(dir, 'init.mp4'));
    return raw.includes('#EXT-X-ENDLIST');
  } catch (_) { return false; }
}

async function wipe(dir) {
  await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
}

function argvFor(abs, engine, dir, audioIndex = 0, hasAudio = true, videoWidth = null, startSec = 0) {
  const base = [
    '-hide_banner', '-loglevel', 'error'
  ];

  const ss = Math.floor(Math.max(0, Number(startSec) || 0));
  if (ss > 0) {
    base.push('-ss', String(ss));
  }

  if (engine === 'transcode') {
    // Enable hardware acceleration for decoding when transcoding unsupported video
    base.push('-hwaccel', 'auto');
  }

  base.push(
    '-fflags', '+genpts',
    '-i', abs,
    '-map', '0:V:0'
  );

  if (hasAudio && audioIndex !== null && audioIndex !== undefined) {
    base.push('-map', `0:${audioIndex}`);
  }

  base.push(
    '-sn', // subtitles served separately as WebVTT
    '-f', 'hls',
    '-hls_init_time', String(INITIAL_SEG_SECONDS),
    '-hls_time', String(SEG_SECONDS),
    '-hls_playlist_type', 'event',
    '-hls_flags', 'independent_segments+temp_file',
    '-hls_segment_type', 'fmp4',
    '-hls_segment_filename', segPath(dir)
  );

  if (engine === 'copy') {
    // Lossless stream copy for both video and audio
    base.push('-c', 'copy', '-avoid_negative_ts', 'make_zero');
  } else if (engine === 'audio-transcode') {
    // Video is untouched (<1% CPU), audio downmixed to stereo AAC 256k if audio stream exists
    base.push('-c:v', 'copy', '-avoid_negative_ts', 'make_zero');
    if (hasAudio) {
      base.push('-c:a', 'aac', '-b:a', '256k', '-ac', '2');
    }
    base.push('-max_muxing_queue_size', '1024');
  } else {
    // Full transcode with Hardware Acceleration if available
    const nvenc = checkNvenc();
    // Cap resolution to 1080p if video is larger (e.g. 4K) to avoid burning GPU/CPU and dropping frames
    const scaleFilter = (videoWidth && videoWidth > 1920) ? ['-vf', 'scale=1920:-2'] : [];

    if (nvenc) {
      base.push(
        ...scaleFilter,
        '-c:v', 'h264_nvenc', '-preset', 'p4', '-tune', 'hq',
        '-b:v', '4500k', '-maxrate', '7000k', '-bufsize', '10000k',
        '-pix_fmt', 'yuv420p',
        '-force_key_frames', 'expr:gte(t,n_forced*' + SEG_SECONDS + ')'
      );
    } else {
      base.push(
        ...scaleFilter,
        '-threads', '2',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22',
        '-pix_fmt', 'yuv420p',
        '-force_key_frames', 'expr:gte(t,n_forced*' + SEG_SECONDS + ')'
      );
    }
    if (hasAudio) {
      base.push('-c:a', 'aac', '-b:a', '192k', '-ac', '2');
    }
    base.push('-max_muxing_queue_size', '2048');
  }

  base.push(playlistPath(dir));
  return base;
}

/** Create or attach to an HLS session; returns { key, dir, engine, audioIndex, startSec, done }. */
async function ensureSession(absPath, mtimeMs, size, engine, audioIndex = 0, videoWidth = null, hasAudio = true, startSec = 0) {
  const ss = Math.floor(Math.max(0, Number(startSec) || 0));
  const key = keyFor(absPath, mtimeMs, size, engine, audioIndex, ss);
  const dir = config.cacheDir('hls', key);
  let s = sessions.get(key);

  if (s && s.proc) {
    s.lastAccess = Date.now();
    return s;
  }

  // Terminate any previous active encoding session for this SAME file to bound CPU and prevent runaway jobs
  for (const [k, old] of sessions) {
    if (old.abs === absPath && old.key !== key && old.proc) {
      killProc(old.proc);
      old.proc = null;
      if (!old.done) wipe(old.dir).catch(() => {});
    }
  }

  // Also bound total active transcoding/remux sessions server-wide to prevent CPU starvation
  let activeCount = 0;
  for (const [k, other] of sessions) {
    if (other.proc && k !== key) {
      activeCount++;
      if (activeCount >= 2) {
        killProc(other.proc);
        other.proc = null;
        if (!other.done) wipe(other.dir).catch(() => {});
      }
    }
  }

  await fsp.mkdir(dir, { recursive: true });
  if (await hasEndlist(dir)) {
    // Fully encoded previously — serve from disk forever.
    if (s) { s.done = true; s.lastAccess = Date.now(); return s; }
    s = { key, dir, abs: absPath, engine, audioIndex, startSec: ss, proc: null, done: true, lastAccess: Date.now() };
    sessions.set(key, s);
    return s;
  }

  if (await fsp.stat(path.join(dir, 'master.m3u8')).then(() => true, () => false)) {
    // Stale partial output from a killed encoder — start fresh.
    await wipe(dir);
    await fsp.mkdir(dir, { recursive: true });
  }

  const proc = spawn(ffmpeg.FFMPEG, argvFor(absPath, engine, dir, audioIndex, hasAudio, videoWidth, ss), {
    cwd: dir,
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'pipe']
  });

  let errTail = '';
  proc.stderr.on('data', (d) => {
    errTail = (errTail + String(d)).slice(-4000);
  });

  proc.on('close', async (code) => {
    const cur = sessions.get(key);
    if (cur && cur.proc === proc) {
      cur.proc = null;
      cur.done = await hasEndlist(dir);
      if (!cur.done && code !== null) {
        logger.log('hls_failed', { key, engine, audioIndex, startSec: ss, code, err: errTail.slice(-300) });
      }
    }
  });

  proc.on('error', () => {});

  s = {
    key,
    dir,
    abs: absPath,
    engine,
    audioIndex,
    startSec: ss,
    proc,
    startedAt: Date.now(),
    lastAccess: Date.now(),
    done: false
  };
  sessions.set(key, s);
  logger.log('hls_start', { engine, audioIndex, startSec: ss, key });
  return s;
}

function stopSession(key) {
  const s = sessions.get(key);
  if (s) {
    if (s.proc) {
      killProc(s.proc);
      s.proc = null;
    }
    if (!s.done) wipe(s.dir).catch(() => {});
    return true;
  }
  return false;
}

function getSession(key) {
  if (!/^[a-f0-9]{20}$/.test(String(key))) return null;
  const s = sessions.get(key);
  if (s) s.lastAccess = Date.now();
  return s || null;
}

/** Kill encoders idle too long; wipe their partial output. LRU-caps sessions. */
async function reap() {
  const now = Date.now();
  for (const [key, s] of sessions) {
    if (s.proc && now - s.lastAccess > IDLE_KILL_MS) {
      killProc(s.proc);
      s.proc = null;
      if (!s.done) await wipe(s.dir);
    }
  }

  try {
    const root = config.cacheDir('hls');
    const dirs = (await fsp.readdir(root, { withFileTypes: true }))
      .filter((d) => d.isDirectory());
    if (dirs.length > MAX_SESSION_DIRS) {
      const stats = await Promise.all(dirs.map(async (d) => {
        const st = await fsp.stat(path.join(root, d.name)).catch(() => null);
        return { name: d.name, mtimeMs: st ? st.mtimeMs : 0, busy: sessions.get(d.name)?.proc };
      }));
      stats.sort((a, b) => a.mtimeMs - b.mtimeMs);
      for (const v of stats.slice(0, dirs.length - MAX_SESSION_DIRS)) {
        if (v.busy) continue;
        await wipe(path.join(root, v.name));
        sessions.delete(v.name);
      }
    }
  } catch (_) { /* cache root may not exist yet */ }
}

function startReaper() {
  if (!reaper) {
    reaper = setInterval(() => { reap().catch(() => {}); }, 10 * 1000);
    reaper.unref();
  }
}

async function servePlaylist(res, key) {
  const s = getSession(key);
  if (!s) return false;

  let raw = null;
  const initFile = path.join(s.dir, 'init.mp4');
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      raw = await fsp.readFile(playlistPath(s.dir), 'utf8');
      const st = await fsp.stat(initFile);
      // Wait until init.mp4 is non-empty AND playlist has at least one segment or has completed.
      // Serving a playlist with >=1 segment prevents Hls.js from stalling on an empty manifest.
      if (raw && (raw.includes('seg_') || raw.includes('#EXT-X-ENDLIST')) && st.size > 0) break;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 20));
  }
  if (!raw) return false;

  const rewritten = raw
    .replace(/URI="init\.mp4"/g, `URI="/api/hls/${key}/seg/init.mp4"`)
    .replace(/^init\.mp4$/gm, `/api/hls/${key}/seg/init.mp4`)
    .replace(/^(seg_\d+\.m4s)$/gm, `/api/hls/${key}/seg/$1`);

  res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.send(rewritten);
  return true;
}

async function serveSegment(res, key, segName) {
  const s = getSession(key);
  if (!s) return false;
  if (!/^(init\.mp4|seg_\d+\.m4s)$/.test(segName)) return false;

  const target = path.join(s.dir, segName);
  const deadline = Date.now() + 4000;
  let ready = false;
  while (Date.now() < deadline) {
    try {
      const st = await fsp.stat(target);
      if (st.size > 0) { ready = true; break; }
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 20));
  }
  if (!ready) return false;

  const isInit = segName === 'init.mp4';
  res.setHeader('Content-Type', isInit ? 'video/mp4' : 'video/iso.segment');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  fs.createReadStream(target).pipe(res);
  return true;
}

module.exports = {
  plan,
  ensureSession,
  stopSession,
  getSession,
  startReaper,
  servePlaylist,
  serveSegment,
  sessions
};
