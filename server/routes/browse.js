'use strict';

const express = require('express');
const fsp = require('fs').promises;
const path = require('path');

const types = require('../media/types');
const thumbs = require('../media/thumbs');
const meta = require('../media/meta');
const { httpError, resolveTarget, mediaRoot } = require('../paths');

const router = express.Router();

const SKIP_DIRS = new Set(['$RECYCLE.BIN', 'SYSTEM VOLUME INFORMATION']);
// Windows metadata files that should never surface in a media library.
const SKIP_FILES = new Set(['DESKTOP.INI', 'THUMBS.DB']);

function isJunkFile(name) {
  return SKIP_FILES.has(name.toUpperCase());
}

function basenameOf(p) {
  const base = path.basename(p);
  return base || p; // "D:\" style roots have empty basename
}

// Public info the client page needs before anything else.
router.get('/config', (req, res) => {
  const root = mediaRoot();
  if (!root) return res.json({ hasMedia: false });
  res.json({ hasMedia: true, rootName: basenameOf(root) });
});

/** Relative path of an entry, posix-styled, relative to the media root. */
function relOf(parts, name) {
  return [...parts, name].join('/');
}

function enqueueThumb(t, entry) {
  const abs = path.join(t.rootReal, ...entry.rel.split('/'));
  thumbs.request(abs, entry.mtimeMs, entry.size);
}

// Directory listing: folders first, then files, both alphabetically.
router.get('/browse', async (req, res, next) => {
  try {
    const dir = req.query.dir || '';
    const t = await resolveTarget(dir);
    if (t.abs !== t.rootReal) {
      const st = await fsp.stat(t.abs);
      if (!st.isDirectory()) throw httpError(400, 'Not a directory');
    }

    const entries = [];
    for (const d of await fsp.readdir(t.abs, { withFileTypes: true })) {
      if (d.name.startsWith('.')) continue;
      if (d.isFile() && isJunkFile(d.name)) continue;
      if (d.isDirectory() && SKIP_DIRS.has(d.name.toUpperCase())) continue;
      if (d.isFile()) {
        try {
          const st = await fsp.stat(path.join(t.abs, d.name));
          entries.push({
            name: d.name,
            dir: false,
            rel: relOf(t.parts, d.name),
            cat: types.categorize(d.name),
            size: st.size,
            mtimeMs: Math.round(st.mtimeMs)
          });
        } catch (_) { /* vanished mid listing */ }
      } else if (d.isDirectory()) {
        entries.push({ name: d.name, dir: true, rel: relOf(t.parts, d.name) });
      }
    }

    entries.sort((a, b) => {
      if (a.dir !== b.dir) return a.dir ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
    });

    // Background thumbnail generation & cached sourceFormats for videos — fire and forget / cache lookup only
    await Promise.all(entries.map(async (e) => {
      if (!e.dir && e.cat === 'video') {
        enqueueThumb(t, e);
        const abs = path.join(t.rootReal, ...e.rel.split('/'));
        e.sourceFormats = await meta.cachedSourceFormats(abs, e.mtimeMs, e.size);
      } else {
        e.sourceFormats = [];
      }
    }));

    // Breadcrumbs: Home = the media root itself.
    const breadcrumbs = [{ name: basenameOf(t.rootReal), rel: '' }];
    let acc = '';
    for (const p of t.parts) {
      acc = acc ? acc + '/' + p : p;
      breadcrumbs.push({ name: p, rel: acc });
    }

    res.json({
      dir: t.parts.join('/'),
      breadcrumbs,
      entries
    });
  } catch (e) { next(e); }
});

// Real-time search across the whole library (bounded, cached-free, simple).
router.get('/search', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase();
    if (!q) return res.json({ dir: '', results: [] });
    const t = await resolveTarget('');

    const MAX_FILES = 20000;   // scanned
    const MAX_RESULTS = 300;   // returned
    const results = [];
    let scanned = 0;

    const walk = async (abs, parts, depth) => {
      if (results.length >= MAX_RESULTS || scanned >= MAX_FILES || depth > 8) return;
      let dirents;
      try {
        dirents = await fsp.readdir(abs, { withFileTypes: true });
      } catch (_) {
        return;
      }
      for (const d of dirents) {
        if (scanned >= MAX_FILES || results.length >= MAX_RESULTS) return;
        if (d.name.startsWith('.') || (d.isDirectory() && SKIP_DIRS.has(d.name.toUpperCase()))) continue;
        if (d.isFile() && isJunkFile(d.name)) continue;
        scanned++;
        const rel = relOf(parts, d.name);
        if (d.isDirectory()) {
          await walk(path.join(abs, d.name), [...parts, d.name], depth + 1);
        } else if (d.name.toLowerCase().includes(q)) {
          try {
            const st = await fsp.stat(path.join(abs, d.name));
            results.push({
              name: d.name,
              rel,
              cat: types.categorize(d.name),
              size: st.size,
              mtimeMs: Math.round(st.mtimeMs)
            });
          } catch (_) { /* ok */ }
        }
      }
    };

    await walk(t.abs, [], 0);
    await Promise.all(results.map(async (r) => {
      if (r.cat === 'video') {
        const abs = path.join(t.rootReal, ...r.rel.split('/'));
        r.sourceFormats = await meta.cachedSourceFormats(abs, r.mtimeMs, r.size);
      } else {
        r.sourceFormats = [];
      }
    }));
    res.json({ dir: '', results });
  } catch (e) { next(e); }
});

module.exports = router;
