'use strict';

const express = require('express');
const fsp = require('fs').promises;

const config = require('../config');
const auth = require('../auth');
const logger = require('../logger');
const system = require('../system');
const ffmpeg = require('../media/ffmpeg');

const router = express.Router();

// ---- session state (public: the host page must be able to ask) --------------

router.get('/host/session', (req, res) => {
  res.json({
    authed: auth.isAuthed(req),
    needsSetup: auth.needsSetup(),
    limit: auth.rateLimitStatus(req.ip || '?')
  });
});

// ---- first-run setup (public while no password exists yet) -------------------

router.post('/host/setup', async (req, res, next) => {
  try {
    if (!auth.needsSetup()) return res.status(400).json({ error: 'Setup already completed' });
    const { password } = req.body || {};
    if (!password || String(password).length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }
    config.set({ passwordHash: auth.hashPassword(password) });
    logger.log('host_setup', {});
    auth.createSession(res);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---- login / logout ----------------------------------------------------------

router.post('/host/login', async (req, res, next) => {
  try {
    const ip = req.ip || '?';
    if (auth.rateLimited(ip)) {
      return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
    }
    const { password } = req.body || {};
    if (!auth.needsSetup() && auth.verifyPassword(password, config.get().passwordHash)) {
      auth.createSession(res);
      logger.log('host_login', { ip });
      return res.json({ ok: true });
    }
    auth.recordAttempt(ip);
    logger.log('host_login_failed', { ip });
    return res.status(401).json({ error: 'Wrong password' });
  } catch (e) { next(e); }
});

router.post('/host/logout', (req, res, next) => {
  try {
    auth.destroySession(req, res);
    logger.log('host_logout', {});
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ---- everything below requires a host session --------------------------------

router.use('/host', (req, res, next) => {
  if (req.path === '/login' || req.path === '/setup' || req.path === '/session') return next();
  return auth.requireHost(req, res, next);
});

// Host panel data
router.get('/host/panel', async (req, res, next) => {
  try {
    const cfg = config.get();
    const ff = ffmpeg.available();
    res.json({
      mediaDir: cfg.mediaDir,
      port: cfg.port,
      ffmpeg: ff,
      listURL: '/api/browse'
    });
  } catch (e) { next(e); }
});

router.patch('/host/settings', async (req, res, next) => {
  try {
    const { mediaDir } = req.body || {};
    if (typeof mediaDir !== 'string' || !mediaDir.trim()) {
      return res.status(400).json({ error: 'mediaDir is required' });
    }
    const p = mediaDir.trim();
    let st;
    try {
      st = await fsp.stat(p);
    } catch (_) {
      return res.status(400).json({ error: 'Path does not exist' });
    }
    if (!st.isDirectory()) {
      return res.status(400).json({ error: 'Not a directory' });
    }
    config.set({ mediaDir: p });
    logger.log('set_media_dir', { mediaDir: p });
    res.json({ ok: true, mediaDir: config.get().mediaDir });
  } catch (e) { next(e); }
});

router.get('/host/system', async (req, res, next) => {
  try {
    const stats = await system.stats();
    const ff = ffmpeg.available();
    res.json({ ...stats, ffmpeg: ff });
  } catch (e) { next(e); }
});

// Suggested roots for the path picker (Home, Downloads, drives, etc.).
router.get('/host/roots', async (req, res, next) => {
  try {
    res.json({ roots: await system.suggestedRoots() });
  } catch (e) { next(e); }
});

// Recent activity log
router.get('/host/logs', (req, res) => {
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 100));
  res.json({ entries: logger.history(limit) });
});

module.exports = router;
