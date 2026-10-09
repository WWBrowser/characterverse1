// WWB's interface — the /workspace tab system, as a browser's chrome.
//
// This page runs in its own webview at wwb://ui/. It has no authority of its
// own: everything it does is a command to the engine over wwb://ui/ipc/…,
// carrying this launch's token, and everything it shows is the state the
// engine pushes into window.wwb.render(). Nothing a web page sends ever
// reaches this document, and every string from a page (a title, a URL, a
// search result) is put on screen with textContent — never as markup.
'use strict';

(() => {
  const TOKEN = document.querySelector('meta[name="wwb-token"]').content;
  const CV = document.querySelector('meta[name="wwb-cv"]').content.replace(/\/$/, '');
  const $ = (id) => document.getElementById(id);

  let state = { tabs: [], active: 0, httpsOnly: true, bookmarked: false, secure: true, overlay: false, bookmarks: [] };
  let editing = false;      // the user is typing in the address bar
  let noticeTimer = 0;
  let suggestTimer = 0;
  let suggestSeq = 0;
  let rows = [];            // the suggestion rows on screen
  let selected = -1;
  let historyRows = [];

  /* ------------------------------------------------------------ the bridge */

  function ipc(command, params = {}) {
    const q = new URLSearchParams({ k: TOKEN, ...params });
    // no-cors: wwb:// responses are unreadable by design (protocol.rs); the
    // engine answers by pushing state, not by replying.
    fetch(`wwb://ui/ipc/${command}?${q}`, { mode: 'no-cors', cache: 'no-store' }).catch(() => {});
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  const activeTab = () => state.tabs.find((t) => t.id === state.active);

  /* -------------------------------------------------------------- overlays */

  const OVERLAYS = ['suggestions', 'index', 'lock-panel', 'menu-panel'];
  function openOverlay(id) {
    OVERLAYS.forEach((o) => { $(o).hidden = o !== id; });
    $('open-index').setAttribute('aria-pressed', String(id === 'index'));
    ipc('overlay', { open: '1' });
  }
  function closeOverlays(returnFocusToPage) {
    const wasOpen = OVERLAYS.some((o) => !$(o).hidden);
    OVERLAYS.forEach((o) => { $(o).hidden = true; });
    $('open-index').setAttribute('aria-pressed', 'false');
    if (wasOpen) ipc('overlay', { open: '0' });
    if (returnFocusToPage) ipc('focus-content');
  }
  // A click on an overlay's own backdrop (not its content) closes it.
  OVERLAYS.forEach((o) => $(o).addEventListener('mousedown', (e) => { if (e.target === $(o) && !$(o).classList.contains('panel')) closeOverlays(true); }));

  /* ---------------------------------------------------------------- render */

  const KIND_GLYPH = { character: '◉', search: '⌕', newtab: '⌕', characterverse: 'C', web: '◌' };

  function renderTabs() {
    const list = $('tab-list');
    list.replaceChildren();
    for (const t of state.tabs) {
      const tab = el('div', 'tab');
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(t.id === state.active));
      tab.title = t.url ? `${t.title}\n${t.url}` : t.title;
      if (t.loading) tab.dataset.loading = '';
      if (t.crashed) tab.dataset.crashed = '';
      const kind = el('span', 'kind', KIND_GLYPH[t.kind] || '◌');
      kind.dataset.kind = t.kind;
      tab.append(kind, el('span', 'title', t.kind === 'newtab' ? 'CharacterVerse Search' : t.title || t.host || 'New tab'));
      const close = el('button', 'close', '×');
      close.setAttribute('aria-label', `Close ${t.title}`);
      close.addEventListener('click', (e) => { e.stopPropagation(); ipc('close-tab', { tab: t.id }); });
      tab.append(close);
      tab.addEventListener('mousedown', (e) => {
        if (close.contains(e.target)) return; // the × closes; it does not also select
        if (e.button === 1) { ipc('close-tab', { tab: t.id }); return; }
        if (e.button === 0) beginDrag(t.id, e);
      });
      list.append(tab);
    }
    $('tab-count').textContent = String(state.tabs.length);
  }

  function renderToolbar() {
    const t = activeTab();
    $('back').disabled = !t || !t.canBack;
    $('forward').disabled = !t || !t.canForward;
    if (!editing) $('address').value = t ? t.url : '';
    const lock = $('lock');
    if (!t || t.kind === 'newtab') { lock.dataset.state = 'internal'; lock.textContent = 'WWB'; }
    else if (state.secure) { lock.dataset.state = 'secure'; lock.textContent = '🔒'; }
    else { lock.dataset.state = 'insecure'; lock.textContent = 'Not secure'; }
    $('bookmark').setAttribute('aria-pressed', String(state.bookmarked));
    $('bookmark').textContent = state.bookmarked ? '★' : '☆';
  }

  function notice(text) {
    const n = $('notice');
    n.textContent = text;
    n.title = text;
    n.hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { n.hidden = true; }, 6500);
  }

  window.wwb = {
    render(next, token) {
      if (token !== TOKEN) return;
      state = next;
      renderTabs();
      renderToolbar();
      if (next.notice) notice(next.notice);
      if (!$('index').hidden) renderIndex();
    },
    focusAddress() {
      const a = $('address');
      a.focus();
      a.select();
    },
    historySuggestions(list, input, token) {
      if (token !== TOKEN || input !== $('address').value.trim()) return;
      historyRows = list;
      renderSuggestions(lastResults);
    },
  };

  /* ------------------------------------------------------ the address bar */

  const address = $('address');
  let lastResults = [];

  const looksLikeAddress = (s) => /^[a-z][a-z0-9+.-]*:\/\//i.test(s) || (/^[^\s/]+\.[^\s/]+/.test(s) && !/\s/.test(s)) || /^localhost(:\d+)?/.test(s);

  address.addEventListener('focus', () => { editing = true; address.select(); });
  address.addEventListener('blur', () => { editing = false; setTimeout(renderToolbar, 0); });
  address.addEventListener('input', () => {
    const q = address.value.trim();
    clearTimeout(suggestTimer);
    if (!q) { closeOverlays(false); return; }
    historyRows = [];
    renderSuggestions([]);
    if ($('suggestions').hidden) openOverlay('suggestions');
    // CharacterVerse Search is the address bar's search engine. Its reads are
    // CORS-open (api.search.ts); `source=wwb` lets the index count WWB demand.
    suggestTimer = setTimeout(async () => {
      // Local history, answered by the engine from SQLite — debounced with
      // the search so typing a word is one question, not one per letter.
      ipc('suggest', { input: q });
      const seq = ++suggestSeq;
      try {
        const r = await fetch(`${CV}/api/search?q=${encodeURIComponent(q)}&source=wwb`, { credentials: 'omit' });
        const d = r.ok ? await r.json() : null;
        if (seq !== suggestSeq) return;
        lastResults = Array.isArray(d?.results) ? d.results.slice(0, 6) : [];
      } catch { lastResults = []; }
      renderSuggestions(lastResults);
    }, 160);
  });

  function renderSuggestions(results) {
    const q = address.value.trim();
    const box = $('suggestions');
    box.replaceChildren();
    rows = [];
    const add = (glyph, title, sub, badge, go) => {
      const row = el('button', 'row');
      row.setAttribute('role', 'option');
      row.append(el('span', 'glyph', glyph));
      const main = el('span', 'main');
      main.append(el('span', 't', title));
      if (sub) main.append(el('span', 's', sub));
      row.append(main);
      if (badge) row.append(el('span', 'badge', badge));
      row.addEventListener('mousedown', (e) => { e.preventDefault(); go(); });
      box.append(row);
      rows.push({ row, go });
    };
    if (looksLikeAddress(q)) add('↗', q, 'Go to this address', '', () => go(q));
    add('⌕', `Search CharacterVerse for “${q}”`, 'Characters, your chats, and AI systems hosted elsewhere', 'CharacterVerse Search', () => go(q));
    if (historyRows.length) {
      box.append(el('h3', '', 'From your history'));
      for (const h of historyRows) add('◷', h.title || h.url, h.url, '', () => go(h.url));
    }
    if (results.length) {
      box.append(el('h3', '', 'CharacterVerse Search'));
      for (const hit of results) {
        let url;
        try { url = new URL(hit.url, CV).href; } catch { continue; }
        add(hit.kind === 'character' ? '◉' : hit.kind === 'thread' ? '✉' : '◌', hit.title, hit.subtitle || hit.snippet || hit.host, hit.kind, () => go(url));
      }
    }
    selected = 0;
    paintSelection();
  }

  function paintSelection() {
    rows.forEach((r, i) => r.row.setAttribute('aria-selected', String(i === selected)));
  }

  function go(input) {
    editing = false;
    address.blur();
    closeOverlays(false);
    ipc('navigate', { tab: state.active, input });
  }

  address.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && rows.length) { e.preventDefault(); selected = (selected + 1) % rows.length; paintSelection(); }
    else if (e.key === 'ArrowUp' && rows.length) { e.preventDefault(); selected = (selected - 1 + rows.length) % rows.length; paintSelection(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const q = address.value.trim();
      if (!q) return;
      if (!$('suggestions').hidden && rows[selected]) rows[selected].go();
      else go(q);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // the document-level Escape handler must not run it twice
      editing = false;
      renderToolbar();
      address.blur();
      closeOverlays(true);
    }
  });

  /* ------------------------------------------------------------- the index */

  // /workspace's TabIndex: every open tab, grouped by what it is, plus bookmarks.
  function renderIndex() {
    const box = $('index');
    box.replaceChildren();
    const groups = new Map();
    const label = (t) => (t.kind === 'character' ? 'Characters' : t.kind === 'search' || t.kind === 'newtab' ? 'CharacterVerse Search' : t.kind === 'characterverse' ? 'CharacterVerse' : t.host || 'Other');
    for (const t of state.tabs) {
      const g = label(t);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(t);
    }
    for (const [g, tabs] of groups) {
      box.append(el('h3', '', `${g} · ${tabs.length}`));
      for (const t of tabs) {
        const row = el('button', 'row');
        if (t.id === state.active) row.setAttribute('aria-selected', 'true');
        row.append(el('span', 'glyph', KIND_GLYPH[t.kind] || '◌'));
        const main = el('span', 'main');
        main.append(el('span', 't', t.kind === 'newtab' ? 'CharacterVerse Search' : t.title), el('span', 's', t.url));
        row.append(main);
        const x = el('span', 'badge', 'Close');
        x.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); ipc('close-tab', { tab: t.id }); });
        row.append(x);
        row.addEventListener('mousedown', (e) => { if (e.target === x) return; e.preventDefault(); closeOverlays(true); ipc('focus-tab', { tab: t.id }); });
        box.append(row);
      }
    }
    if (state.bookmarks.length) {
      box.append(el('h3', '', `Bookmarks · ${state.bookmarks.length}`));
      for (const b of state.bookmarks) {
        const row = el('button', 'row');
        row.append(el('span', 'glyph', '★'));
        const main = el('span', 'main');
        main.append(el('span', 't', b.title || b.url), el('span', 's', b.url));
        row.append(main);
        row.addEventListener('mousedown', (e) => { e.preventDefault(); closeOverlays(true); ipc('new-tab', { input: b.url }); });
        box.append(row);
      }
    }
  }

  /* --------------------------------------------------------- the panels */

  function renderLockPanel() {
    const t = activeTab();
    const p = $('lock-panel');
    p.replaceChildren();
    p.append(el('h3', '', 'Connection'));
    if (!t || t.kind === 'newtab') p.append(el('p', '', 'This is a WWB page. It never touches the network.'));
    else if (state.secure) p.append(el('p', '', `The connection to ${t.host} is encrypted (HTTPS).`));
    else {
      p.append(el('p', 'danger', `The connection to ${t.host} is not encrypted. Anyone on the network can read and change this page.`));
    }
    const sw = el('label', 'switch');
    const box = el('input');
    box.type = 'checkbox';
    box.checked = state.httpsOnly;
    box.addEventListener('change', () => ipc('https-only', { on: box.checked ? '1' : '0' }));
    sw.append(el('span', '', 'HTTPS-only — upgrade every plain-http page'), box);
    p.append(sw);
    if (state.httpsOnly && t && t.host && t.kind === 'web') {
      const allow = el('button', 'row', `Allow plain http for ${t.host}`);
      allow.addEventListener('click', () => { closeOverlays(true); ipc('allow-http', { host: t.host }); });
      p.append(allow);
    }
  }

  function renderMenu() {
    const p = $('menu-panel');
    p.replaceChildren();
    p.append(el('h3', '', 'WWB — Web World Browser'));
    p.append(el('p', '', 'Built on the Servo engine — not Chromium. Search is CharacterVerse Search.'));
    const item = (text, fn, cls) => { const b = el('button', `row ${cls || ''}`, text); b.addEventListener('click', fn); p.append(b); };
    item('New tab', () => { closeOverlays(false); ipc('new-tab'); });
    item('CharacterVerse Search', () => { closeOverlays(false); ipc('new-tab', { input: `${CV}/search` }); });
    item('About WWB and its security model', () => { closeOverlays(false); ipc('new-tab', { input: `${CV}/wwb` }); });
    let armed = false;
    item('Clear history, cookies and site data…', (e) => {
      if (!armed) { armed = true; e.currentTarget.textContent = 'Click again to clear everything except bookmarks'; return; }
      closeOverlays(true);
      ipc('clear-data');
    }, 'danger');
  }

  /* ------------------------------------------------------------ dragging */

  // Reorder by dragging a tab along the strip. Pointer-based rather than
  // HTML5 drag-and-drop, so it does not depend on the engine's DnD support.
  function beginDrag(id, down) {
    const startX = down.clientX;
    let moved = false;
    const move = (e) => { if (Math.abs(e.clientX - startX) > 6) moved = true; };
    const up = (e) => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      if (!moved) { ipc('focus-tab', { tab: id }); return; }
      const tabs = [...$('tab-list').children];
      let to = tabs.findIndex((t) => { const r = t.getBoundingClientRect(); return e.clientX < r.left + r.width / 2; });
      if (to < 0) to = tabs.length;
      const from = state.tabs.findIndex((t) => t.id === id);
      if (to > from) to -= 1;
      if (to !== from) ipc('move-tab', { tab: id, to });
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  /* --------------------------------------------------------------- wiring */

  $('new-tab').addEventListener('click', () => { ipc('new-tab'); setTimeout(window.wwb.focusAddress, 60); });
  $('back').addEventListener('click', () => ipc('back'));
  $('forward').addEventListener('click', () => ipc('forward'));
  $('reload').addEventListener('click', () => ipc('reload'));
  $('bookmark').addEventListener('click', () => ipc('bookmark'));
  $('open-search').addEventListener('click', () => ipc('new-tab', { input: `${CV}/search` }));
  $('open-index').addEventListener('click', () => { if ($('index').hidden) { renderIndex(); openOverlay('index'); } else closeOverlays(true); });
  $('lock').addEventListener('click', () => { if ($('lock-panel').hidden) { renderLockPanel(); openOverlay('lock-panel'); } else closeOverlays(true); });
  $('menu').addEventListener('click', () => { if ($('menu-panel').hidden) { renderMenu(); openOverlay('menu-panel'); } else closeOverlays(true); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.activeElement !== address) closeOverlays(true); });
  // While a panel is open this webview owns the whole window, so a click
  // anywhere outside the panel (and outside the button that opened it) is a
  // click on the page underneath — it closes the panel.
  document.addEventListener('mousedown', (e) => {
    for (const [panel, trigger] of [['lock-panel', 'lock'], ['menu-panel', 'menu']]) {
      if (!$(panel).hidden && !$(panel).contains(e.target) && !$(trigger).contains(e.target)) closeOverlays(true);
    }
  });

  ipc('ready');
})();
