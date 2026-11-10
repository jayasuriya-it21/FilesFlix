'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const cfgPath = path.join(dataDir, 'config.json');

const DEFAULTS = {
  port: 7010,
  mediaDir: null,        // absolute path to the hosted media root
  passwordHash: null     // scrypt hash "salt$hash", set during first-run host setup
};

let data = { ...DEFAULTS };
try {
  Object.assign(data, JSON.parse(fs.readFileSync(cfgPath, 'utf8')));
} catch (_) { /* first run */ }

function save() {
  try {
    fs.writeFileSync(cfgPath, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Failed to persist config:', e.message);
  }
}

module.exports = {
  get() { return data; },
  set(patch) {
    Object.assign(data, patch);
    save();
    return data;
  },

  cacheDir(...parts) {
    return path.join(dataDir, 'cache', ...parts);
  },

  ensureCache(...parts) {
    const p = this.cacheDir(...parts);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    return p;
  },

  dataDir,

  logPath: path.join(dataDir, 'log.jsonl'),

  // Stable secret for signing session cookies, generated once.
  get sessionSecret() {
    if (!data.sessionSecret) {
      data.sessionSecret = crypto.randomBytes(32).toString('hex');
      save();
    }
    return data.sessionSecret;
  }
};
