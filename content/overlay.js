/**
 * Lapisan UI: highlight, tooltip, panel editor, dan toast.
 *
 * Semua UI hidup di dalam satu Shadow Root supaya CSS halaman tidak bisa
 * merusak tampilan panel, dan sebaliknya CSS extension tidak bocor ke halaman.
 *
 * Soal CSS vs CSP halaman: stylesheet dipasang lewat `adoptedStyleSheets`
 * (constructable stylesheet), bukan `<style>` inline. Constructable
 * stylesheet tidak melewati pemeriksaan `style-src` halaman, sehingga panel
 * tetap tampil benar di situs ber-CSP ketat. Bila API itu tidak tersedia,
 * ada fallback ke elemen `<style>`.
 *
 * File ini classic script; berbagi scope isolated world dengan core.js.
 */
(function () {
  'use strict';

  const NS = (globalThis.__PSM__ = globalThis.__PSM__ || {});
  if (NS.overlay) return;
  const core = NS.core;
  if (!core) return;

  const Z = 2147483600;
  const PANEL_ID = 'psm-panel';
  const HL_ID = 'psm-highlight';
  const TIP_ID = 'psm-tooltip';
  const TOAST_ID = 'psm-toast';

  const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.psm-root {
  --psm-accent: #3b82f6;
  --psm-bg: #ffffff;
  --psm-bg-soft: #f6f7f9;
  --psm-bg-input: #ffffff;
  --psm-fg: #16181d;
  --psm-fg-soft: #6b7280;
  --psm-border: #e3e6ea;
  --psm-danger: #dc2626;
  --psm-ok: #16a34a;
  font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  color: var(--psm-fg);
}
@media (prefers-color-scheme: dark) {
  .psm-root {
    --psm-bg: #1b1d21;
    --psm-bg-soft: #24272c;
    --psm-bg-input: #14161a;
    --psm-fg: #e8eaed;
    --psm-fg-soft: #9aa0a6;
    --psm-border: #34383e;
    --psm-danger: #f87171;
    --psm-ok: #4ade80;
  }
}

/* ---------- Highlight ---------- */
.psm-highlight {
  position: fixed; pointer-events: none; z-index: ${Z};
  border: 2px solid var(--psm-accent, #3b82f6);
  background: rgba(59,130,246,.14);
  border-radius: 2px; transition: none; display: none;
}
.psm-highlight.psm-on { display: block; }
.psm-highlight.psm-selected {
  background: rgba(59,130,246,.07);
  border-style: solid;
}

/* ---------- Tooltip ---------- */
.psm-tooltip {
  position: fixed; pointer-events: none; z-index: ${Z + 1};
  background: #16181d; color: #fff; padding: 4px 8px; border-radius: 5px;
  font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  max-width: 460px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  box-shadow: 0 3px 10px rgba(0,0,0,.3); display: none;
}
.psm-tooltip.psm-on { display: block; }
.psm-tooltip b { color: #93c5fd; font-weight: 600; }

/* ---------- Panel ---------- */
.psm-panel {
  position: fixed; z-index: ${Z + 2}; width: 360px;
  max-height: min(78vh, 720px); display: none; flex-direction: column;
  background: var(--psm-bg); border: 1px solid var(--psm-border);
  border-radius: 10px; box-shadow: 0 10px 34px rgba(0,0,0,.22);
  overflow: hidden;
}
.psm-panel.psm-on { display: flex; }
.psm-head {
  display: flex; align-items: center; gap: 8px; padding: 9px 10px;
  background: var(--psm-bg-soft); border-bottom: 1px solid var(--psm-border);
  cursor: grab; user-select: none;
}
.psm-head.psm-dragging { cursor: grabbing; }
.psm-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--psm-accent); flex: none; }
.psm-titles { flex: 1; min-width: 0; }
.psm-title { font-weight: 600; font-size: 12.5px; }
.psm-sub {
  font: 11px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: var(--psm-fg-soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.psm-iconbtn {
  border: 0; background: transparent; color: var(--psm-fg-soft); cursor: pointer;
  font-size: 17px; line-height: 1; padding: 3px 6px; border-radius: 5px; flex: none;
}
.psm-iconbtn:hover { background: var(--psm-border); color: var(--psm-fg); }

.psm-tabs { display: flex; gap: 2px; padding: 7px 8px 0; border-bottom: 1px solid var(--psm-border); }
.psm-tab {
  flex: 1; border: 0; background: transparent; color: var(--psm-fg-soft);
  padding: 6px 4px; font: inherit; font-size: 12px; cursor: pointer;
  border-radius: 6px 6px 0 0; border-bottom: 2px solid transparent;
}
.psm-tab:hover { color: var(--psm-fg); background: var(--psm-bg-soft); }
.psm-tab.psm-active { color: var(--psm-accent); border-bottom-color: var(--psm-accent); font-weight: 600; }
.psm-tab .psm-badge {
  display: inline-block; min-width: 16px; padding: 0 4px; margin-left: 4px;
  background: var(--psm-accent); color: #fff; border-radius: 8px; font-size: 10px;
}

.psm-body { padding: 10px; overflow-y: auto; flex: 1; min-height: 90px; }
.psm-pane { display: none; }
.psm-pane.psm-active { display: block; }
.psm-empty { color: var(--psm-fg-soft); font-size: 12px; text-align: center; padding: 18px 8px; }

.psm-label {
  display: block; font-size: 11px; font-weight: 600; color: var(--psm-fg-soft);
  margin: 0 0 4px; text-transform: uppercase; letter-spacing: .03em;
}
.psm-label:not(:first-child) { margin-top: 10px; }
.psm-input, .psm-textarea, .psm-select {
  width: 100%; padding: 6px 8px; border: 1px solid var(--psm-border);
  border-radius: 6px; background: var(--psm-bg-input); color: var(--psm-fg);
  font: inherit; font-size: 12.5px;
}
.psm-textarea {
  min-height: 84px; resize: vertical;
  font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.psm-input:focus, .psm-textarea:focus, .psm-select:focus {
  outline: 2px solid var(--psm-accent); outline-offset: -1px; border-color: transparent;
}
.psm-hint { font-size: 11px; color: var(--psm-fg-soft); margin-top: 5px; }

.psm-row { display: flex; gap: 6px; align-items: center; }
.psm-row + .psm-row { margin-top: 6px; }
.psm-attr-name {
  flex: 0 0 106px; font: 11.5px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: var(--psm-accent); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.psm-attr-val {
  flex: 1; min-width: 0; padding: 5px 7px; border: 1px solid var(--psm-border);
  border-radius: 5px; background: var(--psm-bg-input); color: var(--psm-fg);
  font: 11.5px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.psm-mini {
  flex: none; border: 1px solid var(--psm-border); background: var(--psm-bg-soft);
  color: var(--psm-fg-soft); cursor: pointer; border-radius: 5px;
  padding: 4px 7px; font-size: 11px; line-height: 1.3;
}
.psm-mini:hover { background: var(--psm-accent); border-color: var(--psm-accent); color: #fff; }
.psm-mini.psm-del:hover { background: var(--psm-danger); border-color: var(--psm-danger); }
.psm-attr-list { max-height: 200px; overflow-y: auto; margin-bottom: 4px; }

.psm-hist {
  display: flex; align-items: flex-start; gap: 7px; padding: 7px 8px;
  border: 1px solid var(--psm-border); border-radius: 7px; margin-bottom: 5px;
  background: var(--psm-bg-soft);
}
.psm-hist-main { flex: 1; min-width: 0; }
.psm-hist-label {
  font: 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: var(--psm-fg-soft); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.psm-hist-val {
  font-size: 12px; margin-top: 2px; word-break: break-word;
  max-height: 46px; overflow: hidden;
}
.psm-hist-kind {
  flex: none; font-size: 10px; padding: 1px 6px; border-radius: 9px;
  background: var(--psm-accent); color: #fff; text-transform: uppercase; letter-spacing: .03em;
}

.psm-foot {
  display: flex; flex-wrap: wrap; gap: 6px; padding: 9px 10px;
  border-top: 1px solid var(--psm-border); background: var(--psm-bg-soft);
}
.psm-btn {
  border: 1px solid var(--psm-border); background: var(--psm-bg); color: var(--psm-fg);
  padding: 6px 10px; border-radius: 6px; cursor: pointer; font: inherit; font-size: 12px;
}
.psm-btn:hover { border-color: var(--psm-accent); color: var(--psm-accent); }
.psm-btn:disabled { opacity: .45; cursor: not-allowed; }
.psm-btn:disabled:hover { border-color: var(--psm-border); color: var(--psm-fg); }
.psm-btn.psm-primary {
  background: var(--psm-accent); border-color: var(--psm-accent); color: #fff; font-weight: 600;
}
.psm-btn.psm-primary:hover { filter: brightness(1.08); color: #fff; }
.psm-btn.psm-danger { color: var(--psm-danger); border-color: var(--psm-border); }
.psm-btn.psm-danger:hover { background: var(--psm-danger); border-color: var(--psm-danger); color: #fff; }
.psm-grow { flex: 1; }

/* ---------- Toast ---------- */
.psm-toast {
  position: fixed; z-index: ${Z + 3}; left: 50%; bottom: 26px; transform: translateX(-50%);
  background: #16181d; color: #fff; padding: 9px 15px; border-radius: 8px;
  font: 12.5px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  box-shadow: 0 6px 20px rgba(0,0,0,.32); display: none; max-width: 440px; text-align: center;
}
.psm-toast.psm-on { display: block; }
.psm-toast.psm-bad { background: #b91c1c; }
.psm-toast.psm-good { background: #15803d; }
`;

  /* ---------- Pembuatan UI ---------- */

  let host = null;
  let root = null;
  let els = null;
  let callbacks = {};
  let currentTab = 'text';
  let historyCount = 0;

  function applyStyles(shadow) {
    try {
      if (typeof CSSStyleSheet === 'function') {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(CSS);
        shadow.adoptedStyleSheets = [sheet];
        return;
      }
    } catch {
      /* jatuh ke fallback <style> */
    }
    const style = document.createElement('style');
    style.textContent = CSS;
    shadow.appendChild(style);
  }

  function buildShell(shadow) {
    const wrap = document.createElement('div');
    wrap.className = 'psm-root';
    wrap.innerHTML = `
      <div class="psm-highlight" id="${HL_ID}"></div>
      <div class="psm-tooltip" id="${TIP_ID}"></div>
      <div class="psm-panel" id="${PANEL_ID}" role="dialog" aria-label="Pagesmith">
        <div class="psm-head" id="psm-head">
          <span class="psm-dot"></span>
          <div class="psm-titles">
            <div class="psm-title">Panel Editor</div>
            <div class="psm-sub" id="psm-sub">Belum ada elemen dipilih</div>
          </div>
          <button class="psm-iconbtn" id="psm-close" title="Tutup panel">&times;</button>
        </div>

        <div class="psm-tabs">
          <button class="psm-tab psm-active" data-tab="text">Teks</button>
          <button class="psm-tab" data-tab="attr">Atribut</button>
          <button class="psm-tab" data-tab="value">Nilai</button>
          <button class="psm-tab" data-tab="history">Riwayat<span class="psm-badge" id="psm-hcount">0</span></button>
        </div>

        <div class="psm-body">
          <div class="psm-pane psm-active" data-pane="text">
            <label class="psm-label" for="psm-text">Isi teks elemen</label>
            <textarea class="psm-textarea" id="psm-text" spellcheck="false" placeholder="Pilih elemen dulu…"></textarea>
            <div class="psm-hint">Teks di dalam elemen. Tag anak akan diganti dengan teks ini.</div>
          </div>

          <div class="psm-pane" data-pane="attr">
            <div id="psm-attr-wrap">
              <div class="psm-attr-list" id="psm-attr-list"></div>
            </div>
            <label class="psm-label">Tambah / perbarui atribut</label>
            <div class="psm-row">
              <input class="psm-attr-name psm-input" id="psm-attr-new-name" placeholder="nama" spellcheck="false">
              <input class="psm-attr-val" id="psm-attr-new-val" placeholder="nilai" spellcheck="false">
              <button class="psm-mini" id="psm-attr-add" title="Tambahkan">+</button>
            </div>
          </div>

          <div class="psm-pane" data-pane="value">
            <div id="psm-value-wrap">
              <label class="psm-label" for="psm-value">Nilai form</label>
              <input class="psm-input" id="psm-value" spellcheck="false">
              <select class="psm-select" id="psm-value-select" style="display:none"></select>
              <label class="psm-row" id="psm-value-check-row" style="display:none;margin-top:8px;cursor:pointer">
                <input type="checkbox" id="psm-value-check">
                <span>Dicentang (checked)</span>
              </label>
              <div class="psm-hint" id="psm-value-hint"></div>
            </div>
          </div>

          <div class="psm-pane" data-pane="history">
            <div class="psm-row" style="margin-bottom:8px">
              <button class="psm-btn psm-grow" id="psm-undo" title="Batalkan edit terakhir">Undo</button>
              <button class="psm-btn psm-grow" id="psm-redo" title="Ulangi edit yang dibatalkan">Redo</button>
            </div>
            <div id="psm-hist-list"></div>
          </div>
        </div>

        <div class="psm-foot">
          <button class="psm-btn psm-primary psm-grow" id="psm-apply">Terapkan</button>
          <button class="psm-btn" id="psm-revert" title="Kembalikan elemen ini ke nilai asli">Kembalikan</button>
          <button class="psm-btn" id="psm-hide" title="Sembunyikan / tampilkan elemen">Sembunyikan</button>
          <button class="psm-btn" id="psm-copy" title="Salin selector elemen">Copy</button>
          <button class="psm-btn psm-danger" id="psm-reset" title="Batalkan semua edit di halaman ini">Reset</button>
        </div>
      </div>
      <div class="psm-toast" id="${TOAST_ID}"></div>
    `;
    shadow.appendChild(wrap);
    return wrap;
  }

  function q(id) {
    return root.getElementById(id);
  }

  /* ---------- Wiring ---------- */

  function wire() {
    q('psm-close').addEventListener('click', () => callbacks.onClose && callbacks.onClose());

    for (const tab of root.querySelectorAll('.psm-tab')) {
      tab.addEventListener('click', () => {
        setTab(tab.dataset.tab);
      });
    }

    q('psm-apply').addEventListener('click', () => {
      if (currentTab === 'text') callbacks.onApplyText && callbacks.onApplyText(q('psm-text').value);
      else if (currentTab === 'attr') callbacks.onApplyAttrNew && callbacks.onApplyAttrNew();
      else if (currentTab === 'value') callbacks.onApplyValue && callbacks.onApplyValue(readValueInput());
      else if (currentTab === 'history') callbacks.onApplyText && callbacks.onApplyText(q('psm-text').value);
    });

    q('psm-revert').addEventListener('click', () => callbacks.onRevertSelected && callbacks.onRevertSelected());
    q('psm-hide').addEventListener('click', () => callbacks.onToggleHide && callbacks.onToggleHide());
    q('psm-copy').addEventListener('click', () => callbacks.onCopySelector && callbacks.onCopySelector());
    q('psm-reset').addEventListener('click', () => callbacks.onResetAll && callbacks.onResetAll());
    q('psm-undo').addEventListener('click', () => callbacks.onUndo && callbacks.onUndo());
    q('psm-redo').addEventListener('click', () => callbacks.onRedo && callbacks.onRedo());

    q('psm-attr-add').addEventListener('click', () => {
      const name = q('psm-attr-new-name').value.trim();
      const value = q('psm-attr-new-val').value;
      if (!name) return toast('Nama atribut belum diisi.', 'bad');
      callbacks.onSetAttr && callbacks.onSetAttr(name, value);
      q('psm-attr-new-name').value = '';
      q('psm-attr-new-val').value = '';
    });

    // Enter di kolom nilai atribut = tambahkan.
    q('psm-attr-new-val').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') q('psm-attr-add').click();
    });

    // Enter di textarea teks = terapkan (Shift+Enter tetap baris baru).
    q('psm-text').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        q('psm-apply').click();
      }
    });

    q('psm-value').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        q('psm-apply').click();
      }
    });

    q('psm-value-select').addEventListener('change', () => {
      q('psm-value').value = q('psm-value-select').value;
    });

    // Undo/redo hanya saat fokus di dalam panel — tidak membajak Ctrl+Z halaman.
    root.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        callbacks.onUndo && callbacks.onUndo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        callbacks.onRedo && callbacks.onRedo();
      }
    });

    makeDraggable(q('psm-head'), q(PANEL_ID));
  }

  function readValueInput() {
    if (q('psm-value-check-row').style.display !== 'none') {
      return q('psm-value-check').checked ? 'true' : 'false';
    }
    return q('psm-value').value;
  }

  /* ---------- Geser panel ---------- */

  function makeDraggable(handle, panel) {
    let sx = 0;
    let sy = 0;
    let ox = 0;
    let oy = 0;
    let dragging = false;

    handle.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.psm-iconbtn')) return;
      dragging = true;
      handle.classList.add('psm-dragging');
      const rect = panel.getBoundingClientRect();
      ox = rect.left;
      oy = rect.top;
      sx = e.clientX;
      sy = e.clientY;
      handle.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    handle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const nextLeft = clamp(ox + (e.clientX - sx), 4, window.innerWidth - 80);
      const nextTop = clamp(oy + (e.clientY - sy), 4, window.innerHeight - 40);
      panel.style.left = nextLeft + 'px';
      panel.style.top = nextTop + 'px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    });

    const end = (e) => {
      if (!dragging) return;
      dragging = false;
      handle.classList.remove('psm-dragging');
      try {
        handle.releasePointerCapture(e.pointerId);
      } catch {
        /* sudah lepas */
      }
      if (callbacks.onPanelMoved) callbacks.onPanelMoved(q(PANEL_ID).getBoundingClientRect());
    };

    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  function clamp(v, min, max) {
    return Math.min(Math.max(v, min), Math.max(min, max));
  }

  /* ---------- API ---------- */

  function ensureUI() {
    if (host && host.isConnected) return root;
    host = document.createElement('div');
    host.setAttribute(core.UI_ATTR, '1');
    host.style.cssText = 'all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:' + Z + ';';
    root = host.attachShadow({ mode: 'open' });
    applyStyles(root);
    buildShell(root);
    wire();
    (document.documentElement || document.body).appendChild(host);
    els = { panel: q(PANEL_ID), hl: q(HL_ID), tip: q(TIP_ID), toast: q(TOAST_ID) };

    // Daftarkan Shadow Root ke namespace supaya core.isOurNode() bisa mengenali
    // elemen-elemen DI DALAM panel — mereka tidak membawa atribut penanda,
    // hanya host-nya yang membawa. Tanpa ini, mode pilih bisa memilih tombol
    // panel ekstensi sendiri.
    NS.uiRoot = root;
    return root;
  }

  function init(cbs) {
    callbacks = cbs || {};
    ensureUI();
  }

  function applySettings(settings) {
    if (!root || !settings) return;
    const rootEl = root.querySelector('.psm-root');
    if (!rootEl) return;
    if (settings.highlightColor) rootEl.style.setProperty('--psm-accent', settings.highlightColor);
    const hl = q(HL_ID);
    if (hl && settings.highlightWidth) hl.style.borderWidth = settings.highlightWidth + 'px';
  }

  /** Menampilkan kotak highlight mengikuti posisi elemen. */
  function showHighlight(rect, opts = {}) {
    ensureUI();
    const hl = q(HL_ID);
    if (!rect || rect.width === 0 && rect.height === 0) {
      hideHighlight();
      return;
    }
    hl.style.left = rect.left + 'px';
    hl.style.top = rect.top + 'px';
    hl.style.width = rect.width + 'px';
    hl.style.height = rect.height + 'px';
    hl.classList.add('psm-on');
    hl.classList.toggle('psm-selected', Boolean(opts.selected));
    if (opts.color) hl.style.borderColor = opts.color;
    if (opts.width) hl.style.borderWidth = opts.width + 'px';
  }

  function hideHighlight() {
    if (!root) return;
    const hl = q(HL_ID);
    if (hl) hl.classList.remove('psm-on');
  }

  /** Menampilkan tooltip di dekat elemen. */
  function showTooltip(rect, selectorText, extra) {
    if (!rect) return hideTooltip();
    const tip = q(TIP_ID);
    const size = Math.round(rect.width) + '×' + Math.round(rect.height);
    tip.innerHTML = '';
    const strong = document.createElement('b');
    strong.textContent = selectorText || 'elemen';
    tip.appendChild(strong);
    tip.appendChild(document.createTextNode('  ' + size + (extra ? '  ' + extra : '')));

    const top = rect.top > 26 ? rect.top - 24 : rect.bottom + 6;
    tip.style.left = Math.max(4, rect.left) + 'px';
    tip.style.top = Math.max(4, top) + 'px';
    tip.classList.add('psm-on');
  }

  function hideTooltip() {
    if (!root) return;
    const tip = q(TIP_ID);
    if (tip) tip.classList.remove('psm-on');
  }

  function showPanel() {
    ensureUI();
    const panel = q(PANEL_ID);
    panel.classList.add('psm-on');
    if (!panel.style.left && !panel.style.top) {
      panel.style.top = '72px';
      panel.style.right = '18px';
    }
    return panel;
  }

  function hidePanel() {
    if (!root) return;
    q(PANEL_ID).classList.remove('psm-on');
  }

  function isPanelVisible() {
    return Boolean(root && q(PANEL_ID) && q(PANEL_ID).classList.contains('psm-on'));
  }

  function setTab(tab) {
    if (!tab) return;
    currentTab = tab;
    for (const btn of root.querySelectorAll('.psm-tab')) {
      btn.classList.toggle('psm-active', btn.dataset.tab === tab);
    }
    for (const pane of root.querySelectorAll('.psm-pane')) {
      pane.classList.toggle('psm-active', pane.dataset.pane === tab);
    }
    // Tab riwayat: tombol Terapkan tidak relevan.
    q('psm-apply').style.display = tab === 'history' ? 'none' : '';
    if (callbacks.onTabShown) callbacks.onTabShown(tab);
  }

  /**
   * Mengisi panel dengan elemen terpilih.
   * `info` = { selector, label, isControl, controlValue, controlType, options,
   *            attrs, textValue, canText }
   */
  function setSelection(info) {
    ensureUI();
    if (!info) {
      q('psm-sub').textContent = 'Belum ada elemen dipilih';
      q('psm-text').value = '';
      q('psm-text').disabled = true;
      q('psm-attr-list').innerHTML = '<div class="psm-empty">Belum ada elemen dipilih.</div>';
      q('psm-value-wrap').style.display = 'none';
      for (const id of ['psm-apply', 'psm-revert', 'psm-hide', 'psm-copy']) q(id).disabled = true;
      return;
    }

    q('psm-sub').textContent = info.selector || info.label || '';
    for (const id of ['psm-apply', 'psm-revert', 'psm-hide', 'psm-copy']) q(id).disabled = false;

    // --- Teks ---
    const textEl = q('psm-text');
    textEl.disabled = !info.canText;
    textEl.value = info.canText ? info.textValue : '';
    textEl.placeholder = info.canText ? 'Isi teks elemen…' : 'Elemen ini tidak punya teks yang bisa diedit.';

    // --- Atribut ---
    const list = q('psm-attr-list');
    list.innerHTML = '';
    const attrs = info.attrs || [];
    if (!attrs.length) {
      list.innerHTML = '<div class="psm-empty">Elemen ini tidak punya atribut.</div>';
    } else {
      for (const a of attrs) {
        const row = document.createElement('div');
        row.className = 'psm-row';

        const name = document.createElement('span');
        name.className = 'psm-attr-name';
        name.textContent = a.name;
        name.title = a.name;

        const val = document.createElement('input');
        val.className = 'psm-attr-val';
        val.value = a.value;
        val.spellcheck = false;

        const save = document.createElement('button');
        save.className = 'psm-mini';
        save.textContent = 'Set';
        save.title = 'Terapkan nilai atribut ini';
        save.addEventListener('click', () => callbacks.onSetAttr && callbacks.onSetAttr(a.name, val.value));

        const del = document.createElement('button');
        del.className = 'psm-mini psm-del';
        del.textContent = '×';
        del.title = 'Hapus atribut ini';
        del.addEventListener('click', () => callbacks.onRemoveAttr && callbacks.onRemoveAttr(a.name));

        val.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') save.click();
        });

        row.append(name, val, save, del);
        list.appendChild(row);
      }
    }

    // --- Nilai form ---
    const wrap = q('psm-value-wrap');
    const input = q('psm-value');
    const select = q('psm-value-select');
    const checkRow = q('psm-value-check-row');
    const hint = q('psm-value-hint');

    if (!info.isControl) {
      wrap.style.display = 'none';
    } else {
      wrap.style.display = '';
      const kind = info.controlType;
      input.style.display = 'none';
      select.style.display = 'none';
      checkRow.style.display = 'none';
      input.disabled = false;

      if (kind === 'checkbox' || kind === 'radio') {
        checkRow.style.display = 'flex';
        q('psm-value-check').checked = info.controlValue === 'true';
        hint.textContent = 'Centang untuk mengaktifkan.';
      } else if (kind === 'select' && Array.isArray(info.options)) {
        select.style.display = '';
        select.innerHTML = '';
        for (const opt of info.options) {
          const o = document.createElement('option');
          o.value = opt.value;
          o.textContent = opt.label + (opt.label === opt.value ? '' : '  (' + opt.value + ')');
          select.appendChild(o);
        }
        select.value = info.controlValue;
        hint.textContent = info.options.length + ' opsi tersedia. Pilih dari daftar.';
      } else {
        input.style.display = '';
        input.value = info.controlValue;
        input.type = kind === 'number' || kind === 'range' ? 'number' : 'text';
        hint.textContent = 'Nilai untuk <' + (info.controlTag || 'input') + ' type="' + kind + '">.';
      }
    }
  }

  /** Menandai apakah ada edit pada elemen terpilih (untuk tombol Kembalikan). */
  function setRevertEnabled(enabled) {
    if (!root) return;
    q('psm-revert').disabled = !enabled;
  }

  function setHistory(items) {
    ensureUI();
    historyCount = items ? items.length : 0;
    q('psm-hcount').textContent = String(historyCount);
    q('psm-hcount').style.display = historyCount ? '' : 'none';

    const list = q('psm-hist-list');
    list.innerHTML = '';
    if (!historyCount) {
      list.innerHTML = '<div class="psm-empty">Belum ada edit di halaman ini.</div>';
      return;
    }

    // Terbaru di atas.
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      const row = document.createElement('div');
      row.className = 'psm-hist';

      const kind = document.createElement('span');
      kind.className = 'psm-hist-kind';
      kind.textContent = item.kind;

      const main = document.createElement('div');
      main.className = 'psm-hist-main';

      const label = document.createElement('div');
      label.className = 'psm-hist-label';
      label.textContent = item.label || item.selector;
      label.title = item.selector;

      const val = document.createElement('div');
      val.className = 'psm-hist-val';
      val.textContent = previewValue(item);

      main.append(label, val);

      const back = document.createElement('button');
      back.className = 'psm-mini';
      back.textContent = '↩';
      back.title = 'Kembalikan edit ini';
      back.addEventListener('click', () => callbacks.onRevertItem && callbacks.onRevertItem(item.id));

      row.append(kind, main, back);
      list.appendChild(row);
    }
  }

  function previewValue(item) {
    if (item.kind === 'visibility') return item.value === 'hidden' ? 'disembunyikan' : 'ditampilkan';
    if (item.kind === 'attr') {
      if (item.remove) return item.attr + ' dihapus';
      return item.attr + ' = "' + truncate(item.value, 120) + '"';
    }
    return '"' + truncate(item.value, 120) + '"';
  }

  function truncate(str, max) {
    const s = String(str === undefined || str === null ? '' : str);
    return s.length > max ? s.slice(0, max) + '…' : s;
  }

  function toast(message, type) {
    ensureUI();
    const el = q(TOAST_ID);
    el.textContent = message;
    el.classList.remove('psm-bad', 'psm-good');
    if (type === 'bad') el.classList.add('psm-bad');
    else if (type === 'good') el.classList.add('psm-good');
    el.classList.add('psm-on');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('psm-on'), 2600);
  }

  function destroy() {
    if (host && host.parentNode) host.parentNode.removeChild(host);
    host = null;
    root = null;
    els = null;
    // Lepas penanda supaya core.isOurNode() tidak menunjuk Shadow Root mati.
    NS.uiRoot = null;
  }

  function getPanelRect() {
    if (!root) return null;
    const panel = q(PANEL_ID);
    return panel ? panel.getBoundingClientRect() : null;
  }

  function setPanelRect(rect) {
    if (!root || !rect) return;
    const panel = q(PANEL_ID);
    panel.style.left = rect.left + 'px';
    panel.style.top = rect.top + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  NS.overlay = Object.freeze({
    init,
    ensureUI,
    applySettings,
    showHighlight,
    hideHighlight,
    showTooltip,
    hideTooltip,
    showPanel,
    hidePanel,
    isPanelVisible,
    setTab,
    setSelection,
    setRevertEnabled,
    setHistory,
    toast,
    destroy,
    getPanelRect,
    setPanelRect,
    getCurrentTab: () => currentTab,
    getHistoryCount: () => historyCount,
    isOurNode: (node) => core.isOurNode(node),
  });
})();
