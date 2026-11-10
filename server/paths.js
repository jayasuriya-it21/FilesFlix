'use strict';

const path = require('path');
const fsp = require('fs').promises;

const config = require('./config');

/**
 * Path safety: the whole public API addresses files by a *relative* path
 * under the configured media root. Silently refusing anything that escapes
 * the root (absolute paths, `..`, back-tricks, symlinks) is the bedrock —
 * an error, never a crash.
 */

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function mediaRoot() {
  const cfg = config.get();
  if (!cfg.mediaDir) return null;
  return path.resolve(cfg.mediaDir);
}

function sanitizeRel(rel) {
  if (rel == null) throw httpError(400, 'Missing path');
  const parts = String(rel).split(/[\\/]+/).filter((p) => p && p !== '.');
  if (parts.some((p) => p === '..')) throw httpError(400, 'Invalid path');
  return parts;
}

async function realPaths() {
  const root = mediaRoot();
  if (!root) throw httpError(503, 'No media directory configured (ask the host)');
  let rootReal;
  let absReal;
  try {
    rootReal = await fsp.realpath(root);
  } catch (_) {
    throw httpError(500, 'Configured media directory is not accessible');
  }
  return { rootReal };
}

async function resolveTarget(rel) {
  const root = mediaRoot();
  if (!root) throw httpError(503, 'No media directory configured (ask the host)');
  const parts = sanitizeRel(rel);
  const abs = parts.length ? path.join(root, ...parts) : root;
  let rootReal, absReal;
  try {
    rootReal = await fsp.realpath(root);
  } catch (_) {
    throw httpError(500, 'Configured media directory is not accessible');
  }
  try {
    absReal = await fsp.realpath(abs);
  } catch (_) {
    throw httpError(404, 'Not found');
  }
  const norm = (s) => (process.platform === 'win32' ? s.toLowerCase() : s);
  const a = norm(absReal);
  const r = norm(rootReal);
  if (a !== r && !a.startsWith(r + path.sep)) throw httpError(403, 'Outside media root');
  return { parts, abs: absReal, rootReal, absRoot: path.basename(absReal) };
}

module.exports = { httpError, mediaRoot, sanitizeRel, resolveTarget, realPaths };
