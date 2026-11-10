'use strict';

const crypto = require('crypto');
const fsp = require('fs').promises;
const fs = require('fs');
const path = require('path');

const config = require('../config');
const ffmpeg = require('./ffmpeg');

/**
 * Background thumbnail generation.
 *
 * Design goals:
 *  - never block a listing or a stream request (the client gets a 404 and
 *    retries later; nothing in the UI stalls)
 *  - at most one ffmpeg process at a time + a small gap between jobs, so a
 *    cheap CPU / low-RAM machine stays responsive
 *  - every thumbnail is content-addressed (abs path + mtime + size), so a
 *    renamed or re-generated file never serves a stale image
 */

const CONCURRENCY = 1;
const GAP_MS = 200;
const MAX_QUEUE = 120;
const FAILED_RETRY_MS = 60 * 1000;

const failedUntil = new Map(); // abs -> epoch ms when retrying is allowed
let queue = [];
let running = false;

function thumbPathFor(absPath, mtimeMs, size) {
  const key = crypto.createHash('sha1')
    .update(absPath + '|' + Math.round(mtimeMs) + '|' + size)
    .digest('hex')
    .slice(0, 24);
  return config.ensureCache('thumbs', key + '.jpg');
}

function has(absPath, mtimeMs, size) {
  try {
    return fs.existsSync(thumbPathFor(absPath, mtimeMs, size));
  } catch (_) {
    return false;
  }
}

/** Fire-and-forget: queues a thumbnail if it is missing and ffmpeg exists. */
function request(absPath, mtimeMs, size) {
  if (!ffmpeg.available().ffmpeg) return;
  if (failedUntil.has(absPath) && Date.now() < failedUntil.get(absPath)) return;
  if (has(absPath, mtimeMs, size)) return;
  if (queue.some((j) => j.absPath === absPath)) return;
  if (queue.length >= MAX_QUEUE) return;

  queue.push({ absPath, mtimeMs, size });
  if (!running) startWorker();
}

function startWorker() {
  running = true;
  (async () => {
    while (queue.length > 0) {
      const job = queue.shift();
      try {
        await generate(job);
      } catch (_) {
        failedUntil.set(job.absPath, Date.now() + FAILED_RETRY_MS);
      }
      await new Promise((r) => setTimeout(r, GAP_MS)); // keep the CPU cool
    }
    running = false;
  })().catch(() => { running = false; });
}

async function generate(job) {
  const out = thumbPathFor(job.absPath, job.mtimeMs, job.size);
  const tmp = out + '.partial.jpg';

  // Fast, seek-first attempt at a representative frame; harmless on failure.
  const attempts = [
    ['-ss', '4'],
    ['-ss', '0']
  ];
  for (const seek of attempts) {
    const args = [
      '-threads', '2',
      ...seek,
      '-y', '-i', job.absPath,
      '-frames:v', '1',
      '-vf', 'scale=480:270:force_original_aspect_ratio=increase,crop=480:270',
      '-q:v', '6',
      tmp
    ];
    const res = await ffmpeg.exec(ffmpeg.FFMPEG, args, 20000);
    if (res.ok) {
      try { await fsp.rename(tmp, out); } catch (_) { /* another worker won */ }
      return;
    }
  }
  try { await fsp.rm(tmp, { force: true }); } catch (_) { /* ignore */ }
  throw new Error('thumbnail failed');
}

/** Lets shutdown avoid killing ffmpeg mid-write. Mostly best-effort. */
async function flushQueue() {
  queue = [];
  // Small grace period for an in-flight ffmpeg job.
  await new Promise((r) => setTimeout(r, running ? 1200 : 0));
}

module.exports = { request, has, thumbPathFor };
