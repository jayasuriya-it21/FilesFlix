'use strict';

/* FileFlix v3 player — full-takeover overlay.
 *
 * Playback engine: every play starts with GET /api/hls/prepare?path=<rel>.
 *   { mode:'native' }                 -> direct HTTP-Range stream (/api/stream)
 *   { mode:'hls', key, engine, dur }  -> HLS playlist (/api/hls/<key>/master.m3u8),
 *                                        via vendored hls.js (lazy-loaded), or a
 *                                        plain src on browsers with native HLS.
 * In transcode mode the playlist GROWS while ffmpeg encodes: seeks clamp to
 * video.seekable end and an "Optimizing playback…" chip explains the wait.
 *
 * Kept from v2: sprite-sheet seek previews (/api/sprite + /api/spriteImg),
 * embedded + external subtitle menus (/api/subtitle), ±10s skips with flash
 * feedback, double-tap seek on touch. The spinner never blocks interaction.
 */

(() => {
  const $ = (id) => document.getElementById(id);

  const layer = $('playerLayer');
  const shell = $('playerShell');
  const video = $('video');
  const spinner = $('pSpinner');
  const tapGlyph = $('pTapGlyph');
  const skipFlash = $('pSkipFlash');
  const skipFlashIcon = $('pSkipFlashIcon');
  const skipFlashText = $('pSkipFlashText');
  const pTop = $('pTop');
  const pBack = $('pBack');
  const pTitle = $('pTitle');
  const pBadge = $('pBadge');
  const optimizing = $('pOptimizing');
  const centerMsg = $('pCenterMsg');
  const centerText = $('pCenterText');
  const centerRetry = $('pRetry');
  const centerDownload = $('pDownload');
  const controls = $('pControls');
  const pBar = $('pBar');
  const barTrack = $('pBarTrack');
  const barBuffered = $('pBarBuffered');
  const barFill = $('pBarFill');
  const barKnob = $('pBarKnob');
  const previewEl = $('pPreview');
  const previewImg = $('pPreviewImg');
  const previewTime = $('pPreviewTime');
  const tCur = $('tCur');
  const tDur = $('tDur');
  const pPlay = $('pPlay');
  const pRew = $('pRew');
  const pFwd = $('pFwd');
  const pVolBtn = $('pVolBtn');
  const pVol = $('pVol');
  const pNext = $('pNext');
  const pPip = $('pPip');
  const pCC = $('pCC');
  const pGear = $('pGear');
  const pFs = $('pFs');
  const pMenu = $('pMenu');

  /* ---------- inline SVG icons (1.8–2px stroke, 24 viewBox) ---------- */

  const I = {
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5.5v13l10.5-6.5z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="5" width="3.6" height="14" rx="1.1" fill="currentColor"/><rect x="13.4" y="5" width="3.6" height="14" rx="1.1" fill="currentColor"/></svg>',
    rew10: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.6 9.2A8 8 0 1 1 4 13"/><path d="M4.6 4v5.2h5.2"/><text x="12.4" y="16.4" font-size="7.5" font-weight="700" fill="currentColor" stroke="none" text-anchor="middle">10</text></svg>',
    fwd10: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19.4 9.2A8 8 0 1 0 20 13"/><path d="M19.4 4v5.2h-5.2"/><text x="11.6" y="16.4" font-size="7.5" font-weight="700" fill="currentColor" stroke="none" text-anchor="middle">10</text></svg>',
    volHigh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11.5 5.5 7 9H3.5v6H7l4.5 3.5z" fill="currentColor" stroke="none"/><path d="M15 9a4.2 4.2 0 0 1 0 6"/><path d="M17.8 6.6a8 8 0 0 1 0 10.8"/></svg>',
    volLow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11.5 5.5 7 9H3.5v6H7l4.5 3.5z" fill="currentColor" stroke="none"/><path d="M15 9a4.2 4.2 0 0 1 0 6"/></svg>',
    volMute: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11.5 5.5 7 9H3.5v6H7l4.5 3.5z" fill="currentColor" stroke="none"/><path d="m16 9.5 5 5M21 9.5l-5 5"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3.1"/><path d="M12 2.9v2.3M12 18.8v2.3M4.8 4.8l1.6 1.6M17.6 17.6l1.6 1.6M2.9 12h2.3M18.8 12h2.3M4.8 19.2l1.6-1.6M17.6 6.4l1.6-1.6"/></svg>',
    cc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3"/><text x="12" y="15.6" font-size="7.5" font-weight="700" fill="currentColor" stroke="none" text-anchor="middle">CC</text></svg>',
    pip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="4.5" width="18" height="15" rx="2.5"/><rect x="12" y="11.5" width="7" height="5.5" rx="1.4" fill="currentColor" stroke="none"/></svg>',
    expand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15"/></svg>',
    compress: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4v3.5A1.5 1.5 0 0 1 7.5 9H4M20 9h-3.5A1.5 1.5 0 0 1 15 7.5V4M15 20v-3.5a1.5 1.5 0 0 1 1.5-1.5H20M4 15h3.5a1.5 1.5 0 0 1 1.5 1.5V20"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5.5v13l8.5-6.5z" fill="currentColor"/><rect x="16.6" y="5.5" width="2.6" height="13" rx="1.1" fill="currentColor"/></svg>',
    check: '<svg class="pCheck" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
  };

  /* ---------- state ---------- */

  let current = null;      // { rel, name, audio, folderEntries }
  let currentAudioTrack = 0; // selected audio track index
  let siblings = null;     // ordered video entries of the folder
  let siblingIdx = -1;
  let session = null;      // { mode, engine, key, duration, startOffset }
  let metaInfo = null;
  let sprite = null;       // { url, cols, rows, w, h, interval }
  let hlsInstance = null;
  let hlsLibPromise = null;
  let hideTimer = null;
  let scrubbing = false;
  let pendingFrac = 0;
  let menuOpen = false;
  let menuTrigger = null;
  let rafId = 0;
  let lastFocus = null;
  let hlsNetRetries = 0;
  let hlsMediaRetries = 0;
  let lastTouchTap = 0;
  let lastTouchTime = 0;
  let lastMenuCloseAt = 0;
  let loadGen = 0;
  let activeAbortController = null;

  const HIDE_AFTER = 2800;

  const enc = encodeURIComponent;

  const fmt = (s) => {
    if (!isFinite(s) || s < 0) return '0:00';
    s = Math.floor(s);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(r).padStart(2, '0');
  };

  function effectiveDuration() {
    if (session && isFinite(session.duration) && session.duration > 0) return session.duration;
    if (metaInfo && isFinite(metaInfo.duration) && metaInfo.duration > 0) return metaInfo.duration;
    if (isFinite(video.duration) && video.duration > 0) return video.duration;
    return NaN;
  }

  function currentVirtualTime() {
    if (!session || session.mode === 'native') return video.currentTime || 0;
    const offset = session.startOffset || 0;
    return offset + (video.currentTime || 0);
  }

  /* ---------- open / close ---------- */

  function open(entry, list, index) {
    teardownMedia(false);

    current = entry;
    currentAudioTrack = 0;
    siblings = Array.isArray(list) ? list : null;
    siblingIdx = Number.isInteger(index) ? index : -1;
    session = null;
    metaInfo = null;
    sprite = null;
    scrubbing = false;
    hlsNetRetries = 0;
    hlsMediaRetries = 0;
    loadGen = 0;

    centerMsg.hidden = true;
    centerRetry.hidden = true;
    centerDownload.hidden = true;
    optimizing.hidden = true;
    pBadge.hidden = true;
    pBadge.textContent = '';
    pTitle.textContent = entry.name;
    pMenu.hidden = true;
    menuOpen = false;
    shell.classList.toggle('audioOnly', !!entry.audio);

    // audio-only chrome: no sprite, no subtitles, no PiP
    pCC.hidden = true;
    pPip.hidden = true;
    pNext.hidden = true;
    previewEl.classList.remove('on');
    previewImg.style.backgroundImage = '';

    syncPlayBtn(false); // honest until the 'play' event confirms playback
    video.playbackRate = 1;
    subtitleMenuValue = 'off';

    if (layer.hidden) lastFocus = document.activeElement;
    layer.hidden = false;
    for (const id of ['topbar', 'main', 'emptyState']) document.getElementById(id).inert = true;
    layer.classList.add('fade');
    requestAnimationFrame(() => layer.classList.remove('fade'));
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey, true);
    shell.focus({ preventScroll: true });
    wakeControls();

    spinner.classList.add('on');
    prepareAndAttach(0, false);
  }

  function close() {
    teardownMedia(false);
    layer.hidden = true;
    for (const id of ['topbar', 'main', 'emptyState']) document.getElementById(id).inert = false;
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onKey, true);
    clearTimeout(hideTimer);
    cancelAnimationFrame(rafId);
    spinner.classList.remove('on');
    closeMenu();
    current = null;
    siblings = null;
    siblingIdx = -1;
    session = null;
    metaInfo = null;
    sprite = null;
    if (lastFocus && document.contains(lastFocus) && typeof lastFocus.focus === 'function') {
      lastFocus.focus({ preventScroll: true });
    }
    lastFocus = null;
  }

  /** Stop playback and release every media resource. */
  function teardownMedia(keepSession = false) {
    if (activeAbortController) {
      try { activeAbortController.abort(); } catch (_) {}
      activeAbortController = null;
    }
    if (session && session.mode === 'hls' && session.key && !keepSession) {
      const stopKey = session.key;
      fetch('/api/hls/' + enc(stopKey) + '/stop', { method: 'POST', keepalive: true }).catch(() => {});
    }
    if (hlsInstance) {
      try { hlsInstance.destroy(); } catch (_) { /* ignore */ }
      hlsInstance = null;
    }
    try { video.pause(); } catch (_) { /* ignore */ }
    for (const t of Array.from(video.querySelectorAll('track'))) t.remove();
    video.removeAttribute('src');
    video.load();
  }

  function isOpen() { return !layer.hidden; }

  /* ---------- playback engine ---------- */

  function streamURL(rel) { return '/api/stream?path=' + enc(rel); }
  function downloadURL(rel) { return '/api/download?path=' + enc(rel); }

  async function prepareAndAttach(startPos = 0, keepPaused = false) {
    const entry = current;
    if (!entry) return;
    const currentGen = ++loadGen;

    if (activeAbortController) {
      try { activeAbortController.abort(); } catch (_) {}
    }
    // Teardown previous media/Hls instance immediately
    teardownMedia(false);
    // Teardown aborts the OLD request; only create the new signal afterwards.
    activeAbortController = new AbortController();
    const signal = activeAbortController.signal;
    spinner.classList.add('on');
    setOptimizing(false);

    // Provide instant virtual timeline visual feedback while attaching
    if (typeof startPos === 'number' && startPos > 0) {
      const d = effectiveDuration();
      if (isFinite(d) && d > 0) {
        const frac = Math.max(0, Math.min(1, startPos / d));
        barFill.style.transform = 'scaleX(' + frac + ')';
        const w = barTrack.getBoundingClientRect().width;
        barKnob.style.transform = 'translate(' + (frac * w - 6.5) + 'px, -50%)';
        tCur.textContent = fmt(startPos);
      }
    }

    let data = null;
    try {
      const sParam = (typeof startPos === 'number' && startPos > 0) ? `&start=${Math.floor(startPos)}` : '';
      const res = await fetch(`/api/hls/prepare?path=${enc(entry.rel)}&audio=${currentAudioTrack}${sParam}`, { signal });
      if (res.ok) data = await res.json();
    } catch (_) {
      if (signal.aborted || currentGen !== loadGen) return;
    }

    if (currentGen !== loadGen || current !== entry) return; // closed or superseded

    if (data && data.mode === 'hls' && data.key) {
      session = {
        mode: 'hls',
        engine: data.engine || 'copy',
        key: data.key,
        duration: Number(data.duration) || NaN,
        startOffset: Number(data.startOffset) || Math.floor(startPos) || 0
      };
      metaInfo = data.meta || null;
      if (data && typeof data.audioIndex === 'number') currentAudioTrack = data.audioIndex;
    } else {
      session = {
        mode: 'native',
        engine: 'native',
        duration: Number(data && data.duration) || NaN,
        startOffset: 0
      };
      metaInfo = (data && data.meta) || null;
      if (data && typeof data.audioIndex === 'number') currentAudioTrack = data.audioIndex;
    }

    paintBadge();
    paintDurationHint();
    buildSubtitles();
    if (subtitleMenuValue && subtitleMenuValue !== 'off') {
      selectSubtitle(subtitleMenuValue);
    }
    setupNextButton();
    setupPip();

    if (session.mode === 'hls') {
      attachHls(session.key, session.startOffset, keepPaused, currentGen);
    } else {
      video.src = streamURL(entry.rel);
      if (typeof startPos === 'number' && startPos > 0) {
        video.addEventListener('loadedmetadata', function onMeta() {
          if (currentGen !== loadGen) return;
          try { video.currentTime = startPos; } catch (_) {}
          if (!keepPaused) tryPlay();
        }, { once: true });
      } else {
        if (!keepPaused) tryPlay();
      }
    }

    if (!entry.audio) loadSprite();
  }

  function canNativeHls() {
    return video.canPlayType('application/vnd.apple.mpegurl') !== '';
  }

  /** Lazy-load the vendored hls.js only when a session actually needs it. */
  function ensureHlsLib() {
    if (window.Hls) return Promise.resolve(window.Hls);
    if (!hlsLibPromise) {
      hlsLibPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = '/vendor/hls.min.js?v=4';
        s.onload = () => resolve(window.Hls || null);
        s.onerror = () => { hlsLibPromise = null; reject(new Error('hls-load-failed')); };
        document.head.appendChild(s);
      });
    }
    return hlsLibPromise;
  }

  async function attachHls(key, startOffset, keepPaused, currentGen) {
    const entry = current;
    const url = '/api/hls/' + enc(key) + '/master.m3u8';

    // Safari (and friends) play HLS natively — no library needed.
    if (canNativeHls()) {
      video.src = url;
      if (currentGen !== loadGen || current !== entry) return;
      if (typeof startOffset === 'number' && startOffset > 0) {
        video.addEventListener('loadedmetadata', function onMeta() {
          if (currentGen !== loadGen || current !== entry) return;
          try { video.currentTime = 0; } catch (_) {}
        }, { once: true });
      }
      if (!keepPaused) tryPlay();
      return;
    }

    let Hls = null;
    try { Hls = await ensureHlsLib(); } catch (_) { Hls = null; }
    if (currentGen !== loadGen || current !== entry) return;

    if (!Hls || !Hls.isSupported()) {
      // Honest fallback: try the playlist as a plain src; an unsupported
      // browser will surface the error card with the download action.
      video.src = url;
      if (typeof startOffset === 'number' && startOffset > 0) {
        video.addEventListener('loadedmetadata', function onMeta() {
          if (currentGen !== loadGen || current !== entry) return;
          try { video.currentTime = 0; } catch (_) {}
        }, { once: true });
      }
      if (!keepPaused) tryPlay();
      return;
    }

    hlsInstance = new Hls({
      // FFmpeg already input-seeks; the HLS media timeline starts at zero.
      startPosition: 0,
      startFragPrefetch: true,
      progressive: true,
      lowLatencyMode: true,
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
      backBufferLength: 30,
      startLevel: -1,
      enableWorker: true
    });

    hlsInstance.on(Hls.Events.ERROR, onHlsError);
    hlsInstance.loadSource(url);
    hlsInstance.attachMedia(video);
    if (!keepPaused) tryPlay();
  }

  function onHlsError(_evt, data) {
    if (!data || !data.fatal || !hlsInstance) return;
    if (data.type === 'networkError' && hlsNetRetries < 2) {
      hlsNetRetries++;
      hlsInstance.startLoad();
      return;
    }
    if (data.type === 'mediaError' && hlsMediaRetries < 2) {
      hlsMediaRetries++;
      hlsInstance.recoverMediaError();
      return;
    }
    try { hlsInstance.destroy(); } catch (_) { /* ignore */ }
    hlsInstance = null;
    showPlayerError(
      'Playback stalled — the optimized stream for this file hit an error.\n' +
      'You can retry, or download the original file to watch it in a full player app.',
      true
    );
  }

  function tryPlay() {
    video.play().catch(() => {
      if (current && isOpen()) {
        notice('Press play to start — the browser blocked autoplay.', 2600);
      }
    });
  }

  /* ---------- badges, duration, "optimizing" chip ---------- */

  function prettyCodec(c) {
    const map = { hevc: 'HEVC', h264: 'H.264', mpeg4: 'MPEG-4', vp8: 'VP8', vp9: 'VP9', av1: 'AV1', av01: 'AV1' };
    return map[String(c || '').toLowerCase()] || String(c || '').toUpperCase();
  }

  function paintBadge() {
    if (current && current.audio) { pBadge.hidden = true; return; }
    const v = metaInfo && metaInfo.video;
    if (!session || !v || !v.codec) { pBadge.hidden = true; return; }
    const codec = prettyCodec(v.codec);
    let label;
    if (session.mode === 'hls' && session.engine === 'transcode') label = codec + ' → optimized';
    else if (session.mode === 'hls') label = codec + ' · remux';
    else label = codec;
    if (v.width && v.height) label += ' · ' + v.width + '×' + v.height;
    if (v.dolbyVision) label += ' · Dolby Vision';
    pBadge.textContent = label;
    pBadge.hidden = false;
  }

  /** Show the final duration immediately in transcode mode, before the
   *  growing playlist exposes it through the media element. */
  function paintDurationHint() {
    if (!isFinite(video.duration) && session && isFinite(session.duration) && session.duration > 0) {
      tDur.textContent = fmt(session.duration);
    }
  }

  function setOptimizing(on) {
    if (on && session && session.mode === 'hls' && session.engine === 'transcode') {
      optimizing.hidden = false;
    } else {
      optimizing.hidden = true;
    }
  }

  /* ---------- notices & errors ---------- */

  function notice(text, ms) {
    centerText.textContent = text;
    centerRetry.hidden = true;
    centerDownload.hidden = true;
    centerMsg.hidden = false;
    clearTimeout(notice._t);
    if (ms) notice._t = setTimeout(() => { centerMsg.hidden = true; }, ms);
  }

  function showPlayerError(text, allowRetry) {
    spinner.classList.remove('on');
    centerText.textContent = text;
    centerRetry.hidden = !allowRetry;
    centerDownload.hidden = !(current && current.rel);
    if (current && current.rel) centerDownload.href = downloadURL(current.rel);
    centerMsg.hidden = false;
    clearTimeout(notice._t);
    wakeControls();
  }

  centerRetry.addEventListener('click', () => {
    const entry = current;
    if (entry) open(entry, siblings, siblingIdx);
  });

  /* ---------- sprite seek previews (kept from v2) ---------- */

  async function loadSprite() {
    const entry = current;
    if (!entry || entry.audio) return;
    try {
      const res = await fetch('/api/sprite?path=' + enc(entry.rel));
      const sp = res.ok ? await res.json() : { available: false };
      if (current !== entry) return;
      if (sp && sp.available) {
        sprite = sp;
        previewImg.style.backgroundImage = "url('" + sp.url + "')";
      } else {
        sprite = null;
      }
    } catch (_) {
      sprite = null;
    }
  }

  function showPreview(clientX) {
    if (!sprite || !current || current.audio) return;
    const d = effectiveDuration();
    if (!isFinite(d) || d <= 0) return;
    const frac = barPoint(clientX);
    const t = frac * d;
    const h = sprite.h || (sprite.w * 9 / 16);
    const idx = Math.min(Math.floor(t / sprite.interval), sprite.cols * sprite.rows - 1);
    const col = idx % sprite.cols;
    const row = Math.floor(idx / sprite.cols);
    previewImg.style.backgroundSize = (sprite.w * sprite.cols) + 'px ' + (h * sprite.rows) + 'px';
    previewImg.style.width = sprite.w + 'px';
    previewImg.style.height = h + 'px';
    previewImg.style.backgroundPosition = (-col * sprite.w) + 'px ' + (-row * h) + 'px';
    previewTime.textContent = fmt(t);

    const rect = barTrack.getBoundingClientRect();
    const px = Math.max(6, Math.min(rect.width - sprite.w - 6, frac * rect.width - sprite.w / 2));
    previewEl.style.transform = 'translateX(' + px + 'px)';
    previewEl.classList.add('on');
  }

  function hidePreview() {
    previewEl.classList.remove('on');
  }

  /* ---------- scrubber ---------- */

  function barPoint(clientX) {
    const rect = barTrack.getBoundingClientRect();
    if (!rect.width) return 0;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }

  function paint() {
    const d = effectiveDuration();
    const cur = currentVirtualTime();

    if (!scrubbing) {
      tCur.textContent = fmt(cur);
      if (isFinite(d) && d > 0) {
        const frac = Math.max(0, Math.min(1, cur / d));
        barFill.style.transform = 'scaleX(' + frac + ')';
        const w = barTrack.getBoundingClientRect().width;
        barKnob.style.transform = 'translate(' + (frac * w - 6.5) + 'px, -50%)';
      } else {
        barFill.style.transform = 'scaleX(0)';
        barKnob.style.transform = 'translate(-6.5px, -50%)';
      }
    }

    if (isFinite(d) && d > 0) {
      tDur.textContent = fmt(d);
      pBar.setAttribute('aria-valuemax', String(Math.round(d)));
      try {
        if (video.buffered.length) {
          const bufOffset = (session && session.mode === 'hls') ? (session.startOffset || 0) : 0;
          const end = bufOffset + video.buffered.end(video.buffered.length - 1);
          barBuffered.style.transform = 'scaleX(' + Math.max(0, Math.min(1, end / d)) + ')';
        }
      } catch (_) { /* ignore */ }
    }
    pBar.setAttribute('aria-valuenow', String(Math.round(cur)));
    pBar.setAttribute('aria-valuetext', fmt(cur) + ' of ' + (isFinite(d) ? fmt(d) : 'unknown'));
  }

  function paintTick() {
    if (!isOpen()) { rafId = 0; return; }
    if (!video.paused && !scrubbing) paint();
    rafId = requestAnimationFrame(paintTick);
  }

  function seekTo(targetVirtualTime) {
    const d = effectiveDuration();
    if (isFinite(d) && d > 0) {
      targetVirtualTime = Math.max(0, Math.min(targetVirtualTime, Math.max(0, d - 0.25)));
    } else {
      targetVirtualTime = Math.max(0, targetVirtualTime);
    }

    // In native mode: HTTP Range requests seek natively
    if (!session || session.mode === 'native') {
      try { video.currentTime = targetVirtualTime; } catch (_) {}
      paint();
      return;
    }

    // In HLS mode: check if seek target is inside current session's seekable range
    const offset = session.startOffset || 0;
    const relTarget = targetVirtualTime - offset;

    let canSeekLocally = false;
    try {
      const se = video.seekable;
      if (se.length && relTarget >= 0) {
        const seStart = se.start(0);
        const seEnd = se.end(se.length - 1);
        if (relTarget >= seStart && relTarget <= seEnd - 0.5) {
          canSeekLocally = true;
        }
      }
    } catch (_) {}

    if (canSeekLocally) {
      try {
        video.currentTime = relTarget;
        paint();
        return;
      } catch (_) {}
    }

    // Outside the current session's seekable window:
    // Launch a seek-aware ffmpeg session at the requested timestamp!
    const wasPaused = video.paused;
    prepareAndAttach(targetVirtualTime, wasPaused);
  }

  function seekBy(delta) {
    const cur = currentVirtualTime();
    if (!isFinite(cur)) return;
    seekTo(cur + delta);
    flashSkip(delta < 0 ? 'left' : 'right');
  }

  // pointer-based dragging (mouse + touch unified)
  pBar.addEventListener('pointerdown', (ev) => {
    if (!current) return;
    scrubbing = true;
    pendingFrac = barPoint(ev.clientX);
    try { pBar.setPointerCapture(ev.pointerId); } catch (_) { /* ignore */ }
    ev.preventDefault();
    paintScrubVisual();
    if (ev.pointerType === 'mouse') showPreview(ev.clientX);
    wakeControls();
  });
  pBar.addEventListener('pointermove', (ev) => {
    if (scrubbing) {
      pendingFrac = barPoint(ev.clientX);
      paintScrubVisual();
      showPreview(ev.clientX);
    } else if (ev.pointerType === 'mouse') {
      showPreview(ev.clientX);
    }
    wakeControls();
  });
  pBar.addEventListener('pointerup', (ev) => {
    if (!scrubbing) return;
    scrubbing = false;
    pendingFrac = barPoint(ev.clientX);
    commitScrub();
    hidePreview();
  });
  pBar.addEventListener('pointercancel', () => {
    if (!scrubbing) return;
    scrubbing = false;
    paint();
    hidePreview();
  });
  pBar.addEventListener('pointerleave', () => {
    if (!scrubbing) hidePreview();
  });

  function paintScrubVisual() {
    const d = effectiveDuration();
    barFill.style.transform = 'scaleX(' + pendingFrac + ')';
    const w = barTrack.getBoundingClientRect().width;
    barKnob.style.transform = 'translate(' + (pendingFrac * w - 6.5) + 'px, -50%)';
    if (isFinite(d) && d > 0) tCur.textContent = fmt(pendingFrac * d);
  }

  function commitScrub() {
    const d = effectiveDuration();
    if (!isFinite(d) || d <= 0) { paint(); return; }
    seekTo(pendingFrac * d);
    paint();
  }

  /* ---------- play / volume / fullscreen / PiP ---------- */

  function togglePlay() {
    if (video.paused) video.play().catch(() => { /* ignore */ });
    else video.pause();
  }

  function volIcon() {
    if (video.muted || video.volume === 0) return I.volMute;
    return video.volume < 0.5 ? I.volLow : I.volHigh;
  }
  function paintVolume() {
    pVolBtn.innerHTML = volIcon();
    pVol.value = String(Math.round(video.volume * 100));
  }
  function nudgeVolume(d) {
    video.muted = false;
    video.volume = Math.max(0, Math.min(1, video.volume + d));
    paintVolume();
  }
  function toggleMute() {
    video.muted = !video.muted;
    paintVolume();
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => { /* ignore */ });
    } else if (shell.requestFullscreen) {
      shell.requestFullscreen().catch(() => {
        if (video.webkitSupportsFullscreen) { try { video.webkitEnterFullscreen(); } catch (_) { /* ignore */ } }
      });
    } else if (video.webkitSupportsFullscreen) {
      try { video.webkitEnterFullscreen(); } catch (_) { /* ignore */ }
    }
  }

  function setupPip() {
    const supported = typeof document.pictureInPictureEnabled === 'boolean' &&
      document.pictureInPictureEnabled &&
      current && !current.audio;
    pPip.hidden = !supported;
  }

  async function togglePip() {
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    } catch (_) { /* ignore */ }
  }

  function setupNextButton() {
    const list = siblings || computeSiblings();
    if (!current || current.audio || !list || siblingIdx < 0 || siblingIdx + 1 >= list.length) {
      pNext.hidden = true;
      return;
    }
    pNext.hidden = false;
  }

  /** Fallback: derive the folder's video list from known entries. */
  function computeSiblings() {
    const rel = current && current.rel;
    if (!rel) return null;
    const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';
    const src = (current.folderEntries || window.__lastEntries || []);
    const vids = src.filter((e) => !e.dir && e.cat === 'video' &&
      ((e.rel.includes('/') ? e.rel.slice(0, e.rel.lastIndexOf('/')) : '') === dir));
    vids.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
    return vids;
  }

  pNext.addEventListener('click', () => {
    const list = siblings || computeSiblings();
    if (!list || siblingIdx < 0 || siblingIdx + 1 >= list.length) return;
    const e = list[siblingIdx + 1];
    open({ rel: e.rel, name: e.name, audio: false, folderEntries: current.folderEntries }, list, siblingIdx + 1);
  });

  /* ---------- subtitles (kept from v2, menu-driven) ---------- */

  function subtitleOptions() {
    const opts = [];
    const entry = current;
    if (!entry || entry.audio) return opts;

    // 1) embedded text streams (ffmpeg extracts each to WebVTT)
    if (metaInfo && Array.isArray(metaInfo.subtitleStreams)) {
      for (const s of metaInfo.subtitleStreams) {
        if (s.bitmap) continue;
        const label = (s.lang || 'und') + (s.title ? ' · ' + s.title : '') + (s.codec ? ' (' + s.codec + ')' : '');
        opts.push({ value: 'idx:' + s.index, label });
      }
    }

    // 2) external .srt/.vtt siblings next to the video
    const dirRel = entry.rel.includes('/') ? entry.rel.slice(0, entry.rel.lastIndexOf('/')) : '';
    const base = entry.name.replace(/\.[^.]+$/, '').toLowerCase();
    for (const e of (entry.folderEntries || window.__lastEntries || [])) {
      if (e.dir || e.cat !== 'subtitle') continue;
      if (/\.vtt$/i.test(e.name)) {
        opts.push({ value: 'srt:' + (dirRel ? dirRel + '/' : '') + e.name, label: e.name.replace(/\.[^.]+$/, '') + ' (external)' });
      } else if (/\.srt$/i.test(e.name)) {
        const stem = e.name.replace(/\.[^.]+$/, '').toLowerCase();
        if (stem === base || stem.startsWith(base + '.')) {
          opts.push({ value: 'srt:' + (dirRel ? dirRel + '/' : '') + e.name, label: e.name.replace(/\.[^.]+$/, '') + ' (external)' });
        }
      }
    }
    return opts;
  }

  function hasBitmapSubs() {
    return !!(metaInfo && metaInfo.subtitleStreams && metaInfo.subtitleStreams.some((s) => s.bitmap));
  }

  function buildSubtitles() {
    const opts = subtitleOptions();
    pCC.hidden = !(opts.length || hasBitmapSubs());
  }

  function selectSubtitle(val) {
    for (const t of Array.from(video.querySelectorAll('track'))) t.remove();
    if (!val || val === 'off') return;

    const t = document.createElement('track');
    t.kind = 'subtitles';
    t.label = 'Subtitles';
    t.default = true;
    const off = (session && session.mode === 'hls' && session.startOffset > 0) ? Math.floor(session.startOffset) : 0;
    const offParam = off > 0 ? ('&offset=' + off) : '';
    if (val.startsWith('idx:')) {
      t.src = '/api/subtitle?path=' + enc(current.rel) + '&idx=' + enc(val.slice(4)) + offParam;
    } else if (val.startsWith('srt:')) {
      t.src = '/api/subtitle?srt=' + enc(val.slice(4)) + offParam;
    } else {
      return;
    }
    t.addEventListener('error', () => {
      notice('Subtitles unavailable for this stream (bitmap or conversion failed).', 2600);
    });
    video.appendChild(t);
  }

  function activeSubtitle() { return subtitleMenuValue || 'off'; }
  let subtitleMenuValue = 'off';

  /* ---------- audio tracks (server-side stream switching + native) ---------- */

  function audioTrackItems() {
    const items = [];
    const at = video.audioTracks;
    if (at && at.length > 1) {
      for (let i = 0; i < at.length; i++) {
        const t = at[i];
        items.push({
          index: i,
          type: 'native',
          label: (t.label || 'Track ' + (i + 1)) + (t.language ? ' (' + t.language + ')' : ''),
          checked: t.enabled
        });
      }
      return { items, switchable: true, mode: 'native' };
    }
    const streams = metaInfo && metaInfo.audioStreams;
    if (streams && streams.length > 1) {
      for (let i = 0; i < streams.length; i++) {
        const s = streams[i];
        const lang = (s.lang || 'Track ' + (i + 1)).toUpperCase();
        const title = s.title ? ' · ' + s.title : '';
        const codec = s.codec ? ' (' + s.codec.toUpperCase() + (s.channels ? ' ' + s.channels + 'ch' : '') + ')' : '';
        const isChecked = (currentAudioTrack === s.index) ||
                          (!streams.some((st) => st.index === currentAudioTrack) && i === 0);
        items.push({
          index: s.index,
          type: 'server',
          label: lang + title + codec,
          checked: isChecked
        });
      }
      return { items, switchable: true, mode: 'server' };
    }
    return null;
  }

  function switchAudioTrack(trackIdx) {
    if (trackIdx === currentAudioTrack) return;
    const curTime = currentVirtualTime();
    const wasPaused = video.paused;
    currentAudioTrack = trackIdx;
    notice('Switching audio track…', 1800);
    prepareAndAttach(curTime, wasPaused);
  }

  /* ---------- menus ---------- */

  function menuPos(trigger) {
    const shellRect = shell.getBoundingClientRect();
    const tr = trigger.getBoundingClientRect();
    const mw = pMenu.offsetWidth;
    const left = Math.max(12, Math.min(shellRect.width - mw - 12, tr.left - shellRect.left + tr.width / 2 - mw / 2));
    pMenu.style.left = left + 'px';
    pMenu.style.bottom = (shellRect.bottom - tr.top + 10) + 'px';
    pMenu.style.top = 'auto';
  }

  function openMenu(trigger) {
    menuTrigger = trigger;
    pMenu.hidden = false;
    menuPos(trigger);
    menuOpen = true;
    trigger.setAttribute('aria-expanded', 'true');
    const first = pMenu.querySelector('.pMenuItem:not([aria-disabled="true"])');
    if (first) first.focus();
  }

  function closeMenu(refocus) {
    if (!menuOpen) return;
    menuOpen = false;
    pMenu.hidden = true;
    lastMenuCloseAt = Date.now();
    if (menuTrigger) {
      menuTrigger.setAttribute('aria-expanded', 'false');
      if (refocus) menuTrigger.focus();
    }
    menuTrigger = null;
  }

  function menuItem(label, checked, onClick, disabled) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pMenuItem';
    b.setAttribute('role', 'menuitemradio');
    b.setAttribute('aria-checked', checked ? 'true' : 'false');
    if (disabled) b.setAttribute('aria-disabled', 'true');
    const name = document.createElement('span');
    name.textContent = label;
    b.append(name);
    b.insertAdjacentHTML('beforeend', I.check);
    if (!disabled) b.addEventListener('click', onClick);
    return b;
  }

  function menuLabel(text) {
    const d = document.createElement('div');
    d.className = 'pMenuLabel';
    d.textContent = text;
    return d;
  }

  function menuInfo(text) {
    const d = document.createElement('div');
    d.className = 'pMenuInfo';
    d.textContent = text;
    return d;
  }

  function menuSep() {
    const d = document.createElement('div');
    d.className = 'pMenuSep';
    return d;
  }

  function openGearMenu() {
    pMenu.textContent = '';
    pMenu.setAttribute('aria-label', 'Playback settings');

    pMenu.appendChild(menuLabel('Playback speed'));
    for (const v of [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]) {
      pMenu.appendChild(menuItem(v + '×', Math.abs(video.playbackRate - v) < 0.01, () => {
        video.playbackRate = v;
        closeMenu(true);
      }));
    }

    pMenu.appendChild(menuSep());
    pMenu.appendChild(menuLabel('Quality'));
    if (session && session.mode === 'hls') {
      pMenu.appendChild(menuInfo(session.engine === 'transcode'
        ? 'Auto · optimized (HLS re-encode)'
        : 'Auto · remux (HLS, no re-encode)'));
    } else {
      pMenu.appendChild(menuInfo('Auto · direct stream'));
    }

    const audio = audioTrackItems();
    if (audio) {
      pMenu.appendChild(menuSep());
      pMenu.appendChild(menuLabel('Audio track'));
      if (audio.switchable) {
        for (const it of audio.items) {
          pMenu.appendChild(menuItem(it.label, it.checked, () => {
            if (audio.mode === 'native') {
              const at = video.audioTracks;
              for (let j = 0; j < at.length; j++) at[j].enabled = (j === it.index);
            } else {
              switchAudioTrack(it.index);
            }
            closeMenu(true);
          }));
        }
      } else {
        pMenu.appendChild(menuInfo(audio.note || 'No alternate audio tracks'));
      }
    }

    openMenu(pGear);
  }

  function openCCMenu() {
    const opts = subtitleOptions();
    pMenu.textContent = '';
    pMenu.setAttribute('aria-label', 'Subtitles');

    for (const o of opts) {
      pMenu.appendChild(menuItem(o.label, activeSubtitle() === o.value, () => {
        subtitleMenuValue = o.value;
        selectSubtitle(o.value);
        closeMenu(true);
      }));
    }
    pMenu.appendChild(menuItem('Off', activeSubtitle() === 'off', () => {
      subtitleMenuValue = 'off';
      selectSubtitle('off');
      closeMenu(true);
    }));
    if (hasBitmapSubs()) {
      pMenu.appendChild(menuInfo('Image-based subtitles in this file need a full player app.'));
    }

    openMenu(pCC);
  }

  // arrow-key navigation inside the open menu
  pMenu.addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
    ev.preventDefault();
    const items = Array.from(pMenu.querySelectorAll('.pMenuItem:not([aria-disabled="true"])'));
    const i = items.indexOf(document.activeElement);
    const next = ev.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    if (items[next]) items[next].focus();
  });

  document.addEventListener('pointerdown', (ev) => {
    if (!menuOpen) return;
    if (pMenu.contains(ev.target) || menuTrigger && menuTrigger.contains(ev.target)) return;
    closeMenu(false);
  });

  /* ---------- button wiring ---------- */

  pPlay.addEventListener('click', togglePlay);
  pRew.addEventListener('click', () => seekBy(-10));
  pFwd.addEventListener('click', () => seekBy(10));
  pBack.addEventListener('click', close);
  pFs.addEventListener('click', toggleFullscreen);
  pPip.addEventListener('click', togglePip);
  pVolBtn.addEventListener('click', toggleMute);
  pVol.addEventListener('input', () => {
    video.muted = false;
    video.volume = pVol.value / 100;
    paintVolume();
  });
  pGear.addEventListener('click', () => {
    if (menuOpen && menuTrigger === pGear) { closeMenu(true); return; }
    closeMenu(false);
    openGearMenu();
  });
  pCC.addEventListener('click', () => {
    if (menuOpen && menuTrigger === pCC) { closeMenu(true); return; }
    closeMenu(false);
    openCCMenu();
  });

  /* ---------- video element events ---------- */

  video.addEventListener('waiting', () => { if (!video.paused) spinner.classList.add('on'); });
  video.addEventListener('stalled', () => { if (!video.paused) spinner.classList.add('on'); });
  video.addEventListener('canplay', () => {
    spinner.classList.remove('on');
    // enough data buffered for the requested position — the chip can rest
    try {
      const se = video.seekable;
      if (!se.length || video.currentTime <= se.end(se.length - 1) + 0.5) setOptimizing(false);
    } catch (_) { /* ignore */ }
  });
  const syncPlayBtn = (playing) => {
    pPlay.innerHTML = playing ? I.pause : I.play;
    pPlay.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    pPlay.setAttribute('title', (playing ? 'Pause' : 'Play') + ' (Space)');
  };

  video.addEventListener('playing', () => {
    spinner.classList.remove('on');
    setOptimizing(false);
    syncPlayBtn(true);
    wakeControls(); // re-arm auto-hide after pause kept the chrome up
    if (!rafId) rafId = requestAnimationFrame(paintTick);
  });
  video.addEventListener('pause', () => {
    syncPlayBtn(false);
    cancelAnimationFrame(rafId);
    rafId = 0;
    wakeControls();
  });
  video.addEventListener('play', () => { syncPlayBtn(true); });
  video.addEventListener('timeupdate', () => { if (!scrubbing) paint(); });
  video.addEventListener('progress', () => { if (!scrubbing) paint(); });
  video.addEventListener('loadedmetadata', () => paint());
  video.addEventListener('durationchange', () => paint());
  video.addEventListener('error', () => {
    if (!current) return;
    showPlayerError(
      'This file cannot be played here — its container or codecs are not supported by the browser.\n' +
      'Download it to watch in a full player app instead.',
      true
    );
  });
  video.addEventListener('ended', () => {
    syncPlayBtn(false);
    wakeControls();
  });

  pVolBtn.innerHTML = I.volHigh;
  pPlay.innerHTML = I.play;
  pPlay.setAttribute('aria-label', 'Play');
  pPlay.setAttribute('title', 'Play / pause (Space)');
  pRew.innerHTML = I.rew10;
  pFwd.innerHTML = I.fwd10;
  pNext.innerHTML = I.next;
  pPip.innerHTML = I.pip;
  pCC.innerHTML = I.cc;
  pGear.innerHTML = I.gear;
  pFs.innerHTML = I.expand;
  paintVolume();

  document.addEventListener('fullscreenchange', () => {
    pFs.innerHTML = document.fullscreenElement ? I.compress : I.expand;
  });
  document.addEventListener('webkitfullscreenchange', () => {
    pFs.innerHTML = document.webkitFullscreenElement ? I.compress : I.expand;
  });

  /* ---------- tap / click surface (Hotstar-style) ---------- */

  const INTERACTIVE = '#pControls, #pTop, #pMenu, #pCenterMsg';

  shell.addEventListener('pointerup', (ev) => {
    if (ev.target.closest(INTERACTIVE)) return;
    if (Date.now() - lastMenuCloseAt < 250) return; // this click just closed a menu
    if (ev.pointerType === 'mouse') {
      togglePlay();
      showTapGlyph(video.paused ? 'play' : 'pause');
      wakeControls();
    } else {
      touchTap(ev);
    }
  });

  function touchTap(ev) {
    lastTouchTime = Date.now();
    const rect = shell.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const now = Date.now();
    if (now - lastTouchTap < 320) {
      // double tap: seek by 10s in the tapped direction
      if (x < rect.width * 0.5) seekBy(-10);
      else seekBy(10);
      lastTouchTap = 0;
      wakeControls();
    } else {
      lastTouchTap = now;
      // single tap: show or hide the chrome
      if (shell.classList.contains('idle')) wakeControls();
      else sleepControls(true);
    }
  }

  shell.addEventListener('dblclick', (ev) => {
    if (ev.target.closest(INTERACTIVE)) return;
    if (Date.now() - lastTouchTime < 700) return; // touch double-tap already handled
    const rect = shell.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    if (x < rect.width * 0.33) seekBy(-10);
    else if (x > rect.width * 0.67) seekBy(10);
    else toggleFullscreen();
  });

  function showTapGlyph(kind) {
    tapGlyph.innerHTML = kind === 'play' ? I.play : I.pause;
    tapGlyph.classList.add('on');
    clearTimeout(showTapGlyph._t);
    showTapGlyph._t = setTimeout(() => tapGlyph.classList.remove('on'), 340);
  }

  function flashSkip(side) {
    skipFlash.className = side; // 'left' | 'right' (resets any .on)
    skipFlashIcon.innerHTML = side === 'left' ? I.rew10 : I.fwd10;
    skipFlashText.textContent = '10 s';
    // force reflow so the transition retriggers on rapid skips
    void skipFlash.offsetWidth;
    skipFlash.classList.add('on');
    clearTimeout(flashSkip._t);
    flashSkip._t = setTimeout(() => skipFlash.classList.remove('on'), 360);
  }

  /* ---------- controls auto-hide (~2.8s) ---------- */

  function wakeControls() {
    shell.classList.remove('idle');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(sleepControls, HIDE_AFTER);
  }

  function sleepControls(force) {
    if (layer.hidden) return;
    if (!force) {
      if (video.paused) return;
      if (menuOpen) return;
      if (scrubbing) return;
      if (shell.contains(document.activeElement) && document.activeElement !== shell && document.activeElement.matches(':focus-visible')) return;
      if (controls.matches(':hover') || pTop.matches(':hover')) {
        // parked on the chrome — retry shortly instead of yanking it away
        clearTimeout(hideTimer);
        hideTimer = setTimeout(sleepControls, 600);
        return;
      }
    }
    shell.classList.add('idle');
  }

  layer.addEventListener('pointermove', () => wakeControls());
  layer.addEventListener('pointerdown', () => wakeControls());
  layer.addEventListener('focusin', wakeControls);

  /* ---------- keyboard ---------- */

  function onKey(ev) {
    if (!isOpen()) return;
    wakeControls();
    if (ev.key === 'Tab') {
      const items = Array.from(layer.querySelectorAll('button, a[href], input, [tabindex="0"]'))
        .filter((el) => !el.disabled && el.getClientRects().length && !el.closest('[hidden]'));
      const first = items[0], last = items[items.length - 1];
      if (ev.shiftKey && (document.activeElement === first || document.activeElement === shell)) {
        ev.preventDefault(); if (last) last.focus();
      } else if (!ev.shiftKey && document.activeElement === last) {
        ev.preventDefault(); if (first) first.focus();
      }
      return;
    }
    if (ev.key === 'Escape') {
      ev.preventDefault(); ev.stopPropagation();
      if (menuOpen) closeMenu(true);
      else if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen();
      else close();
      return;
    }
    const tag = ev.target && ev.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    const k = ev.key;
    if (menuOpen) {
      if (k === 'Escape') { ev.preventDefault(); ev.stopPropagation(); closeMenu(true); }
      return; // arrow keys are handled by the menu itself
    }
    if (k === ' ' && tag === 'BUTTON') return;
    if (k === ' ') { ev.preventDefault(); ev.stopPropagation(); togglePlay(); showTapGlyph(video.paused ? 'play' : 'pause'); }
    else if (k === 'ArrowLeft') { ev.preventDefault(); ev.stopPropagation(); seekBy(-10); }
    else if (k === 'ArrowRight') { ev.preventDefault(); ev.stopPropagation(); seekBy(10); }
    else if (k === 'ArrowUp') { ev.preventDefault(); ev.stopPropagation(); nudgeVolume(0.05); }
    else if (k === 'ArrowDown') { ev.preventDefault(); ev.stopPropagation(); nudgeVolume(-0.05); }
    else if (k === 'm' || k === 'M') toggleMute();
    else if (k === 'f' || k === 'F') toggleFullscreen();
    else if (k === 'c' || k === 'C') {
      if (!pCC.hidden) {
        if (menuOpen && menuTrigger === pCC) closeMenu(true);
        else { closeMenu(false); openCCMenu(); }
      }
    }
    else if (k === 'Escape') {
      ev.preventDefault(); ev.stopPropagation();
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen();
      else close();
    }
  }

  /* ---------- expose ---------- */

  window.Player = { open, close, isOpen };
  window.__setLastEntries = (entries) => { window.__lastEntries = entries; };
})();
