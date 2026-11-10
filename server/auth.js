'use strict';

const crypto = require('crypto');
const config = require('./config');
const logger = require('./logger');

const COOKIE = 'ff_host';
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

const sessions = new Map(); // token -> { exp }

// ---- password hashing (scrypt) ----

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 32).toString('hex');
  return salt + '$' + hash;
}

function verifyPassword(password, stored) {
  if (!stored || stored.indexOf('$') === -1) return false;
  const [salt, hash] = stored.split('$');
  const test = crypto.scryptSync(String(password), salt, 32).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(test, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---- tiny cookie parsing (no extra dependency) ----

function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie;
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// ---- login rate limiting (per source IP, sliding window) ----

const attempts = new Map(); // ip -> timestamps[]
const WINDOW = 10 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function rateLimited(ip) {
  const now = Date.now();
  const list = (attempts.get(ip) || []).filter((t) => now - t < WINDOW);
  attempts.set(ip, list);
  return list.length >= MAX_ATTEMPTS;
}

function recordAttempt(ip) {
  const list = attempts.get(ip) || [];
  list.push(Date.now());
  attempts.set(ip, list);
}

function rateLimitStatus(ip) {
  const now = Date.now();
  const list = (attempts.get(ip) || []).filter((t) => now - t < WINDOW);
  return { remaining: Math.max(0, MAX_ATTEMPTS - list.length) };
}

// ---- session helpers ----

function createSession(res) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { exp: Date.now() + SESSION_TTL });
  res.setHeader('Set-Cookie',
    COOKIE + '=' + token + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' + Math.floor(SESSION_TTL / 1000));
}

function destroySession(req, res) {
  const cookies = parseCookies(req);
  if (cookies[COOKIE]) sessions.delete(cookies[COOKIE]);
  res.setHeader('Set-Cookie', COOKIE + '=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
}

function isAuthed(req) {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE];
  if (!token) return false;
  const s = sessions.get(token);
  if (!s) return false;
  if (Date.now() > s.exp) { sessions.delete(token); return false; }
  return true;
}

function needsSetup() {
  return !config.get().passwordHash;
}

// Middleware factory for the host-only API routes.
function requireHost(req, res, next) {
  if (isAuthed(req)) return next();
  res.status(401).json({ error: 'Host login required' });
}

module.exports = {
  COOKIE,
  hashPassword,
  verifyPassword,
  parseCookies,
  rateLimited,
  recordAttempt,
  rateLimitStatus,
  createSession,
  destroySession,
  isAuthed,
  needsSetup,
  requireHost
};
