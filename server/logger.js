'use strict';

const fs = require('fs');
const config = require('./config');

const MAX_BYTES = 2 * 1024 * 1024; // rotate at ~2 MB to stay lightweight

function append(line) {
  try {
    fs.appendFileSync(config.logPath, JSON.stringify(line) + '\n');
    const st = fs.statSync(config.logPath);
    if (st.size > MAX_BYTES) {
      const old = config.logPath.replace(/\.jsonl$/, '.1.jsonl');
      try { fs.rmSync(old, { force: true }); } catch (_) { /* ignore */ }
      fs.renameSync(config.logPath, old);
    }
  } catch (_) { /* logging must never break a request */ }
}

function log(event, fields = {}) {
  append({ ts: new Date().toISOString(), event, ...fields });
}

function history(limit = 100) {
  try {
    const raw = fs.readFileSync(config.logPath, 'utf8').split('\n').filter(Boolean);
    const old = (() => {
      try {
        return fs.readFileSync(config.logPath.replace(/\.jsonl$/, '.1.jsonl'), 'utf8').split('\n').filter(Boolean);
      } catch (_) { return []; }
    })();
    const all = old.concat(raw).map((line) => {
      try { return JSON.parse(line); } catch (_) { return { ts: null, event: 'corrupt' }; }
    });
    return all.slice(-limit).reverse();
  } catch (_) {
    return [];
  }
}

module.exports = { log, history };
