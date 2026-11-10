'use strict';

const fs = require('fs');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');

const config = require('./config');

// CPU% is sampled on demand (a 150 ms snapshot window) instead of a background
// polling loop, so there is no continuous overhead on the host machine.

function cpuTimes() {
  const totals = { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 };
  for (const c of os.cpus()) {
    totals.user += c.times.user;
    totals.nice += c.times.nice;
    totals.sys += c.times.sys;
    totals.idle += c.times.idle;
    totals.irq += c.times.irq;
  }
  return totals;
}

function busyOf(t) {
  return t.user + t.nice + t.sys + t.irq;
}

async function cpuPercent() {
  const s1 = cpuTimes();
  await new Promise((r) => setTimeout(r, 150));
  const s2 = cpuTimes();
  const busy = busyOf(s2) - busyOf(s1);
  const total = (busyOf(s2) + s2.idle) - (busyOf(s1) + s1.idle);
  if (total <= 0) return null;
  return Math.min(100, Math.max(0, (busy / total) * 100));
}

async function diskUsage() {
  const cfg = config.get();
  const target = cfg.mediaDir || process.cwd();
  try {
    const s = await fsp.statfs(target);
    const bsize = s.bsize || s.frsize || 4096;
    const total = Number(s.blocks) * bsize;
    const free = Number(s.bfree) * bsize;
    const available = Number(s.bavail) * bsize;
    const used = total - free;
    if (total > 0) {
      return {
        path: target,
        total,
        used,
        free: available,
        usedPercent: Math.round((used / total) * 1000) / 10
      };
    }
  } catch (_) { /* fall through */ }
  return null;
}

function lanIPs() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family !== 'IPv4' || ni.internal) continue;
      out.push(ni.address);
    }
  }
  return out;
}

async function stats() {
  const [cpu, disk] = await Promise.all([cpuPercent(), diskUsage()]);
  return {
    cpuPercent: cpu === null ? null : Math.round(cpu * 10) / 10,
    memTotal: os.totalmem(),
    memFree: os.freemem(),
    memUsedPercent: Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 1000) / 10,
    disk,
    uptimeSec: Math.round(os.uptime()),
    platform: os.platform(),
    hostname: os.hostname(),
    node: process.version,
    h264Accel: null // reported via ffmpeg check by the route layer
  };
}

// Suggested starting points for the "choose media directory" picker.
async function suggestedRoots() {
  const home = os.homedir();
  const roots = [home];
  for (const name of ['Desktop', 'Downloads', 'Documents', 'Videos', 'Music', 'Pictures', 'Movies', 'Public']) {
    roots.push(path.join(home, name));
  }
  if (process.platform === 'win32') {
    // Probe drive letters A-Z cheaply; existence of 'X:\' is a fast fail.
    for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
      roots.push(letter + ':\\');
    }
  }
  rootLoop: for (const r of roots) {
    try {
      const st = await fsp.stat(r);
      if (!st.isDirectory()) roots.splice(roots.indexOf(r), 1);
    } catch (_) {
      roots.splice(roots.indexOf(r), 1);
    }
    if (roots.length > 40) break rootLoop;
  }
  return [...new Set(roots)];
}

module.exports = { stats, lanIPs, suggestedRoots, diskUsage };
