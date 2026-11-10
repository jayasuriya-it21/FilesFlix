'use strict';

const crypto = require('crypto');
const fsp = require('fs').promises;
const fs = require('fs');
const path = require('path');

const config = require('../config');
const ffmpeg = require('./ffmpeg');

/**
 * Video metadata (ffprobe) + seek-preview sprite sheets + subtitle extraction.
 * Everything here is cached under data/cache/ and regenerated on demand.
 * When ffmpeg/ffprobe are missing, every function returns null or an
 * "unavailable" marker and the UI hides the corresponding feature.
 */

function cacheKey(kind, absPath, mtimeMs, extra) {
  const key = crypto.createHash('sha1')
    .update(absPath + '|' + Math.round(mtimeMs) + '|' + (extra || ''))
    .digest('hex')
    .slice(0, 24);
  return config.ensureCache(kind, key);
}

// In-flight deduplication to prevent redundant concurrent probes/jobs
const probePromises = new Map();
const spritePromises = new Map();
let spriteWorkerBusy = false;
const spriteQueue = [];

// Memory cache for already-probed metadata to accelerate browse requests without disk I/O
const memoryMetaCache = new Map();
const MAX_MEM_CACHE = 500;

// ---- ffprobe metadata -------------------------------------------------------

function isDolbyVision(s) {
  if (!s) return false;
  if (Array.isArray(s.side_data_list)) {
    for (const sd of s.side_data_list) {
      const type = String(sd.side_data_type || '').toLowerCase();
      if (type.includes('dovi') || type.includes('dolby vision')) {
        return true;
      }
    }
  }
  const tag = String(s.codec_tag_string || '').toLowerCase();
  if (tag.startsWith('dvh') || tag.startsWith('dva') || tag === 'dovi') {
    return true;
  }
  const profile = String(s.profile || '').toLowerCase();
  if (profile.includes('dolby vision') || profile.includes('dovi')) {
    return true;
  }
  if (s.tags) {
    for (const [k, v] of Object.entries(s.tags)) {
      const kl = k.toLowerCase();
      const vl = String(v).toLowerCase();
      if (kl.includes('dovi') || kl.includes('dolby') || vl.includes('dolby vision') || vl.includes('dovi')) {
        return true;
      }
    }
  }
  return false;
}

function isHdr10Plus(s) {
  if (!s || !Array.isArray(s.side_data_list)) return false;
  return s.side_data_list.some((sd) => {
    const type = String(sd.side_data_type || '').toLowerCase();
    return type.includes('hdr10+') ||
      type.includes('smpte2094-40') ||
      type.includes('dynamic hdr plus');
  });
}

function isHdr10(s) {
  if (!s) return false;
  const transfer = String(s.color_transfer || '').toLowerCase();
  const primaries = String(s.color_primaries || '').toLowerCase();
  return transfer === 'smpte2084' && (primaries === 'bt2020' || primaries === 'bt2020nc');
}

function extractSourceFormats(meta) {
  if (!meta) return [];
  const formats = [];

  if (meta.video) {
    if (meta.video.dolbyVision) {
      formats.push('Dolby Vision');
    } else if (meta.video.hdr10Plus) {
      formats.push('HDR10+');
    } else if (meta.video.hdr10) {
      formats.push('HDR10');
    }
  }

  if (Array.isArray(meta.audioStreams)) {
    let hasTrueHD = false;
    let hasEAC3 = false;
    let hasAC3 = false;
    let hasAtmos = false;

    for (const a of meta.audioStreams) {
      const c = String(a.codec || '').toLowerCase();
      const title = String(a.title || '');
      const isAtmos = /atmos/i.test(title);

      if (c === 'truehd') {
        hasTrueHD = true;
        if (isAtmos) hasAtmos = true;
      } else if (c === 'eac3') {
        hasEAC3 = true;
        if (isAtmos) hasAtmos = true;
      } else if (c === 'ac3') {
        hasAC3 = true;
      }
    }

    // Honest Dolby support: Atmos only if explicitly flagged in title/tag, never from eac3 alone
    if (hasAtmos) {
      formats.push('Dolby Atmos');
    }
    if (hasTrueHD) {
      formats.push('Dolby TrueHD');
    }
    if (hasEAC3) {
      formats.push('Dolby Digital Plus');
    }
    if (hasAC3) {
      formats.push('Dolby Digital');
    }
  }

  return formats;
}

async function probe(absPath) {
  if (!ffmpeg.available().ffprobe) {
    await ffmpeg.check();
  }
  if (!ffmpeg.available().ffprobe) return null;
  const res = await ffmpeg.exec(ffmpeg.FFPROBE, [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    absPath
  ], 30000);
  if (!res.ok) return null;
  try { return JSON.parse(res.stdout); } catch (_) { return null; }
}

function normalizeMeta(meta) {
  if (!meta) return null;
  if (meta.video) {
    if (typeof meta.video.dolbyVision !== 'boolean') {
      meta.video.dolbyVision = Boolean(meta.video.dolbyVision);
    }
    meta.video.hdr10Plus = Boolean(meta.video.hdr10Plus);
    meta.video.hdr10 = Boolean(meta.video.hdr10);
  }
  if (Array.isArray(meta.audioStreams)) {
    for (let i = 0; i < meta.audioStreams.length; i++) {
      const a = meta.audioStreams[i];
      if (a.ordinal === undefined) a.ordinal = i;
      if (a.id === undefined) a.id = a.index;
    }
  }
  if (Array.isArray(meta.subtitleStreams)) {
    for (let i = 0; i < meta.subtitleStreams.length; i++) {
      const s = meta.subtitleStreams[i];
      if (s.ordinal === undefined) s.ordinal = i;
      if (s.id === undefined) s.id = s.index;
    }
  }
  return meta;
}

async function getCachedMeta(absPath, mtimeMs, size) {
  const memKey = `${absPath}|${mtimeMs}|${size}`;
  if (memoryMetaCache.has(memKey)) {
    return memoryMetaCache.get(memKey);
  }
  const cacheFile = cacheKey('meta3', absPath, mtimeMs, size) + '.json';
  try {
    const raw = await fsp.readFile(cacheFile, 'utf8');
    const parsed = normalizeMeta(JSON.parse(raw));
    if (parsed) {
      if (memoryMetaCache.size >= MAX_MEM_CACHE) {
        const firstKey = memoryMetaCache.keys().next().value;
        memoryMetaCache.delete(firstKey);
      }
      memoryMetaCache.set(memKey, parsed);
    }
    return parsed;
  } catch (_) {
    return null;
  }
}

async function cachedSourceFormats(absPath, mtimeMs, size) {
  const m = await getCachedMeta(absPath, mtimeMs, size);
  return m ? extractSourceFormats(m) : [];
}

async function metaFor(absPath, mtimeMs, size) {
  const memKey = `${absPath}|${mtimeMs}|${size}`;
  if (memoryMetaCache.has(memKey)) {
    return memoryMetaCache.get(memKey);
  }
  const cacheFile = cacheKey('meta3', absPath, mtimeMs, size) + '.json';
  try {
    const raw = await fsp.readFile(cacheFile, 'utf8');
    const parsed = normalizeMeta(JSON.parse(raw));
    if (parsed) {
      memoryMetaCache.set(memKey, parsed);
      return parsed;
    }
  } catch (_) { /* miss */ }

  const inflightKey = `${absPath}|${mtimeMs}|${size}`;
  if (probePromises.has(inflightKey)) {
    return probePromises.get(inflightKey);
  }

  const p = (async () => {
    try {
      const data = await probe(absPath);
      if (!data) return null;
      const streams = data.streams || [];
      const audio = [];
      const subtitles = [];
      let video = null;
      for (const s of streams) {
        const labelParts = [s.lang || ''];
        if (s.tags && s.tags.title) labelParts.push(s.tags.title);
        if (s.codec_type === 'audio') {
          audio.push({
            id: s.index,
            index: s.index,
            ordinal: audio.length,
            codec: s.codec_name,
            lang: s.tags && s.tags.language ? s.tags.language : (s.lang || 'und'),
            title: (s.tags && s.tags.title) || '',
            channels: typeof s.channels === 'number' ? s.channels : null
          });
        } else if (s.codec_type === 'subtitle') {
          subtitles.push({
            id: s.index,
            index: s.index,
            ordinal: subtitles.length,
            codec: s.codec_name,
            lang: s.tags && s.tags.language ? s.tags.language : (s.lang || 'und'),
            title: (s.tags && s.tags.title) || '',
            bitmap: ['hdmv_pgs_subtitle', 'dvd_subtitle', 'eia_608'].includes(s.codec_name)
          });
        } else if (s.codec_type === 'video' && !video) {
          const dispose = s.disposition;
          if (!dispose || !dispose.attached_pic) {
            video = {
              codec: s.codec_name,
              pixFmt: s.pix_fmt || null,
              index: s.index,
              width: s.width || null,
              height: s.height || null,
              dolbyVision: isDolbyVision(s),
              hdr10Plus: isHdr10Plus(s),
              hdr10: isHdr10(s)
            };
          }
        }
      }

      const meta = {
        container: data.format && data.format.format_name ? data.format.format_name : null,
        duration: data.format && data.format.duration ? Math.round(parseFloat(data.format.duration) * 1000) / 1000 : null,
        video,
        audioStreams: audio,
        subtitleStreams: subtitles
      };
      try {
        await fsp.writeFile(cacheFile, JSON.stringify(meta));
      } catch (_) { /* cache write is best-effort */ }
      const norm = normalizeMeta(meta);
      memoryMetaCache.set(memKey, norm);
      return norm;
    } finally {
      probePromises.delete(inflightKey);
    }
  })();

  probePromises.set(inflightKey, p);
  return p;
}

// ---- seek-preview sprite sheet ----------------------------------------------

const SPRITE_COLS = 6;
const SPRITE_ROWS = 6;   // up to 36 tiles
const SPRITE_W = 160;

function drainSpriteQueue() {
  if (spriteWorkerBusy || spriteQueue.length === 0) return;
  spriteWorkerBusy = true;
  const nextJob = spriteQueue.shift();
  (async () => {
    try {
      const res = await executeSpriteJob(nextJob.absPath, nextJob.mtimeMs, nextJob.duration, nextJob.meta, nextJob.jsonPath, nextJob.imgPath);
      nextJob.resolve(res);
    } catch (err) {
      nextJob.resolve(null);
    } finally {
      spriteWorkerBusy = false;
      setTimeout(drainSpriteQueue, 100);
    }
  })();
}

async function executeSpriteJob(absPath, mtimeMs, duration, meta, jsonPath, imgPath) {
  const interval = Math.max(2, duration / (SPRITE_COLS * SPRITE_ROWS));
  const tmp = imgPath + '.partial.jpg';
  // Use -skip_frame nokey and limit threads to keep CPU utilization cool and generation fast (~1-2s)
  const args = [
    '-skip_frame', 'nokey',
    '-y', '-i', absPath,
    '-threads', '2',
    '-vf', 'fps=1/' + interval.toFixed(3) + ',scale=' + SPRITE_W + ':-2,tile=' + SPRITE_COLS +
      'x' + SPRITE_ROWS,
    '-frames:v', '1',
    '-q:v', '7',
    tmp
  ];
  const res = await ffmpeg.exec(ffmpeg.FFMPEG, args, 35000);
  if (!res.ok) {
    try { await fsp.rm(tmp, { force: true }); } catch (_) { /* ignore */ }
    return null;
  }
  try {
    await fsp.rename(tmp, imgPath);
  } catch (_) {
    try { await fsp.rm(tmp, { force: true }); } catch (_) { /* ignore */ }
    return null;
  }
  const info = {
    key: path.basename(meta),
    cols: SPRITE_COLS,
    rows: SPRITE_ROWS,
    interval: Math.round(interval * 100) / 100,
    w: SPRITE_W,
    h: null // client improvises with the sheet image itself
  };
  try { await fsp.writeFile(jsonPath, JSON.stringify(info)); } catch (_) { /* ignore */ }
  info.url = '/api/spriteImg?k=' + encodeURIComponent(info.key);
  return info;
}

async function spriteFor(absPath, mtimeMs, duration) {
  if (!ffmpeg.available().ffmpeg) return null;
  if (!duration || !isFinite(duration) || duration <= 0) return null;
  const meta = cacheKey('sprites', absPath, mtimeMs);
  const jsonPath = meta + '.json';
  const imgPath = meta + '.jpg';

  // Already built?
  try {
    const info = JSON.parse(await fsp.readFile(jsonPath, 'utf8'));
    if (fs.existsSync(imgPath)) {
      info.url = '/api/spriteImg?k=' + encodeURIComponent(path.basename(info.key));
      return info;
    }
  } catch (_) { /* miss */ }

  if (spritePromises.has(meta)) {
    return spritePromises.get(meta);
  }

  const p = new Promise((resolve) => {
    // Drop older queued sprite requests if backlog gets big (prevent runaway work)
    if (spriteQueue.length > 5) {
      const dropped = spriteQueue.shift();
      dropped.resolve(null);
    }
    spriteQueue.push({ absPath, mtimeMs, duration, meta, jsonPath, imgPath, resolve });
    drainSpriteQueue();
  }).finally(() => {
    spritePromises.delete(meta);
  });

  spritePromises.set(meta, p);
  return p;
}

async function spriteImage(key) {
  // The key is never user-controlled path data; validate strictly.
  if (!/^[0-9a-f]{24}$/.test(String(key))) return null;
  const p = config.cacheDir('sprites', key + '.jpg');
  try {
    const st = await fsp.stat(p);
    return { path: p, size: st.size, mtimeMs: st.mtimeMs };
  } catch (_) {
    return null;
  }
}

// ---- subtitle extraction ----------------------------------------------------

async function buildSubtitle(absPath, mtimeMs, streamIndex, bitmap) {
  if (bitmap) throw new Error('bitmap-subtitle');
  const cacheFile = cacheKey('subs', absPath, mtimeMs, streamIndex) + '.vtt';
  try { await fsp.access(cacheFile); return cacheFile; } catch (_) { /* regenerate */ }

  const tmp = cacheFile + '.partial.vtt';
  const args = [
    '-v', 'error',
    '-y', '-i', absPath,
    '-map', '0:' + streamIndex,
    '-f', 'webvtt',
    tmp
  ];
  const res = await ffmpeg.exec(ffmpeg.FFMPEG, args, 45000);
  if (!res.ok) {
    try { await fsp.rm(tmp, { force: true }); } catch (_) { /* ignore */ }
    throw new Error('subtitle-extract-failed');
  }
  try { await fsp.rename(tmp, cacheFile); } catch (_) {
    try { await fsp.rm(tmp, { force: true }); } catch (_) { /* ignore */ }
    throw new Error('subtitle-extract-failed');
  }
  return cacheFile;
}

async function subtitleFile(absPath, mtimeMs, streamIndex, bitmap) {
  try {
    return await buildSubtitle(absPath, mtimeMs, streamIndex, bitmap);
  } catch (e) {
    throw e;
  }
}

function metaKeyFor(kind, absPath, mtimeMs, extra) {
  return path.basename(cacheKey(kind, absPath, mtimeMs, extra));
}

module.exports = {
  metaFor,
  getCachedMeta,
  cachedSourceFormats,
  extractSourceFormats,
  spriteFor,
  spriteImage,
  subtitleFile,
  metaKeyFor
};
