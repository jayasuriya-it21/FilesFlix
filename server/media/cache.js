'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../config');

// Central cache management for the data/cache/ tree.
// Every entry type is limited; eviction is simply least-recently-modified.

async function prune(sub, maxFiles) {
  const dir = config.cacheDir(sub);
  try {
    const entries = await fs.promises.readdir(dir);
    if (entries.length <= maxFiles) return;
    const stats = [];
    for (const name of entries) {
      try {
        const st = await fs.promises.stat(path.join(dir, name));
        if (st.isFile()) stats.push({ name, mtimeMs: st.mtimeMs });
      } catch (_) { /* vanishing files are fine */ }
    }
    stats.sort((a, b) => b.mtimeMs - a.mtimeMs); // newest first
    const victims = stats.slice(maxFiles);
    for (const v of victims) {
      try { await fs.promises.rm(path.join(dir, v.name), { force: true }); } catch (_) { /* ignore */ }
    }
  } catch (_) { /* cache dir may not exist yet */ }
}

module.exports = { prune };
