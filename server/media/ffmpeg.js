'use strict';

const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// FFmpeg / FFprobe availability detection + safe argv-based execution.
// FileFlix degrades gracefully when FFmpeg is missing: no video thumbnails,
// no seek previews, no HLS remux/transcode, no multi-subtitle extraction.
//
// Resolution order: env override -> PATH -> WinGet portable installs
// (Gyan.FFmpeg), so a `winget install Gyan.FFmpeg` works without editing
// PATH or restarting the server.

function firstExisting(candidates) {
  for (const p of candidates) {
    try { if (p && fs.existsSync(p)) return p; } catch (_) { /* keep looking */ }
  }
  return null;
}

function wingetPackageBins(basename) {
  const out = [];
  try {
    const root = path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'WinGet', 'Packages');
    for (const pkg of fs.readdirSync(root)) {
      if (!/^Gyan\.FFmpeg/i.test(pkg)) continue;
      const pkgDir = path.join(root, pkg);
      for (const sub of fs.readdirSync(pkgDir)) {
        out.push(path.join(pkgDir, sub, 'bin', basename));
      }
    }
    // Sort so the highest version directory wins when several are installed.
    out.sort().reverse();
  } catch (_) { /* no winget packages dir */ }
  return out;
}

function resolveBin(name) {
  const envName = name.toUpperCase() + '_PATH';
  const wingetLink = path.join(os.homedir(), 'AppData', 'Local', 'Microsoft', 'WinGet', 'Links', name + '.exe');
  return firstExisting([
    process.env[envName],
    wingetLink,
    ...wingetPackageBins(name + '.exe')
  ]) || name; // fall back to bare name (PATH lookup by child_process)
}

const FFMPEG = resolveBin('ffmpeg');
const FFPROBE = resolveBin('ffprobe');

let cached = null;   // { ffmpeg, ffprobe, version }
let lastCheck = 0;
const TTL = 5 * 60 * 1000;

function exec(bin, args, timeout = 25000) {
  return new Promise((resolve) => {
    execFile(bin, args, {
      timeout,
      windowsHide: true,
      maxBuffer: 64 * 1024 * 1024
    }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout: stdout || '', stderr: stderr || '', error: err });
    });
  });
}

async function check(force) {
  const now = Date.now();
  if (!force && cached && (now - lastCheck) < TTL) return cached;
  const [f, p] = await Promise.all([
    exec(FFMPEG, ['-version'], 10000),
    exec(FFPROBE, ['-version'], 10000)
  ]);
  cached = {
    ffmpeg: f.ok,
    ffprobe: p.ok,
    version: f.ok ? (String(f.stdout).split('\n')[0] || 'ffmpeg') : null
  };
  lastCheck = now;
  return cached;
}

function warm() {
  check(true).catch(() => { /* handled at use sites */ });
}

function available() {
  return cached || { ffmpeg: false, ffprobe: false, version: null };
}

module.exports = { FFMPEG, FFPROBE, exec, check, warm, available };
