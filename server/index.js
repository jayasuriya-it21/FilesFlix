'use strict';

const express = require('express');
const path = require('path');
const os = require('os');

const config = require('./config');
const logger = require('./logger');
const ffmpeg = require('./media/ffmpeg');
const cache = require('./media/cache');
const apiRouter = require('./api');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '10kb' }));

// Basic security headers. Host pages are same-origin only; no framing from foreign sites.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

app.use('/api', apiRouter);

const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir, {
  extensions: ['html'],
  maxAge: '1h',
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  }
}));

// 404 for anything unserved
app.use((req, res) => {
  res.status(404).send('Not found');
});

// Last-resort error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (res.headersSent) return;
  const status = err.status || 500;
  if (status >= 500) logger.log('server_error', { message: err.message, path: req.originalUrl });
  res.status(status).json({ error: err.expose !== false ? err.message : 'Server error' });
});

function lanURLs(port) {
  const urls = ['http://localhost:' + port];
  const seen = new Set();
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family !== 'IPv4' || ni.internal) continue;
      if (seen.has(ni.address)) continue;
      seen.add(ni.address);
      urls.push('http://' + ni.address + ':' + port);
    }
  }
  return urls;
}

const port = Number(config.get().port) || 7010;
const server = app.listen(port, '0.0.0.0', () => {
  logger.log('boot', { port });
  console.log('\n  FileFlix is running on 0.0.0.0:%d\n', port);
  for (const u of lanURLs(port)) console.log('    ' + u);
  console.log('\n    Host panel: ' + lanURLs(port)[0] + '/host');
  console.log('    Client page is public LAN-wide; /host requires the host password.\n');
  ffmpeg.warm();
  // Prune oversized thumbnail/meta caches shortly after boot, off the critical path.
  setTimeout(() => {
    cache.prune('thumbs', 2000);
    cache.prune('sprites', 300);
    cache.prune('meta', 3000);
    cache.prune('subs', 600);
  }, 5000).unref();
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('\n  Port ' + port + ' is already in use — another FileFlix (or other app)\n' +
      '  instance is still running. Either stop it first, or change "port"\n' +
      '  in data/config.json.\n' +
      '  Windows tip: Get-NetTCPConnection -LocalPort ' + port + ' | fl OwningProcess\n');
  } else {
    console.error('Server error:', err.message);
  }
  process.exit(1);
});

async function shutdown() {
  logger.log('shutdown', {});
  try { await cache.flushQueue(); } catch (e) { /* ignore */ }
  try { server.close(() => process.exit(0)); } catch (e) { /* ignore */ }
  setTimeout(() => process.exit(0), 1200).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
