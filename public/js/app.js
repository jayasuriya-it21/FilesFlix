'use strict';

/* FileFlix v3 client shell.
 *
 * Two modes, one design language:
 *   home  — OTT mode: hero + horizontal rows (per top-level folder, lazily loaded)
 *   files — manager mode: breadcrumbs, filter chips, grid/list, in-library search
 *
 * Videos open an OTT detail sheet (title page); images open a lightbox;
 * audio plays immediately; docs/other keep the download/preview behavior.
 * All playback runs through window.Player (player.js).
 */

(() => {
  const $ = (id) => document.getElementById(id);
  const enc = encodeURIComponent;

  /* ---------- inline SVG icons (1.8 stroke, 24 viewBox) ---------- */

  const I = {
    folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h4.2l2 2.5H19A1.5 1.5 0 0 1 20.5 9v8.5A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z"/></svg>',
    film: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/></svg>',
    image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.7"/><path d="m6 19 5.5-5.5 3.5 3.5 2-2 3.5 3.5"/></svg>',
    music: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18.5V6l10-2v12.5"/><circle cx="6.8" cy="18.5" r="2.3"/><circle cx="16.8" cy="16.5" r="2.3"/></svg>',
    doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5h6.5L18.5 9v10.5A1.5 1.5 0 0 1 17 21H6a1.5 1.5 0 0 1-1.5-1.5v-15A1.5 1.5 0 0 1 6 3.5z"/><path d="M12.5 3.5V9h6"/></svg>',
    archive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 4.5h17v4h-17z"/><path d="M5 8.5 6.1 19a1.5 1.5 0 0 0 1.5 1.3h8.8a1.5 1.5 0 0 0 1.5-1.3L19 8.5M9.8 12.5h4.4"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="6.5"/><path d="m16.2 16.2 4.3 4.3"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4.2 21 19H3z"/><path d="M12 10.2v3.6"/><path d="M12 16.6h.01"/></svg>',
    grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" stroke-width="2.4"/></svg>',
    chevL: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>',
    chevR: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 5.5 16 12l-6.5 6.5"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.4-6.1L21 8"/><path d="M21 3v5h-5"/></svg>'
  };

  const CAT_ICON = { video: I.film, audio: I.music, image: I.image, doc: I.doc, subtitle: I.doc, other: I.archive };

  /* ---------- state ---------- */

  const state = {
    mode: 'home',                 // 'home' | 'files'
    cwd: '',
    filter: 'all',
    view: localStorage.getItem('ff.view') || 'list',
    entries: [],                  // current files listing
    results: [],                  // search results
    searchQuery: '',
    rootEntries: [],
    folders: [],                  // [{ rel, name, entries|null, pending }]
    featured: null,
    loadingFiles: false,
    gen: 0                        // async generation guard
  };

  const libraryIndex = new Map(); // rel -> file entry, accumulated across loads

  const topbar = $('topbar');
  const mainNav = $('mainNav');
  const searchInput = $('search');
  const searchClear = $('searchClear');
  const homeView = $('homeView');
  const filesView = $('filesView');
  const crumbsEl = $('crumbs');
  const filtersEl = $('filters');
  const viewToggle = $('viewToggle');
  const container = $('container');
  const emptyState = $('emptyState');
  const emptyIcon = $('emptyIcon');
  const emptyTitle = $('emptyTitle');
  const emptyText = $('emptyText');
  const emptyRetry = $('emptyRetry');
  const emptyHost = $('emptyHost');

  const sheet = $('sheet');
  const sheetCard = sheet.querySelector('.sheetCard');
  const sheetImg = $('sheetImg');
  const sheetTitle = $('sheetTitle');
  const sheetMeta = $('sheetMeta');
  const sheetPlay = $('sheetPlay');
  const sheetFolder = $('sheetFolder');
  const sheetClose = $('sheetClose');

  const lightbox = $('lightbox');
  const lightboxImg = $('lightboxImg');

  let rootName = 'Library';
  let sheetEntry = null;
  let sheetReturnFocus = null;
  let thumbObserver = null;
  let rowObserver = null;

  /* ---------- small helpers ---------- */

  const dirname = (rel) => rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : '';

  function fmtSize(n) {
    if (n == null) return '';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return n.toFixed(n >= 10 || i === 0 ? 0 : 1) + ' ' + units[i];
  }

  function fmtDate(ms) {
    if (ms == null || !Number.isFinite(new Date(ms).getTime())) return '';
    try {
      return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (_) { return ''; }
  }

  function fmtDur(s) {
    if (!isFinite(s) || s <= 0) return '';
    s = Math.floor(s);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(r).padStart(2, '0');
  }

  function streamURL(rel) { return '/api/stream?path=' + enc(rel); }
  function downloadURL(rel) { return '/api/download?path=' + enc(rel); }
  function thumbURL(rel, mt) { return '/api/thumb?path=' + enc(rel) + '&mt=' + enc(String(mt || 0)); }

  function sortLikeServer(list) {
    return list.slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }));
  }

  function indexEntries(entries) {
    for (const e of entries) {
      if (!e.dir) libraryIndex.set(e.rel, e);
    }
  }

  /** Every known file entry that sits in the same folder as `rel`.
   *  Used for the player's subtitle siblings and "next video" list. */
  function contextEntries(rel) {
    const dir = dirname(rel);
    const pool = new Map();
    const sources = [state.entries, state.results, state.rootEntries];
    for (const f of state.folders) if (f.entries) sources.push(f.entries);
    sources.push(Array.from(libraryIndex.values()));
    for (const e of sources) {
      if (Array.isArray(e)) {
        for (const x of e) {
          if (!x.dir && dirname(x.rel) === dir) pool.set(x.rel, x);
        }
      }
    }
    return Array.from(pool.values());
  }

  function videosOf(entries) {
    return sortLikeServer(entries.filter((e) => !e.dir && e.cat === 'video'));
  }

  /* ---------- global spinner pill ---------- */

  function showPill(text) {
    let el = $('spinnerGlobal');
    if (!el) {
      el = document.createElement('div');
      el.id = 'spinnerGlobal';
      el.innerHTML = '<span class="miniRing" aria-hidden="true"></span><span id="spinnerText"></span>';
      document.body.appendChild(el);
    }
    el.querySelector('#spinnerText').textContent = text;
  }
  function hidePill() {
    const el = $('spinnerGlobal');
    if (el) el.remove();
  }

  /* ---------- empty / error states ---------- */

  function showEmpty(title, text, opts = {}) {
    homeView.hidden = true;
    filesView.hidden = true;
    emptyState.hidden = false;
    emptyIcon.innerHTML = opts.icon || I.film;
    emptyTitle.textContent = title;
    emptyText.textContent = text;
    emptyRetry.hidden = !opts.retry;
    emptyRetry.onclick = opts.retry || null;
    emptyHost.hidden = !opts.host;
  }

  function hideEmpty() { emptyState.hidden = true; }

  /* ---------- thumbnails (lazy, with icon fallback & poster search) ---------- */

  function posterURL(name) { return '/api/poster?name=' + enc(name); }

  function watchThumb(img, entry) {
    img.dataset.rel = entry.rel;
    img.dataset.name = entry.name;
    img.dataset.mt = String(entry.mtimeMs || 0);

    const loadImg = (im) => {
      // First try online movie poster for video files
      if (entry.cat === 'video') {
        const testImg = new Image();
        testImg.onload = () => { im.src = testImg.src; im.classList.add('posterImg'); };
        testImg.onerror = () => {
          // Fall back to FFmpeg generated frame thumbnail
          im.src = thumbURL(im.dataset.rel, im.dataset.mt);
        };
        testImg.src = posterURL(im.dataset.name);
      } else {
        im.src = thumbURL(im.dataset.rel, im.dataset.mt);
      }
    };

    if (!('IntersectionObserver' in window)) {
      loadImg(img);
      return;
    }
    if (!thumbObserver) {
      thumbObserver = new IntersectionObserver((items) => {
        for (const it of items) {
          if (!it.isIntersecting) continue;
          const im = it.target;
          thumbObserver.unobserve(im);
          loadImg(im);
        }
      }, { rootMargin: '300px' });
    }
    thumbObserver.observe(img);
  }

  /** Build a 16:9 thumb: gradient + icon fallback, media painted over it. */
  function buildThumb(entry) {
    const thumb = document.createElement('span');
    thumb.className = 'thumb';
    thumb.dataset.cat = entry.cat;
    thumb.innerHTML = CAT_ICON[entry.cat] || I.archive;
    if (entry.cat === 'video') {
      // Browsing must not start FFmpeg or online poster searches. The cover is
      // deliberately typographic; playback metadata is requested on demand.
      const title = document.createElement('span');
      title.className = 'coverTitle';
      title.textContent = entry.name.replace(/\.[^.]+$/, '').replace(/[._]/g, ' ');
      const format = document.createElement('span');
      format.className = 'coverFormat';
      format.textContent = (entry.name.split('.').pop() || 'Video').toUpperCase();
      if (Array.isArray(entry.sourceFormats) && entry.sourceFormats.length) {
        format.textContent += ' · ' + entry.sourceFormats.join(' · ');
        format.title = 'Source formats detected in this file. Browser playback may require conversion.';
      }
      let hash = 0;
      for (const ch of entry.name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
      thumb.dataset.tone = Math.abs(hash) % 4;
      thumb.append(title, format);
    } else if (entry.cat === 'image') {
      const img = document.createElement('img');
      img.alt = '';
      img.loading = 'lazy';
      img.src = streamURL(entry.rel);
      img.onerror = () => img.remove();
      thumb.appendChild(img);
    }
    return thumb;
  }

  /* ---------- navigation ---------- */

  const NAV_PRESETS = { videos: 'video', photos: 'image', music: 'audio', files: 'all' };

  function setActiveNav(key) {
    for (const a of mainNav.querySelectorAll('.navlink')) {
      a.classList.toggle('active', a.dataset.nav === key);
    }
  }

  function exitSearchUI() {
    state.searchQuery = '';
    state.results = [];
    searchInput.value = '';
    searchClear.hidden = true;
  }

  function navTo(key) {
    const gen = ++state.gen;
    hideEmpty();
    closeSheet();
    exitSearchUI();
    setActiveNav(key);

    if (key === 'home') {
      state.mode = 'home';
      homeView.hidden = false;
      filesView.hidden = true;
      renderHome(gen);
      return;
    }

    state.mode = 'files';
    state.cwd = '';
    state.filter = NAV_PRESETS[key] || 'all';
    syncFilterChips();
    homeView.hidden = true;
    filesView.hidden = false;
    loadBrowse('');
  }

  async function navigate(dir) {
    if (state.mode === 'home') state.filter = 'all';
    state.mode = 'files';
    homeView.hidden = true;
    filesView.hidden = false;
    setActiveNav('files');
    hideEmpty();
    state.cwd = dir;
    exitSearchUI();
    syncFilterChips();
    await loadBrowse(dir);
  }

  async function fetchBrowse(dir) {
    const res = await fetch('/api/browse?dir=' + enc(dir), { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || ('HTTP ' + res.status));
    }
    return res.json();
  }

  function explain(e) {
    if (String(e && e.message).includes('No media directory')) {
      return 'No media directory is configured yet. Set it up in the Host panel.';
    }
    return (e && e.message) || 'Something went wrong.';
  }

  async function loadBrowse(dir) {
    const gen = ++state.gen;
    state.loadingFiles = true;
    renderFilesSkeleton();
    renderCrumbs([{ name: dir ? dir.split('/').pop() : rootName, rel: dir }]);
    showPill('Loading…');
    try {
      const data = await fetchBrowse(dir);
      if (gen !== state.gen) return;
      state.entries = data.entries;
      indexEntries(data.entries);
      renderCrumbs(data.breadcrumbs);
      state.loadingFiles = false;
      hidePill();
      renderFiles();
    } catch (e) {
      if (gen !== state.gen) return;
      state.loadingFiles = false;
      hidePill();
      renderFilesError(e);
    }
  }

  /* ---------- home: OTT mode ---------- */

  function renderHomeSkeleton() {
    const cards = (n) => {
      let s = '';
      for (let i = 0; i < n; i++) {
        s += '<div class="skelCard"><div class="skel skelThumb"></div><div class="skel skelLine1"></div><div class="skel skelLine2"></div></div>';
      }
      return s;
    };
    const wrap = document.createElement('div');
    wrap.innerHTML =
      '<div class="skel skelHero"></div>' +
      '<div class="skelRow"><div class="skel skelRowLine"></div><div class="skelRowCards">' + cards(8) + '</div></div>' +
      '<div class="skelRow"><div class="skel skelRowLine"></div><div class="skelRowCards">' + cards(8) + '</div></div>';
    homeView.appendChild(wrap);
  }

  function renderHome(gen) {
    state.rootEntries = [];
    state.folders = [];
    state.featured = null;
    homeView.textContent = '';
    renderHomeSkeleton();

    (async () => {
      try {
        const data = await fetchBrowse('');
        if (gen !== state.gen) return;
        state.rootEntries = data.entries;
        indexEntries(data.entries);
      } catch (e) {
        if (gen !== state.gen) return;
        showEmpty('Cannot browse', explain(e), { icon: I.alert, retry: () => navTo('home') });
        return;
      }

      if (gen !== state.gen || state.mode !== 'home') return;

      const dirs = state.rootEntries.filter((e) => e.dir);
      const rootFiles = state.rootEntries.filter((e) => !e.dir);

      if (!dirs.length && !rootFiles.length) {
        showEmpty('Library is empty', 'The media directory has nothing in it yet. Add files on the host machine, or pick a different folder in the Host panel.', { icon: I.folder, host: true });
        return;
      }

      homeView.textContent = '';

      const intro = document.createElement('div');
      intro.className = 'libraryIntro';
      intro.innerHTML = '<div><h1>Your library. Your night.</h1><p>Everything you keep, ready to enjoy.</p></div><button class="btnGhost browseFiles">Browse files</button>';
      intro.querySelector('button').addEventListener('click', () => navTo('files'));
      homeView.appendChild(intro);
      if (dirs.length) {
        const folders = document.createElement('nav');
        folders.className = 'folderStrip';
        folders.setAttribute('aria-label', 'Library folders');
        for (const dir of dirs) {
          const button = document.createElement('button');
          button.innerHTML = I.folder;
          const label = document.createElement('span');
          label.textContent = dir.name;
          button.appendChild(label);
          button.addEventListener('click', () => navigate(dir.rel));
          folders.appendChild(button);
        }
        homeView.appendChild(folders);
      }

      // hero placeholder — adopted by paintHero() when a featured video exists
      const hero = document.createElement('section');
      hero.className = 'hero';
      hero.innerHTML = '<div class="heroPending">Choose a folder to explore your library.</div>';
      homeView.appendChild(hero);
      maybeFeature(rootFiles);

      const rowsWrap = document.createElement('div');
      homeView.appendChild(rowsWrap);

      // Videos row — aggregated across everything loaded (fills progressively)
      const videosRow = buildRow('Videos');
      rowsWrap.appendChild(videosRow.el);
      videosRow.fill([]);
      if (rootFiles.some((f) => f.cat === 'video')) refreshVideosRow();

      // Recent row — newest files by modification time
      const recentRow = buildRow('Recently added');
      rowsWrap.appendChild(recentRow.el);
      recentRow.fill([]);
      if (rootFiles.length) refreshRecentRow();

      // Photos / Music rows for root-level media
      if (rootFiles.some((f) => f.cat === 'image')) {
        const photoRow = buildRow('Photos');
        rowsWrap.appendChild(photoRow.el);
        photoRow.fill(rootFiles.filter((f) => f.cat === 'image'));
      }
      if (rootFiles.some((f) => f.cat === 'audio')) {
        const musicRow = buildRow('Music');
        rowsWrap.appendChild(musicRow.el);
        musicRow.fill(rootFiles.filter((f) => f.cat === 'audio'));
      }

      // one row per top-level folder, loaded lazily as it scrolls in
      let pending = dirs.length;
      const finishFolderCheck = () => {
        pending--;
        if (pending === 0) {
          refreshVideosRow(true);
          refreshRecentRow(true);
          maybeFeature(Array.from(libraryIndex.values()));
          if (!state.featured) {
            // no video anywhere in the library — the hero has nothing to show
            const h = homeView.querySelector('.hero');
            if (h) h.remove();
          }
        }
      };

      for (const [i, d] of dirs.entries()) {
        const row = buildRow(d.name);
        rowsWrap.appendChild(row.el);
        const folder = { rel: d.rel, name: d.name, entries: null, row };
        state.folders.push(folder);

        if (i < 3 || !('IntersectionObserver' in window)) {
          // first rows fill immediately — no skeleton flash just below the fold;
          // deeper rows load lazily as they scroll near the viewport
          loadFolderRow(folder, finishFolderCheck);
        } else {
          if (!rowObserver) {
            rowObserver = new IntersectionObserver((items) => {
              for (const it of items) {
                if (!it.isIntersecting) continue;
                const f = state.folders.find((x) => x.row.el === it.target);
                if (f && f.entries === null && !f.loading) {
                  f.loading = true;
                  rowObserver.unobserve(it.target);
                  loadFolderRow(f, finishFolderCheck);
                }
              }
            }, { rootMargin: '400px' });
          }
          rowObserver.observe(row.el);
        }
      }

      if (!dirs.length) {
        // nothing lazy pending; rows are final
        refreshVideosRow(true);
        refreshRecentRow(true);
        if (!state.featured) hero.remove();
      }
    })();
  }

  async function loadFolderRow(folder, onSettled) {
    const gen = state.gen;
    try {
      const data = await fetchBrowse(folder.rel);
      if (gen !== state.gen) return;
      folder.entries = data.entries;
      indexEntries(data.entries);
      folder.row.fill(folder.entries);
      if (!folder.entries.length) folder.row.el.remove();
       refreshVideosRow();
       refreshRecentRow();
      maybeFeature(folder.entries);
    } catch (_) {
      if (gen !== state.gen) return;
      folder.row.el.remove(); // a vanished or unreadable folder shouldn't break the page
    } finally {
      if (gen === state.gen && onSettled) onSettled();
    }
  }

  function refreshVideosRow(final) {
    const row = findRow('Videos');
    if (!row) return;
    const rootVids = state.rootEntries.filter((f) => !f.dir && f.cat === 'video');
    const folderVids = [];
    for (const f of state.folders) {
      if (f.entries) folderVids.push(...f.entries.filter((e) => !e.dir && e.cat === 'video'));
    }
    const list = [...rootVids, ...folderVids].slice(0, 24);
    if (list.length) row.fill(list);
    else if (final) row.el.remove();
  }

  function refreshRecentRow(final) {
    const row = findRow('Recently added');
    if (!row) return;
    const media = new Set(['video', 'image', 'audio']);
    const all = [
      ...state.rootEntries.filter((e) => !e.dir && media.has(e.cat)),
      ...state.folders.flatMap((f) => (f.entries || []).filter((e) => !e.dir && media.has(e.cat)))
    ];
    const list = all.sort((a, b) => (b.mtimeMs || 0) - (a.mtimeMs || 0)).slice(0, 18);
    if (list.length) row.fill(list);
    else if (final) row.el.remove();
  }

  function findRow(title) {
    const h2 = Array.from(homeView.querySelectorAll('.rowTitle')).find((h) => h.dataset.title === title);
    return h2 ? { el: h2.parentElement, fill: h2.parentElement.__fill } : null;
  }

  function maybeFeature(entries) {
    if (state.featured) return;
    const vids = entries.filter((e) => !e.dir && e.cat === 'video');
    if (!vids.length) return;
    const best = vids.sort((a, b) => (b.mtimeMs || 0) - (a.mtimeMs || 0))[0];
    state.featured = best;
    paintHero(best);
  }

  function paintHero(entry) {
    let el = homeView.querySelector('.hero');
    if (!el) {
      el = document.createElement('section');
      el.className = 'hero';
      homeView.prepend(el);
    }
    el.innerHTML =
      '<div class="heroEmblem" aria-hidden="true">' + I.film + '</div>' +
      '<div class="heroScrim"></div>' +
      '<div class="heroBody">' +
        '<h1 class="heroTitle"></h1>' +
        '<p class="heroMeta"></p>' +
        '<div class="heroActions">' +
          '<button class="btnPrimary btnLg heroPlay"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 5.5v13l10.5-6.5z" fill="currentColor"/></svg>Play</button>' +
          '<button class="btnGhost btnLg heroDetails">Details</button>' +
        '</div>' +
      '</div>';
    el.querySelector('.heroTitle').textContent = entry.name.replace(/\.[^.]+$/, '').replace(/[._]/g, ' ');
    el.querySelector('.heroMeta').textContent = fmtSize(entry.size) + (entry.mtimeMs ? ' · ' + fmtDate(entry.mtimeMs) : '');

    const ctx = contextEntries(entry.rel);
    const vids = videosOf(ctx);
    const idx = vids.findIndex((v) => v.rel === entry.rel);

    el.querySelector('.heroPlay').addEventListener('click', () => {
      Player.open({ rel: entry.rel, name: entry.name, audio: false, folderEntries: ctx }, vids, idx);
    });
    el.querySelector('.heroDetails').addEventListener('click', () => openDetail(entry));
  }

  function buildRow(title) {
    const el = document.createElement('section');
    el.className = 'row';
    el.setAttribute('aria-label', title);
    el.innerHTML =
      '<h2 class="rowTitle"></h2>' +
      '<div class="rowWrap">' +
        '<button class="rowArrow left" aria-label="Scroll back"><span class="rowArrowIcon">' + I.chevL + '</span></button>' +
        '<div class="rowScroll" tabindex="0"></div>' +
        '<button class="rowArrow right" aria-label="Scroll forward"><span class="rowArrowIcon">' + I.chevR + '</span></button>' +
      '</div>';
    el.querySelector('.rowTitle').textContent = title;
    el.querySelector('.rowTitle').dataset.title = title;
    const browse = document.createElement('button');
    browse.className = 'rowBrowse';
    browse.textContent = 'Browse all';
    browse.setAttribute('aria-label', 'Browse all ' + title);
    browse.addEventListener('click', () => {
      const folder = state.folders.find((item) => item.row.el === el);
      if (folder) navigate(folder.rel);
      else navTo(title === 'Videos' ? 'videos' : title === 'Photos' ? 'photos' : title === 'Music' ? 'music' : 'files');
    });
    el.querySelector('.rowTitle').appendChild(browse);
    const scroll = el.querySelector('.rowScroll');

    // skeleton cards until the fill lands
    for (let i = 0; i < 6; i++) {
      const s = document.createElement('div');
      s.className = 'skelCard';
      s.innerHTML = '<div class="skel skelThumb"></div><div class="skel skelLine1"></div><div class="skel skelLine2"></div>';
      scroll.appendChild(s);
    }

    const updateArrows = () => {
      const max = scroll.scrollWidth - scroll.clientWidth - 2;
      left.disabled = scroll.scrollLeft <= 2;
      right.disabled = scroll.scrollLeft >= max;
    };
    const left = el.querySelector('.rowArrow.left');
    const right = el.querySelector('.rowArrow.right');
    const rowMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
    left.addEventListener('click', () => scroll.scrollBy({ left: -scroll.clientWidth * 0.8, behavior: rowMotion() }));
    right.addEventListener('click', () => scroll.scrollBy({ left: scroll.clientWidth * 0.8, behavior: rowMotion() }));
    scroll.addEventListener('scroll', updateArrows, { passive: true });

    const fill = (entries) => {
      el.hidden = entries.length === 0;
      scroll.textContent = '';
      for (const e of entries.slice(0, 40)) scroll.appendChild(rowCard(e));
      requestAnimationFrame(updateArrows);
    };
    el.__fill = fill;
    return { el, fill };
  }

  function rowCard(e) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rowCard';
    btn.appendChild(buildThumb(e));
    const name = document.createElement('span');
    name.className = 'rname';
    name.textContent = e.name;
    const sub = document.createElement('span');
    sub.className = 'rsub';
    sub.textContent = e.cat === 'video' || e.cat === 'audio' ? fmtSize(e.size) : fmtDate(e.mtimeMs);
    btn.append(name, sub);
    btn.addEventListener('click', () => openEntry(e));
    return btn;
  }

  /* ---------- files: manager mode ---------- */

  function syncFilterChips() {
    for (const chip of filtersEl.querySelectorAll('.chip')) {
      const on = chip.dataset.filter === state.filter;
      chip.classList.toggle('active', on);
      chip.setAttribute('aria-pressed', String(on));
    }
  }

  function renderCrumbs(list) {
    crumbsEl.textContent = '';
    list.forEach((c, i) => {
      if (i > 0) {
        const sep = document.createElement('span');
        sep.className = 'sep';
        sep.textContent = '/';
        crumbsEl.appendChild(sep);
      }
      if (i < list.length - 1) {
        const a = document.createElement('a');
        a.href = '#';
        a.textContent = c.name || rootName;
        const target = c.rel;
        a.addEventListener('click', (ev) => { ev.preventDefault(); navigate(target); });
        crumbsEl.appendChild(a);
      } else {
        const here = document.createElement('span');
        here.className = 'here';
        here.textContent = c.name || rootName;
        crumbsEl.appendChild(here);
      }
    });
  }

  function renderFilesSkeleton() {
    container.className = 'grid';
    container.textContent = '';
    for (let i = 0; i < 10; i++) {
      const s = document.createElement('div');
      s.className = 'skelCard';
      s.innerHTML = '<div class="skel skelThumb"></div><div class="skel skelLine1"></div><div class="skel skelLine2"></div>';
      container.appendChild(s);
    }
  }

  function renderFilesError(e) {
    state.entries = [];
    container.textContent = '';
    const wrap = document.createElement('div');
    wrap.className = 'filesEmpty';
    wrap.innerHTML = I.alert + '<h3>Cannot browse</h3><p></p>';
    wrap.querySelector('p').textContent = explain(e);
    const retry = document.createElement('button');
    retry.className = 'btnGhost';
    retry.textContent = 'Try again';
    retry.addEventListener('click', () => loadBrowse(state.cwd));
    wrap.appendChild(retry);
    container.appendChild(wrap);
  }

  function renderFiles() {
    const list = state.entries.filter((e) => e.dir || state.filter === 'all' || e.cat === state.filter);
    container.className = state.view === 'list' ? 'list' : 'grid';
    container.textContent = '';

    if (!list.length) {
      const wrap = document.createElement('div');
      wrap.className = 'filesEmpty';
      if (state.searchQuery) {
        wrap.innerHTML = I.search + '<h3>No matches</h3><p>No file names contain “' + state.searchQuery.replace(/[<>&"]/g, '') + '”. Try a different word or another filter.</p>';
      } else {
        wrap.innerHTML = I.folder + '<h3>Empty folder</h3><p>This folder has no media in it yet.</p>';
      }
      container.appendChild(wrap);
      return;
    }

    const frag = document.createDocumentFragment();
    for (const e of list) {
      frag.appendChild(e.dir ? dirCard(e) : fileCard(e));
    }
    container.appendChild(frag);
  }

  function dirCard(e) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'card';
    btn.dataset.cat = 'dir';
    const thumb = document.createElement('span');
    thumb.className = 'thumb';
    thumb.innerHTML = I.folder;
    const meta = document.createElement('span');
    meta.className = 'meta';
    const name = document.createElement('span');
    name.className = 'tname';
    name.textContent = e.name;
    const sub = document.createElement('span');
    sub.className = 'tsub';
    sub.textContent = 'Folder';
    meta.append(name, sub);
    btn.append(thumb, meta);
    btn.addEventListener('click', () => navigate(e.rel));
    return btn;
  }

  function fileCard(e) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'card';
    btn.dataset.cat = e.cat;

    const thumb = buildThumb(e);
    if (e.cat === 'video' || e.cat === 'audio') {
      const badge = document.createElement('span');
      badge.className = 'thumbBadge';
      badge.textContent = fmtSize(e.size);
      thumb.appendChild(badge);
    }

    const meta = document.createElement('span');
    meta.className = 'meta';
    const name = document.createElement('span');
    name.className = 'tname';
    name.textContent = e.name;
    const sub = document.createElement('span');
    sub.className = 'tsub';
    sub.textContent = state.searchQuery ? fmtSize(e.size) : [fmtSize(e.size), fmtDate(e.mtimeMs)].filter(Boolean).join(' · ');
    meta.append(name, sub);

    btn.append(thumb, meta);

    if (state.view === 'list') {
      if (state.searchQuery) {
        const path = document.createElement('span');
        path.className = 'rpath';
        path.textContent = e.rel;
        meta.appendChild(path);
      }
      const date = document.createElement('span');
      date.className = 'tdate';
      date.textContent = fmtDate(e.mtimeMs);
      btn.appendChild(date);
    }

    btn.addEventListener('click', () => openEntry(e));
    return btn;
  }

  /* ---------- opening entries ---------- */

  function openEntry(e) {
    // Home shelves contain folders too; never send them to the download API.
    if (e.dir) { navigate(e.rel); return; }
    switch (e.cat) {
      case 'video':
        openDetail(e);
        break;
      case 'audio':
        Player.open({ rel: e.rel, name: e.name, audio: true, folderEntries: contextEntries(e.rel) });
        break;
      case 'image':
        openLightbox(e);
        break;
      case 'doc':
        if (/\.(pdf|txt|md|html?)$/i.test(e.name)) {
          window.open(streamURL(e.rel), '_blank');
        } else {
          window.location.href = downloadURL(e.rel);
        }
        break;
      case 'subtitle':
        window.location.href = downloadURL(e.rel);
        break;
      default:
        window.location.href = downloadURL(e.rel);
    }
  }

  /* ---------- detail sheet (OTT title page) ---------- */

  function isolateLibrary(active) {
    for (const id of ['topbar', 'main', 'emptyState']) $(id).inert = active;
  }

  function openDetail(entry) {
    sheetEntry = entry;
    sheetReturnFocus = document.activeElement;

    sheetTitle.textContent = entry.name;
    sheetMeta.textContent = '';
    sheetMeta.appendChild(metaChip(fmtSize(entry.size)));
    sheetImg.hidden = false;
    sheetImg.alt = entry.name;
    
    // Attempt high-res online poster for the detail sheet hero banner
    const pTest = new Image();
    pTest.onload = () => { if (sheetEntry === entry) sheetImg.src = pTest.src; };
    pTest.onerror = () => { if (sheetEntry === entry) sheetImg.src = thumbURL(entry.rel, entry.mtimeMs); };
    sheetImg.removeAttribute('src');
    sheetImg.onerror = () => { sheetImg.hidden = true; };
    pTest.src = posterURL(entry.name);

    sheet.hidden = false;
    isolateLibrary(true);
    requestAnimationFrame(() => sheet.classList.add('open'));
    document.body.style.overflow = 'hidden';
    sheetPlay.focus();

    // metadata chips: container · codec · resolution · duration
    const gen = Symbol();
    openDetail._gen = gen;
    fetch('/api/meta?path=' + enc(entry.rel)).then((r) => r.ok ? r.json() : null).then((meta) => {
      if (openDetail._gen !== gen || !meta || !meta.available || sheetEntry !== entry) return;
      const chips = [];
      if (meta.container) chips.push(String(meta.container).split(',')[0].toUpperCase());
      if (meta.video && meta.video.codec) chips.push(String(meta.video.codec).toUpperCase());
      if (meta.video && meta.video.width && meta.video.height) chips.push(meta.video.width + '×' + meta.video.height);
      if (meta.duration) chips.push(fmtDur(meta.duration));
      const sourceFormats = new Set(meta.sourceFormats || []);
      if (meta.video && meta.video.dolbyVision) sourceFormats.add('Dolby Vision');
      const dolbyNames = { ac3: 'Dolby Digital', eac3: 'Dolby Digital Plus', truehd: 'Dolby TrueHD' };
      for (const stream of meta.audioStreams || []) {
        if (dolbyNames[stream.codec]) sourceFormats.add(dolbyNames[stream.codec]);
      }
      for (const format of sourceFormats) chips.push('Source: ' + format);
      sheetMeta.textContent = '';
      if (meta.audioStreams && meta.audioStreams.length > 1) chips.push(meta.audioStreams.length + ' audio tracks');
      for (const c of chips) sheetMeta.appendChild(metaChip(c));
      sheetMeta.appendChild(metaChip(fmtSize(entry.size)));
      if (sourceFormats.size) {
        const note = metaChip('Source formats; browser playback may convert audio or video.');
        sheetMeta.appendChild(note);
      }
    }).catch(() => { /* size chip is already there */ });
  }

  function metaChip(text) {
    const s = document.createElement('span');
    s.className = 'mchip';
    s.textContent = text;
    return s;
  }

  function closeSheet() {
    if (sheet.hidden) return;
    sheet.classList.remove('open');
    sheet.hidden = true;
    isolateLibrary(false);
    document.body.style.overflow = '';
    sheetEntry = null;
    if (sheetReturnFocus && document.contains(sheetReturnFocus)) {
      try { sheetReturnFocus.focus({ preventScroll: true }); } catch (_) { /* ignore */ }
    }
    sheetReturnFocus = null;
  }

  sheetPlay.addEventListener('click', () => {
    const entry = sheetEntry;
    if (!entry) return;
    const ctx = contextEntries(entry.rel);
    const vids = videosOf(ctx);
    const idx = vids.findIndex((v) => v.rel === entry.rel);
    closeSheet();
    Player.open({ rel: entry.rel, name: entry.name, audio: false, folderEntries: ctx }, vids, idx);
  });

  sheetFolder.addEventListener('click', () => {
    const entry = sheetEntry;
    if (!entry) return;
    closeSheet();
    if (state.mode !== 'files') {
      exitSearchUI();
      setActiveNav('files');
      state.mode = 'files';
      homeView.hidden = true;
      filesView.hidden = false;
    }
    navigate(dirname(entry.rel));
  });

  sheetClose.addEventListener('click', closeSheet);
  sheet.querySelector('[data-close-sheet]').addEventListener('click', closeSheet);

  // basic focus trap while the sheet is open
  sheet.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Tab') return;
    const focusables = Array.from(
      sheetCard.querySelectorAll('button, a[href], input, [tabindex]:not([tabindex="-1"])')
    ).filter((el) => !el.hidden && el.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (ev.shiftKey && document.activeElement === first) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && document.activeElement === last) {
      ev.preventDefault();
      first.focus();
    }
  });

  /* ---------- lightbox ---------- */

  let lightboxReturnFocus = null;

  function openLightbox(entry) {
    lightboxReturnFocus = document.activeElement;
    lightboxImg.alt = entry.name;
    lightboxImg.src = streamURL(entry.rel);
    lightbox.hidden = false;
    isolateLibrary(true);
    document.body.style.overflow = 'hidden';
    $('lightboxClose').focus();
  }

  function closeLightbox() {
    lightbox.hidden = true;
    isolateLibrary(false);
    lightboxImg.src = '';
    document.body.style.overflow = '';
    if (lightboxReturnFocus && lightboxReturnFocus.isConnected) lightboxReturnFocus.focus({ preventScroll: true });
    lightboxReturnFocus = null;
  }

  lightbox.addEventListener('keydown', (ev) => {
    if (ev.key === 'Tab') { ev.preventDefault(); $('lightboxClose').focus(); }
  });

  $('lightboxClose').addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', (ev) => {
    if (ev.target === lightbox) closeLightbox();
  });

  /* ---------- search ---------- */

  let searchTimer = null;

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim();
    searchClear.hidden = !q;
    clearTimeout(searchTimer);
    if (!q) {
      ++state.gen;
      state.searchQuery = '';
      state.results = [];
      if (state.mode === 'files') loadBrowse(state.cwd);
      return;
    }
    searchTimer = setTimeout(() => doSearch(q), 300);
  });

  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchClear.hidden = true;
    clearTimeout(searchTimer);
    ++state.gen;
    state.searchQuery = '';
    state.results = [];
    if (state.mode === 'files') loadBrowse(state.cwd);
    searchInput.focus();
  });

  async function doSearch(q) {
    const gen = ++state.gen;
    state.searchQuery = q;
    state.mode = 'files';
    hideEmpty();
    closeSheet();
    homeView.hidden = true;
    filesView.hidden = false;
    setActiveNav('files');
    renderCrumbs([{ name: 'Search results', rel: null }]);
    state.loadingFiles = true;
    renderFilesSkeleton();
    showPill('Searching…');
    try {
      const res = await fetch('/api/search?q=' + enc(q));
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (gen !== state.gen) return;
      state.results = data.results.map((r) => ({ ...r, dir: false }));
      state.entries = state.results;
      indexEntries(state.results);
      state.loadingFiles = false;
      hidePill();
      renderFiles();
    } catch (_) {
      if (gen !== state.gen) return;
      state.loadingFiles = false;
      hidePill();
      renderFilesError(new Error('The search request failed. Check the host machine and try again.'));
    }
  }

  /* ---------- filters + view toggle ---------- */

  filtersEl.addEventListener('click', (ev) => {
    const chip = ev.target.closest('.chip');
    if (!chip) return;
    state.filter = chip.dataset.filter;
    syncFilterChips();
    if (!state.loadingFiles) renderFiles();
  });

  function paintViewToggle() {
    viewToggle.innerHTML = state.view === 'grid' ? I.list : I.grid;
    viewToggle.setAttribute('aria-label', state.view === 'grid' ? 'Switch to list view' : 'Switch to grid view');
  }
  paintViewToggle();

  viewToggle.addEventListener('click', () => {
    state.view = state.view === 'grid' ? 'list' : 'grid';
    localStorage.setItem('ff.view', state.view);
    paintViewToggle();
    if (!state.loadingFiles) renderFiles();
  });

  /* ---------- nav wiring ---------- */

  mainNav.addEventListener('click', (ev) => {
    const a = ev.target.closest('[data-nav]');
    if (!a) return;
    ev.preventDefault();
    navTo(a.dataset.nav);
  });
  topbar.querySelector('.brand').addEventListener('click', (ev) => {
    ev.preventDefault();
    navTo('home');
  });

  /* ---------- global keyboard & TV navigation ---------- */

  function getFocusableGrid() {
    const selector = [
      '.navlink',
      '#searchInput',
      '.heroPlay',
      '.heroDetails',
      '.rowCard',
      '#container .card',
      '.chip',
      '#viewGrid',
      '#viewList',
      '.sheetAction',
      '#sheetClose'
    ].join(',');
    const nodes = Array.from(document.querySelectorAll(selector));
    return nodes.filter((el) => {
      if (el.disabled || el.hidden) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).visibility !== 'hidden';
    });
  }

  function handleSpatialNav(direction) {
    const current = document.activeElement;
    const candidates = getFocusableGrid();
    if (!candidates.length) return false;

    if (!current || !candidates.includes(current)) {
      candidates[0].focus();
      return true;
    }

    const curRect = current.getBoundingClientRect();
    const curCenter = { x: curRect.left + curRect.width / 2, y: curRect.top + curRect.height / 2 };

    let bestCandidate = null;
    let minDistance = Infinity;

    for (const c of candidates) {
      if (c === current) continue;
      const r = c.getBoundingClientRect();
      const center = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      const dx = center.x - curCenter.x;
      const dy = center.y - curCenter.y;

      let valid = false;
      let primaryDiff = 0;
      let secondaryDiff = 0;

      if (direction === 'ArrowUp' && dy < -10) {
        valid = true;
        primaryDiff = Math.abs(dy);
        secondaryDiff = Math.abs(dx);
      } else if (direction === 'ArrowDown' && dy > 10) {
        valid = true;
        primaryDiff = Math.abs(dy);
        secondaryDiff = Math.abs(dx);
      } else if (direction === 'ArrowLeft' && dx < -10) {
        valid = true;
        primaryDiff = Math.abs(dx);
        secondaryDiff = Math.abs(dy);
      } else if (direction === 'ArrowRight' && dx > 10) {
        valid = true;
        primaryDiff = Math.abs(dx);
        secondaryDiff = Math.abs(dy);
      }

      if (valid) {
        // Weight aligned axis much heavier for natural TV grid stepping
        const score = primaryDiff + secondaryDiff * 2.5;
        if (score < minDistance) {
          minDistance = score;
          bestCandidate = c;
        }
      }
    }

    if (bestCandidate) {
      bestCandidate.focus();
      bestCandidate.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      return true;
    }
    return false;
  }

  document.addEventListener('keydown', (ev) => {
    if (window.Player && window.Player.isOpen()) return; // player owns the keys

    // TV / D-pad spatial navigation
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(ev.key)) {
      if (document.activeElement === searchInput && (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight')) {
        return; // Allow cursor movement inside search input
      }
      if (handleSpatialNav(ev.key)) {
        ev.preventDefault();
        return;
      }
    }

    if (ev.key === 'Escape' || ev.key === 'Backspace' || ev.key === 'BrowserBack') {
      if (!sheet.hidden) {
        if (ev.key !== 'Backspace' || document.activeElement !== searchInput) {
          closeSheet();
          ev.preventDefault();
          return;
        }
      }
      if (!lightbox.hidden) {
        if (ev.key !== 'Backspace' || document.activeElement !== searchInput) {
          closeLightbox();
          ev.preventDefault();
          return;
        }
      }
      if (ev.key === 'Escape') {
        if (document.activeElement === searchInput && searchInput.value) {
          searchInput.value = '';
          searchClear.hidden = true;
          clearTimeout(searchTimer);
          ++state.gen;
          state.searchQuery = '';
          state.results = [];
          if (state.mode === 'files') loadBrowse(state.cwd);
          return;
        }
        if (state.mode === 'files' && state.cwd && !state.searchQuery) {
          navigate(dirname(state.cwd));
          return;
        }
      }
    }
    if (ev.key === '/' && document.activeElement !== searchInput &&
        sheet.hidden && lightbox.hidden) {
      ev.preventDefault();
      searchInput.focus();
    }
  });

  /* ---------- boot ---------- */

  (async function boot() {
    try {
      const res = await fetch('/api/config');
      const cfg = await res.json();
      rootName = cfg.rootName || 'Library';
      if (cfg.hasMedia) {
        navTo('home');
      } else {
        showEmpty('FileFlix is not set up yet',
          'No media directory is configured. Open the Host panel to pick a folder.',
          { icon: I.folder, host: true });
      }
    } catch (_) {
      showEmpty('Cannot reach FileFlix',
        'Check that the host machine is still on the network, then try again.',
        { icon: I.alert, retry: () => window.location.reload() });
    }
  })();
})();
