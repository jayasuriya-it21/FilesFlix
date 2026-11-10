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
  const pPrev = $('pPrev');
  const pNext = $('pNext');
  const pRepeat = $('pRepeat');
  const pQueue = $('pQueue');
  const pPip = $('pPip');
  const pCC = $('pCC');
  const pGear = $('pGear');
  const pFs = $('pFs');
  const pMenu = $('pMenu');
  const pLock = $('pLock');
  const pUnlock = $('pUnlock');

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
    prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 5.5v13L9.5 12z" fill="currentColor"/><rect x="4.8" y="5.5" width="2.6" height="13" rx="1.1" fill="currentColor"/></svg>',
    repeat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3.8 20.5 7 17 10.2"/><path d="M3.5 11V9.5A2.5 2.5 0 0 1 6 7h14"/><path d="m7 20.2-3.5-3.2L7 13.8"/><path d="M20.5 13v1.5A2.5 2.5 0 0 1 18 17H4"/></svg>',
    repeatOne: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3.8 20.5 7 17 10.2M3.5 11V9.5A2.5 2.5 0 0 1 6 7h14M7 20.2 3.5 17 7 13.8M20.5 13v1.5A2.5 2.5 0 0 1 18 17H4"/><path d="M12 10v5M10.6 11.2 12 10"/></svg>',
    queue: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 6h12M4 11h12M4 16h8"/><path d="m16 15 5 3-5 3z" fill="currentColor" stroke="none"/></svg>',
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
  let locked = false;
  let subtitleDelay = 0;
  let gesture = null;
  let repeatMode = 'off';
  let lastResumeSave = 0;
  const cueTimes = new WeakMap();
  const PREF_KEY = 'fileflix.player.preferences';
  const RESUME_KEY = 'fileflix.player.resume';

  function readStored(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
    } catch (_) { return fallback; }
  }
  function writeStored(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* storage may be blocked/full */ }
  }
  const preferences = readStored(PREF_KEY, {});
  repeatMode = ['off', 'all', 'one'].includes(preferences.repeatMode) ? preferences.repeatMode : 'off';
  function savePreferences() {
    writeStored(PREF_KEY, {
      volume: video.volume, muted: video.muted, speed: video.playbackRate,
      aspect: preferences.aspect || 'contain', subtitleSize: preferences.subtitleSize || 100,
      repeatMode
    });
  }
  function saveResume() {
    if (!current || !session || video.readyState < 1) return;
    const time = currentVirtualTime(), duration = effectiveDuration();
    if (!Number.isFinite(time) || !Number.isFinite(duration)) return;
    const records = readStored(RESUME_KEY, {});
    if (video.ended || time < 10 || duration - time < 15) delete records[current.rel];
    else records[current.rel] = { time, duration, saved: Date.now() };
    const recent = Object.entries(records).filter(([, value]) => value && Number.isFinite(value.saved))
      .sort((a, b) => b[1].saved - a[1].saved).slice(0, 100);
    writeStored(RESUME_KEY, Object.fromEntries(recent));
  }
  function resumePosition(rel) {
    const record = readStored(RESUME_KEY, {})[rel];
    return record && Number.isFinite(record.time) && record.time >= 10 &&
      Number.isFinite(record.duration) && record.duration - record.time >= 15 ? record.time : 0;
  }
  function setLocked(value) {
    locked = value;
    closeMenu(false);
    controls.inert = value;
    pTop.inert = value;
    centerMsg.inert = value;
    shell.classList.toggle('locked', value);
    pUnlock.hidden = !value;
    if (value) pUnlock.focus();
    else { pLock.focus(); wakeControls(); }
  }
  function setAspect(value) {
    preferences.aspect = value;
    video.style.objectFit = value;
    savePreferences();
  }
  function setSubtitleSize(value) {
    preferences.subtitleSize = value;
    video.style.setProperty('--subtitle-size', (value * 0.24) + 'px');
    savePreferences();
  }
  function applySubtitleDelay(track, offset) {
    if (!track || !track.cues) return;
    // The endpoint already subtracts the integer offset. Correct its fractional
    // remainder here, using immutable originals so adjustments never accumulate.
    const correction = subtitleDelay - (offset - Math.floor(offset));
    for (const cue of Array.from(track.cues)) {
      if (!cueTimes.has(cue)) cueTimes.set(cue, { start: cue.startTime, end: cue.endTime });
      const original = cueTimes.get(cue);
      cue.endTime = Math.max(0.001, original.end + correction);
      cue.startTime = Math.max(0, Math.min(cue.endTime - 0.001, original.start + correction));
    }
  }

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
    saveResume();
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
    pPrev.hidden = true;
    pNext.hidden = true;
    pQueue.hidden = true;
    previewEl.classList.remove('on');
    previewImg.style.backgroundImage = '';

    syncPlayBtn(false); // honest until the 'play' event confirms playback
    video.playbackRate = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].includes(preferences.speed) ? preferences.speed : 1;
    video.defaultPlaybackRate = video.playbackRate;
    subtitleDelay = 0;
    if (locked) setLocked(false);
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
    const resume = resumePosition(entry.rel);
    prepareAndAttach(resume, false);
    if (resume) notice('Resuming at ' + fmt(resume) + '. Seek to the start to restart.', 3200);
  }

  function close() {
    saveResume();
    if (locked) setLocked(false);
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
    pVolBtn.setAttribute('aria-label', video.muted ? 'Unmute' : 'Mute');
    pVolBtn.setAttribute('aria-pressed', String(video.muted));
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
    } catch (_) { notice('Picture in picture is unavailable. Try again after playback starts.', 3000); }
  }

  function setupNextButton() {
    const list = siblings || computeSiblings();
    if (!current || current.audio || !list || siblingIdx < 0) {
      pPrev.hidden = true;
      pNext.hidden = true;
      pQueue.hidden = true;
      return;
    }
    pPrev.hidden = siblingIdx <= 0;
    pNext.hidden = siblingIdx + 1 >= list.length && repeatMode !== 'all';
    pQueue.hidden = list.length < 2;
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

  function playSibling(step) {
    const list = siblings || computeSiblings();
    if (!list || !list.length || siblingIdx < 0) return false;
    let nextIndex = siblingIdx + step;
    if (repeatMode === 'all') nextIndex = (nextIndex + list.length) % list.length;
    if (nextIndex < 0 || nextIndex >= list.length) return false;
    const e = list[nextIndex];
    open({ rel: e.rel, name: e.name, audio: false, folderEntries: current.folderEntries }, list, nextIndex);
    return true;
  }

  pPrev.addEventListener('click', () => playSibling(-1));
  pNext.addEventListener('click', () => playSibling(1));

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
    const offset = session && session.mode === 'hls' ? session.startOffset || 0 : 0;
    const off = Math.floor(offset);
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
    t.addEventListener('load', () => applySubtitleDelay(t.track, offset));
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

  function menuAction(label, note, active, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pMenuItem pQueueItem' + (active ? ' active' : '');
    b.setAttribute('role', 'menuitem');
    const copy = document.createElement('span');
    copy.className = 'pQueueCopy';
    const name = document.createElement('strong');
    name.textContent = label;
    copy.appendChild(name);
    if (note) {
      const meta = document.createElement('small');
      meta.textContent = note;
      copy.appendChild(meta);
    }
    b.appendChild(copy);
    if (active) b.insertAdjacentHTML('beforeend', I.check);
    b.addEventListener('click', onClick);
    return b;
  }

  function menuSep() {
    const d = document.createElement('div');
    d.className = 'pMenuSep';
    return d;
  }

  function openGearMenu() {
    pMenu.textContent = '';
    pMenu.classList.remove('queueMode');
    pMenu.setAttribute('aria-label', 'Playback settings');

    pMenu.appendChild(menuLabel('Playback speed'));
    for (const v of [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]) {
      pMenu.appendChild(menuItem(v + '×', Math.abs(video.playbackRate - v) < 0.01, () => {
        video.playbackRate = v;
        video.defaultPlaybackRate = v;
        preferences.speed = v;
        savePreferences();
        closeMenu(true);
      }));
    }

    pMenu.appendChild(menuSep());
    pMenu.appendChild(menuLabel('Video size'));
    for (const [value, label] of [['contain', 'Fit'], ['cover', 'Fill (crop edges)'], ['none', 'Original size']]) {
      pMenu.appendChild(menuItem(label, (preferences.aspect || 'contain') === value, () => {
        setAspect(value); closeMenu(true);
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

  function openQueueMenu() {
    const list = siblings || computeSiblings() || [];
    pMenu.textContent = '';
    pMenu.classList.add('queueMode');
    pMenu.setAttribute('aria-label', 'Playlist');
    pMenu.appendChild(menuLabel('Up next · ' + list.length + ' videos'));
    list.forEach((entry, index) => {
      pMenu.appendChild(menuAction(entry.name, index === siblingIdx ? 'Now playing' : '', index === siblingIdx, () => {
        closeMenu(false);
        if (index !== siblingIdx) open({ rel: entry.rel, name: entry.name, audio: false, folderEntries: current.folderEntries }, list, index);
      }));
    });
    openMenu(pQueue);
  }

  function openCCMenu() {
    const opts = subtitleOptions();
    pMenu.textContent = '';
    pMenu.classList.remove('queueMode');
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
    pMenu.appendChild(menuSep());
    pMenu.appendChild(menuLabel('Subtitle size'));
    for (const size of [75, 100, 125, 150]) {
      pMenu.appendChild(menuItem(size + '%', (preferences.subtitleSize || 100) === size, () => {
        setSubtitleSize(size); closeMenu(true);
      }));
    }
    pMenu.appendChild(menuSep());
    pMenu.appendChild(menuLabel('Subtitle delay · ' + subtitleDelay.toFixed(1) + ' s'));
    for (const [label, delta] of [['Earlier by 0.5 s', -0.5], ['Later by 0.5 s', 0.5], ['Reset delay', 0]]) {
      const item = menuItem(label, false, () => {
        subtitleDelay = delta ? Math.max(-30, Math.min(30, subtitleDelay + delta)) : 0;
        const offset = session && session.mode === 'hls' ? session.startOffset || 0 : 0;
        for (const element of Array.from(video.querySelectorAll('track'))) applySubtitleDelay(element.track, offset);
        closeMenu(true);
        notice('Subtitle delay: ' + subtitleDelay.toFixed(1) + ' s', 1800);
      });
      item.setAttribute('role', 'menuitem');
      item.removeAttribute('aria-checked');
      pMenu.appendChild(item);
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
  pLock.addEventListener('click', () => setLocked(true));
  pUnlock.addEventListener('click', () => setLocked(false));
  video.addEventListener('volumechange', () => { paintVolume(); savePreferences(); });
  video.addEventListener('ratechange', () => { preferences.speed = video.playbackRate; savePreferences(); });
  video.addEventListener('timeupdate', () => {
    if (Date.now() - lastResumeSave > 5000) { saveResume(); lastResumeSave = Date.now(); }
  });
  video.addEventListener('pause', saveResume);
  window.addEventListener('pagehide', saveResume);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveResume(); });
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
    saveResume();
    syncPlayBtn(false);
    wakeControls();
    if (repeatMode === 'one') {
      seekTo(0);
      tryPlay();
    } else {
      playSibling(1);
    }
  });

  pVolBtn.innerHTML = I.volHigh;
  pPlay.innerHTML = I.play;
  pPlay.setAttribute('aria-label', 'Play');
  pPlay.setAttribute('title', 'Play / pause (Space)');
  pRew.innerHTML = I.rew10;
  pFwd.innerHTML = I.fwd10;
  pPrev.innerHTML = I.prev;
  pNext.innerHTML = I.next;
  pQueue.innerHTML = I.queue;
  pPip.innerHTML = I.pip;
  pCC.innerHTML = I.cc;
  pGear.innerHTML = I.gear;
  pFs.innerHTML = I.expand;
  function paintRepeat() {
    pRepeat.innerHTML = repeatMode === 'one' ? I.repeatOne : I.repeat;
    pRepeat.classList.toggle('active', repeatMode !== 'off');
    const label = repeatMode === 'one' ? 'Repeat one' : repeatMode === 'all' ? 'Repeat all' : 'Repeat off';
    pRepeat.setAttribute('aria-label', label);
    pRepeat.title = label;
  }
  paintRepeat();
  pRepeat.addEventListener('click', () => {
    repeatMode = repeatMode === 'off' ? 'all' : repeatMode === 'all' ? 'one' : 'off';
    preferences.repeatMode = repeatMode;
    savePreferences();
    paintRepeat();
    setupNextButton();
    notice(pRepeat.getAttribute('aria-label'), 1200);
  });
  pQueue.addEventListener('click', () => {
    if (menuOpen && menuTrigger === pQueue) closeMenu(true);
    else { closeMenu(false); openQueueMenu(); }
  });
  if (typeof preferences.volume === 'number' && Number.isFinite(preferences.volume)) video.volume = Math.max(0, Math.min(1, preferences.volume));
  video.muted = preferences.muted === true;
  video.playbackRate = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].includes(preferences.speed) ? preferences.speed : 1;
  video.defaultPlaybackRate = video.playbackRate;
  setAspect(['contain', 'cover', 'none'].includes(preferences.aspect) ? preferences.aspect : 'contain');
  setSubtitleSize([75, 100, 125, 150].includes(preferences.subtitleSize) ? preferences.subtitleSize : 100);
  paintVolume();

  document.addEventListener('fullscreenchange', () => {
    pFs.innerHTML = document.fullscreenElement ? I.compress : I.expand;
  });
  document.addEventListener('webkitfullscreenchange', () => {
    pFs.innerHTML = document.webkitFullscreenElement ? I.compress : I.expand;
  });

  /* ---------- tap / click surface (Hotstar-style) ---------- */

  const INTERACTIVE = '#pControls, #pTop, #pMenu, #pCenterMsg, #pUnlock, button, input, a';

  shell.addEventListener('pointerdown', (ev) => {
    if (locked || ev.pointerType !== 'touch' || !ev.isPrimary || ev.target.closest(INTERACTIVE)) return;
    gesture = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, time: currentVirtualTime(), target: null };
  });
  shell.addEventListener('pointermove', (ev) => {
    if (!gesture || gesture.id !== ev.pointerId) return;
    const dx = ev.clientX - gesture.x, dy = ev.clientY - gesture.y;
    if (gesture.target === null && Math.abs(dy) > 20 && Math.abs(dy) > Math.abs(dx)) { gesture = null; return; }
    if (Math.abs(dx) < 24 && gesture.target === null) return;
    const duration = effectiveDuration();
    if (!Number.isFinite(duration)) return;
    if (gesture.target === null && shell.setPointerCapture) shell.setPointerCapture(ev.pointerId);
    gesture.target = Math.max(0, Math.min(duration, gesture.time + dx / shell.getBoundingClientRect().width * Math.min(duration, 120)));
    notice('Seek to ' + fmt(gesture.target), 1000);
  });
  shell.addEventListener('pointercancel', () => { gesture = null; });

  shell.addEventListener('pointerup', (ev) => {
    if (locked) return;
    if (gesture && gesture.id === ev.pointerId) {
      const target = gesture.target;
      gesture = null;
      if (target !== null) { lastTouchTap = 0; lastTouchTime = Date.now(); seekTo(target); wakeControls(); return; }
    }
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
    if (locked) return;
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

  function moveControlFocus(ev, step) {
    ev.preventDefault(); ev.stopPropagation();
    const items = Array.from(shell.querySelectorAll('button, input, [tabindex="0"]'))
      .filter(el => !el.disabled && !el.closest('[hidden], [inert]') && el.getClientRects().length);
    const index = items.indexOf(document.activeElement);
    const next = items[(index + step + items.length) % items.length];
    if (next) next.focus();
  }

  function onKey(ev) {
    if (!isOpen()) return;
    if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
    if (ev.key === 'Home' || ev.key === 'End' || ev.key === 'BrowserHome') return;
    if (locked) {
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); setLocked(false); }
      else if (ev.key !== 'Enter' && ev.key !== ' ') { ev.preventDefault(); pUnlock.focus(); }
      return;
    }
    wakeControls();
    if (ev.key === 'Tab') {
      const items = Array.from(layer.querySelectorAll('button, a[href], input, [tabindex="0"]'))
        .filter((el) => !el.disabled && el.getClientRects().length && !el.closest('[hidden], [inert]'));
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
    if ((ev.target === pVol || ev.target === pBar) && (ev.key === 'ArrowUp' || ev.key === 'ArrowDown')) {
      moveControlFocus(ev, ev.key === 'ArrowUp' ? -1 : 1);
      return;
    }
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    const k = ev.key;
    if (menuOpen) {
      if (k === 'Escape') { ev.preventDefault(); ev.stopPropagation(); closeMenu(true); }
      return; // arrow keys are handled by the menu itself
    }
    if (ev.target === shell && (k === 'ArrowDown' || k === 'ArrowUp')) {
      ev.preventDefault(); ev.stopPropagation();
      (k === 'ArrowDown' ? pPlay : pBack).focus();
      return;
    }
    // D-pad navigates actual controls when focused; arrows on the video retain
    // seek/volume shortcuts. Home/End are deliberately left to the browser/TV.
    if (tag === 'BUTTON' && /^Arrow/.test(k)) {
      const step = k === 'ArrowLeft' || k === 'ArrowUp' ? -1 : 1;
      moveControlFocus(ev, step);
      return;
    }
    if (k === ' ' && tag === 'BUTTON') return;
    if (k === ' ' || k === 'MediaPlayPause' || k === 'k' || (k === 'Enter' && ev.target === shell)) { ev.preventDefault(); ev.stopPropagation(); togglePlay(); showTapGlyph(video.paused ? 'play' : 'pause'); }
    else if (k === 'MediaPlay') { ev.preventDefault(); tryPlay(); }
    else if (k === 'MediaPause') { ev.preventDefault(); video.pause(); }
    else if (k === 'MediaRewind') { ev.preventDefault(); seekBy(-10); }
    else if (k === 'MediaFastForward') { ev.preventDefault(); seekBy(10); }
    else if (k === 'ArrowLeft') { ev.preventDefault(); ev.stopPropagation(); seekBy(-10); }
    else if (k === 'ArrowRight') { ev.preventDefault(); ev.stopPropagation(); seekBy(10); }
    else if (k === 'ArrowUp') { ev.preventDefault(); ev.stopPropagation(); nudgeVolume(0.05); }
    else if (k === 'ArrowDown') { ev.preventDefault(); ev.stopPropagation(); nudgeVolume(-0.05); }
    else if (k === 'm' || k === 'M') toggleMute();
    else if (k === 'f' || k === 'F') toggleFullscreen();
    else if (k === 'p' || k === 'P') playSibling(-1);
    else if (k === 'n' || k === 'N') playSibling(1);
    else if (k === 'r' || k === 'R') pRepeat.click();
    else if ((k === 'q' || k === 'Q') && !pQueue.hidden) openQueueMenu();
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
