'use strict';

/* FileFlix host panel: first-run setup, login, media directory picker,
 * live system status, activity log. Talks only to /api/host/*. */

(() => {
  const $ = (id) => document.getElementById(id);

  const AUTHED = 'authed';
  const gate = $('gate');
  const gateTitle = $('gateTitle');
  const gateBtn = $('gateBtn');
  const gateErr = $('gateErr');

  let panel = null; // cached /api/host/panel data

  function note(el, text, isErr) {
    el.textContent = text || '';
    el.classList.toggle('err', !!isErr);
  }

  // ---------- boot ----------

  async function boot() {
    const res = await fetch('/api/host/session');
    const s = await res.json();
    if (s.authed) {
      authenticated(true);
    } else if (s.needsSetup) {
      gateTitle.textContent = 'Create the host password';
      $('pw').autocomplete = 'new-password';
      $('pw').placeholder = 'Choose a password (min 4 characters)';
      gateBtn.textContent = 'Create password';
      gate.hidden = false;
    } else {
      gateTitle.textContent = 'Host login';
      $('pw').placeholder = 'Password';
      gateBtn.textContent = 'Log in';
      gate.hidden = false;
    }
  }

  async function gateGo() {
    const password = $('pw').value;
    if (!password) { note(gateErr, 'Enter a password first.', true); return; }
    note(gateErr);
    // Decide setup vs login by re-reading state.
    const s = await (await fetch('/api/host/session')).json();
    const url = s.needsSetup ? '/api/host/setup' : '/api/host/login';
    const r2 = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const body = await r2.json().catch(() => ({}));
    if (!r2.ok) {
      note(gateErr, body.error || 'Login failed', true);
      return;
    }
    authenticated(true);
  }

  function authenticated(on) {
    gate.hidden = on;
    ['panelLibrary', 'panelSystem', 'panelLogs'].forEach((id) => ($(id).hidden = !on));
    $('logoutBtn').hidden = !on;
    if (on) {
      loadPanel();
      loadRoots();
      loadLogs();
      statTimer = setInterval(loadStats, 3000);
      loadStats();
    } else {
      clearInterval(statTimer);
      statTimer = null;
    }
  }

  let statTimer = null;

  async function loadPanel() {
    const res = await fetch('/api/host/panel');
    if (res.status === 401) { authenticated(false); return; }
    panel = await res.json();
    $('mediaDir').value = panel.mediaDir || '';
    $('stFfmpeg').textContent = ffLabel(panel.ffmpeg);
    $('stFfmpeg').className = 'v' + (panel.ffmpeg.ffmpeg ? '' : ' danger');
    $('ffmpegHint').textContent = ffHint(panel.ffmpeg);
  }

  function ffLabel(ff) {
    if (ff.ffmpeg && ff.ffprobe) return '✓ installed';
    if (ff.ffmpeg) return 'ffprobe missing';
    return '✗ not found';
  }

  function ffHint(ff) {
    if (ff.ffmpeg && ff.ffprobe) {
      return 'With FFmpeg on PATH, FileFlix generates video thumbnails, seek-preview sprites, subtitle tracks and audio-track metadata. It also prefers hardware-accelerated decode when the build provides it.';
    }
    return 'FFmpeg/ffprobe were not found. Everything still works for streaming and browsing — you just lose video thumbnails, seek previews and subtitle extraction. Install FFmpeg (Windows: `winget install Gyan.FFmpeg`, Linux: `sudo apt install ffmpeg`) and make sure both binaries are on PATH, or set FFMPEG_PATH explicitly. It is picked up automatically without restarting the server.';
  }

  async function loadRoots() {
    try {
      const res = await fetch('/api/host/roots');
      const data = await res.json();
      const dl = $('rootSuggestions');
      dl.textContent = '';
      for (const r of data.roots) {
        const o = document.createElement('option');
        o.value = r;
        dl.appendChild(o);
      }
    } catch (_) { /* suggestions are nice-to-have */ }
  }

  async function saveDir() {
    note($('libMsg'));
    try {
      const res = await fetch('/api/host/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaDir: $('mediaDir').value })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        note($('libMsg'), body.error || 'Could not save', true);
        return;
      }
      note($('libMsg'), 'Saved. Clients now browse ' + body.mediaDir);
    } catch (e) {
      note($('libMsg'), e.message, true);
    }
  }

  async function loadStats() {
    try {
      const res = await fetch('/api/host/system');
      if (res.status === 401) { authenticated(false); return; }
      const s = await res.json();
      $('stCpu').textContent = s.cpuPercent == null ? 'n/a' : s.cpuPercent.toFixed(1) + ' %';
      $('stMem').textContent = (s.memUsedPercent).toFixed(0) + ' % used (' + fmtBytes(s.memTotal - s.memFree) + ' / ' + fmtBytes(s.memTotal) + ')';
      $('stDisk').textContent = s.disk ? (s.disk.usedPercent).toFixed(1) + ' % used (' + fmtBytes(s.disk.used) + ' / ' + fmtBytes(s.disk.total) + ')' : 'n/a';
      const up = s.uptimeSec;
      const days = Math.floor(up / 86400);
      const hrs = Math.floor((up % 86400) / 3600);
      const mins = Math.floor((up % 3600) / 60);
      $('stUpt').textContent = (days ? days + 'd ' : '') + hrs + 'h ' + mins + 'm';
      $('stNode').textContent = s.node + ' · ' + s.platform;
      $('stLan').textContent = window.location.host + ' (host: ' + s.hostname + ')';
    } catch (_) { /* transient */ }
  }

  async function loadLogs() {
    try {
      const res = await fetch('/api/host/logs?limit=120');
      const data = await res.json();
      const el = $('logList');
      el.textContent = '';
      for (const e of data.entries) {
        const line = document.createElement('div');
        const icon = { host_login: '🔓', host_login_failed: '⛔', set_media_dir: '📂', play_or_open: '▶', download: '⬇', subtitle_extract: '💬' }[e.event] || '·';
        line.innerHTML = icon + ' <b></b> — <span></span>';
        line.querySelector('b').textContent = e.event;
        line.querySelector('span').textContent = new Date(e.ts).toLocaleString() + (e.file ? ' ' + e.file : '') + (e.mediaDir ? ' ' + e.mediaDir : '');
        el.appendChild(line);
      }
      if (!data.entries.length) {
        el.textContent = 'No activity yet.';
      }
    } catch (_) { /* transient */ }
  }

  function fmtBytes(n) {
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return n.toFixed(n >= 10 || i === 0 ? 0 : 1) + ' ' + u[i];
  }

  // ---------- events ----------

  gateBtn.addEventListener('click', gateGo);
  $('pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') gateGo(); });
  $('saveDir').addEventListener('click', saveDir);
  $('logoutBtn').addEventListener('click', async () => {
    await fetch('/api/host/logout', { method: 'POST' });
    authenticated(false);
  });

  boot().catch(() => note(gateErr, 'Cannot reach the FileFlix server.', true));
})();
