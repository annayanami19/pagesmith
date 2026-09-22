/**
 * Orkestrator content script: mode pilih, panel, riwayat, auto-apply, dan
 * router pesan dari service worker.
 *
 * File ini classic script; berbagi scope isolated world dengan core.js dan
 * overlay.js, jadi urutan pemuatan ketiganya penting (lihat CONTENT_FILES).
 */
(function () {
  'use strict';

  const NS = (globalThis.__PSM__ = globalThis.__PSM__ || {});
  if (NS.main) return;
  const core = NS.core;
  const overlay = NS.overlay;
  if (!core || !overlay) return;

  const STORAGE_KEYS = { EDITS: 'psm_edits', SETTINGS: 'psm_settings', DYNAMIC: 'psm_dynamic' };
  const MSG = {
    CS_GET_STATE: 'CS_GET_STATE',
    CS_TOGGLE_PICKER: 'CS_TOGGLE_PICKER',
    CS_OPEN_PANEL: 'CS_OPEN_PANEL',
    CS_CLOSE_PANEL: 'CS_CLOSE_PANEL',
    CS_RESET_ALL: 'CS_RESET_ALL',
    CS_PERSIST_NOW: 'CS_PERSIST_NOW',
    CS_START_PICK: 'CS_START_PICK',
    CS_EDITS_CHANGED: 'CS_EDITS_CHANGED',
  };
  const MAX_EDITS = 500;
  const MAX_VALUE = 20000;

  const VOID_TAGS = new Set([
    'IMG', 'INPUT', 'BR', 'HR', 'META', 'LINK', 'SOURCE', 'TRACK', 'AREA',
    'BASE', 'COL', 'EMBED', 'PARAM', 'WBR', 'IFRAME', 'CANVAS', 'SVG',
    'VIDEO', 'AUDIO', 'OBJECT',
  ]);

  /* ---------- State ---------- */

  const state = {
    origin: '',
    edits: [],
    elements: new Map(), // id → Element (referensi hidup, hanya berlaku sesi ini)
    selected: null,
    pickerOn: false,
    persist: false,
    settings: { highlightColor: '#3b82f6', highlightWidth: 2, showTooltip: true, autoOpenPanel: true },
    undoStack: [],
    redoStack: [],
    contextTarget: null,
    applyReport: { applied: 0, failed: [] },
  };

  /* ---------- Util ---------- */

  function safeOrigin() {
    try {
      return location.origin && location.origin !== 'null' ? location.origin : '';
    } catch {
      return '';
    }
  }

  function clip(str) {
    const s = String(str === undefined || str === null ? '' : str);
    return s.length > MAX_VALUE ? s.slice(0, MAX_VALUE) : s;
  }

  function isOurNode(node) {
    return core.isOurNode(node);
  }

  /** Elemen nyata di balik event, menembus Shadow DOM halaman. */
  function realTarget(event) {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : null;
    if (path) {
      for (const node of path) {
        if (isOurNode(node)) return null; // milik extension sendiri
        if (node instanceof Element) return node;
      }
      return null;
    }
    const t = event.target;
    if (!(t instanceof Element) || isOurNode(t)) return null;
    return t;
  }

  function showToast(msg, type) {
    overlay.toast(msg, type);
  }

  /* ---------- Baca/tulis penyimpanan ---------- */

  async function readSettings() {
    try {
      const bag = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
      const raw = bag[STORAGE_KEYS.SETTINGS];
      if (raw && typeof raw === 'object') state.settings = { ...state.settings, ...raw };
    } catch {
      /* pakai default */
    }
  }

  async function readSavedEdits() {
    if (!state.origin) return [];
    try {
      const bag = await chrome.storage.local.get(STORAGE_KEYS.EDITS);
      const all = bag[STORAGE_KEYS.EDITS];
      const entry = all && all[state.origin];
      if (!entry || !Array.isArray(entry.edits)) return [];
      return entry.edits;
    } catch {
      return [];
    }
  }

  async function readPersistFlag() {
    if (!state.origin) return false;
    try {
      const bag = await chrome.storage.local.get(STORAGE_KEYS.DYNAMIC);
      const dyn = bag[STORAGE_KEYS.DYNAMIC];
      return Boolean(dyn && Array.isArray(dyn.origins) && dyn.origins.includes(state.origin));
    } catch {
      return false;
    }
  }

  /** Menyimpan edit ke storage. Hanya jalan bila persist aktif untuk origin ini. */
  async function persistEdits() {
    if (!state.persist || !state.origin) return;
    try {
      const bag = await chrome.storage.local.get(STORAGE_KEYS.EDITS);
      const all = bag[STORAGE_KEYS.EDITS] && typeof bag[STORAGE_KEYS.EDITS] === 'object' ? bag[STORAGE_KEYS.EDITS] : {};

      const payload = state.edits.slice(0, MAX_EDITS).map((e) => ({
        id: e.id,
        selector: e.selector,
        fingerprint: e.fingerprint,
        kind: e.kind,
        attr: e.attr,
        remove: e.remove === true,
        value: e.value,
        original: e.original,
        createdAt: e.createdAt,
      }));

      if (payload.length) {
        all[state.origin] = { origin: state.origin, updatedAt: Date.now(), edits: payload };
      } else {
        delete all[state.origin];
      }

      await chrome.storage.local.set({ [STORAGE_KEYS.EDITS]: all });
    } catch (e) {
      console.warn('[PSM] gagal menyimpan:', e && e.message ? e.message : e);
    }
  }

  /* ---------- Riwayat ---------- */

  function findEdit(id) {
    return state.edits.find((e) => e.id === id) || null;
  }

  function elementFor(id) {
    const live = state.elements.get(id);
    if (live && live.isConnected) return live;
    const record = findEdit(id);
    if (!record) return null;
    const el = core.resolveElement(record.selector);
    if (el) state.elements.set(id, el);
    return el;
  }

  function notifyChange() {
    overlay.setHistory(state.edits.map((e) => ({ ...e })));
    overlay.setRevertEnabled(Boolean(state.selected && findEditForElement(state.selected)));
    try {
      chrome.runtime.sendMessage({ type: MSG.CS_EDITS_CHANGED, count: state.edits.length }).catch(() => {});
    } catch {
      /* service worker tidur — badge akan menyusul */
    }
  }

  function findEditForElement(el) {
    for (const record of state.edits) {
      if (state.elements.get(record.id) === el) return record;
    }
    return null;
  }

  /* ---------- Inti: menambah / membatalkan edit ---------- */

  /**
   * Menambahkan satu edit.
   * Edit dengan kunci sama (jenis + selector + atribut) menggantikan yang lama,
   * sehingga mengedit satu atribut dua kali tidak menumpuk jadi dua baris.
   */
  function addEdit(el, partial) {
    const selector = core.buildSelector(el);
    if (!selector) {
      showToast('Elemen ini tidak bisa diidentifikasi secara unik. Edit dibatalkan.', 'bad');
      return false;
    }

    const record = core.toRecord({
      ...partial,
      selector,
      fingerprint: core.fingerprintOf(el),
      original: core.snapshotOriginal(el, partial.kind, partial.attr),
      value: clip(partial.value),
    });

    if (record.kind === 'value' && record.original === null) {
      showToast('Nilai asli elemen ini tidak terbaca. Edit dibatalkan.', 'bad');
      return false;
    }

    const key = core.editKey(record);
    const existingIndex = state.edits.findIndex((e) => core.editKey(e) === key);

    // Periksa batas SEBELUM menyentuh DOM — kalau tidak, edit sudah terlanjur
    // diterapkan tapi tidak tercatat di riwayat, dan tidak bisa dibatalkan.
    if (existingIndex < 0 && state.edits.length >= MAX_EDITS) {
      showToast('Batas ' + MAX_EDITS + ' edit per halaman tercapai.', 'bad');
      return false;
    }

    // Simpan nilai asli dari edit pertama — revert harus kembali ke kondisi awal.
    if (existingIndex >= 0) {
      record.original = state.edits[existingIndex].original;
      record.id = state.edits[existingIndex].id;
      record.createdAt = state.edits[existingIndex].createdAt;
    }

    const result = core.applyEdit(el, record);
    if (!result.ok) {
      showToast(result.reason || 'Gagal menerapkan edit.', 'bad');
      return false;
    }

    if (existingIndex >= 0) {
      state.edits[existingIndex] = { ...record, label: core.labelFor(el) };
    } else {
      state.edits.push({ ...record, label: core.labelFor(el) });
    }

    state.elements.set(record.id, el);
    pushAction({ type: 'add', record: { ...record } });
    persistEdits();
    notifyChange();
    refreshPanelForSelection();
    return true;
  }

  /** Mengembalikan satu edit ke nilai aslinya, lalu membuangnya dari daftar. */
  function revertEditById(id) {
    const index = state.edits.findIndex((e) => e.id === id);
    if (index < 0) return false;
    const record = state.edits[index];
    const el = elementFor(id);

    if (el && el.isConnected) {
      const res = core.revertEdit(el, record);
      if (!res.ok) showToast(res.reason || 'Gagal mengembalikan.', 'bad');
    }

    state.edits.splice(index, 1);
    state.elements.delete(id);
    pushAction({ type: 'remove', record: { ...record } });
    persistEdits();
    notifyChange();
    refreshPanelForSelection();
    return true;
  }

  /** Mengembalikan semua edit pada satu elemen (dipakai tombol "Kembalikan"). */
  function revertElement(el) {
    const targets = state.edits.filter((e) => state.elements.get(e.id) === el);
    if (!targets.length) {
      showToast('Elemen ini belum punya edit.', 'bad');
      return;
    }
    // Dari yang terbaru, supaya urutan pemulihan konsisten.
    for (let i = targets.length - 1; i >= 0; i--) revertEditById(targets[i].id);
    showToast('Edit pada elemen ini dikembalikan.', 'good');
  }

  function resetAll() {
    if (!state.edits.length) {
      showToast('Belum ada edit untuk dibatalkan.', 'bad');
      return;
    }
    const snapshot = state.edits.slice();
    for (let i = snapshot.length - 1; i >= 0; i--) {
      const record = snapshot[i];
      const el = elementFor(record.id);
      if (el && el.isConnected) core.revertEdit(el, record);
    }
    state.edits = [];
    state.elements.clear();
    state.undoStack = [];
    state.redoStack = [];
    persistEdits();
    notifyChange();
    overlay.setSelection(null);
    showToast('Semua edit di halaman ini dibatalkan.', 'good');
  }

  /* ---------- Undo / Redo ---------- */

  function pushAction(action) {
    state.undoStack.push(action);
    if (state.undoStack.length > 100) state.undoStack.shift();
    state.redoStack = [];
  }

  function undo() {
    const action = state.undoStack.pop();
    if (!action) {
      showToast('Tidak ada yang bisa dibatalkan.', 'bad');
      return;
    }
    state.redoStack.push(action);
    applyAction(action, true);
  }

  function redo() {
    const action = state.redoStack.pop();
    if (!action) {
      showToast('Tidak ada yang bisa diulang.', 'bad');
      return;
    }
    state.undoStack.push(action);
    applyAction(action, false);
  }

  /** inverse=true berarti membatalkan aksi. */
  function applyAction(action, inverse) {
    const adding = action.type === 'add' ? !inverse : inverse;
    const record = action.record;

    if (adding) {
      // Kembalikan record ke daftar + terapkan ulang ke elemen.
      const el = state.elements.get(record.id) || core.resolveElement(record.selector);
      if (el && el.isConnected) {
        const res = core.applyEdit(el, record);
        if (!res.ok) {
          showToast(res.reason || 'Gagal mengulang edit.', 'bad');
          return;
        }
        state.elements.set(record.id, el);
      }
      if (!state.edits.some((e) => e.id === record.id)) {
        state.edits.push({ ...record, label: record.label || core.labelFor(el || document.body) });
      }
    } else {
      const index = state.edits.findIndex((e) => e.id === record.id);
      if (index >= 0) state.edits.splice(index, 1);
      const el = elementFor(record.id);
      if (el && el.isConnected) core.revertEdit(el, record);
      state.elements.delete(record.id);
    }

    persistEdits();
    notifyChange();
    refreshPanelForSelection();
  }

  /* ---------- Pilih elemen ---------- */

  function highlightFor(el) {
    if (!el || !el.isConnected) {
      overlay.hideHighlight();
      overlay.hideTooltip();
      return;
    }
    const rect = el.getBoundingClientRect();
    const selected = state.selected === el;
    overlay.showHighlight(rect, {
      selected,
      color: state.settings.highlightColor,
      width: state.settings.highlightWidth,
    });

    if (state.settings.showTooltip && state.pickerOn) {
      const selector = core.buildSelector(el) || core.describeElement(el);
      overlay.showTooltip(rect, selector);
    } else {
      overlay.hideTooltip();
    }
  }

  function selectElement(el, opts = {}) {
    if (!el || !el.isConnected) return;
    state.selected = el;
    overlay.setSelection(describeForPanel(el));
    if (opts.openPanel !== false && state.settings.autoOpenPanel !== false) overlay.showPanel();
    highlightFor(el);
    overlay.setRevertEnabled(Boolean(findEditForElement(el)));
  }

  function describeForPanel(el) {
    const attrs = [];
    for (const a of Array.from(el.attributes)) {
      if (a.name === core.UI_ATTR) continue;
      attrs.push({ name: a.name, value: a.value });
    }

    const isControl = core.isControl(el);
    let controlType = '';
    let controlValue = '';
    let options = null;

    if (isControl) {
      controlType = el instanceof HTMLInputElement ? el.type : el.tagName.toLowerCase();
      controlValue = core.readControlValue(el);
      if (controlValue === null) controlValue = '';
      if (el instanceof HTMLSelectElement) {
        options = Array.from(el.options).map((o) => ({ value: o.value, label: o.label }));
      }
    }

    const canText = !isControl && !VOID_TAGS.has(el.tagName) && (el.children.length === 0 || (el.textContent || '').trim() !== '');

    return {
      selector: core.buildSelector(el) || core.describeElement(el),
      label: core.labelFor(el),
      attrs,
      isControl,
      controlType,
      controlTag: el.tagName.toLowerCase(),
      controlValue,
      options,
      canText,
      textValue: canText ? el.textContent || '' : '',
    };
  }

  /** Menyegarkan panel agar mencerminkan kondisi elemen terpilih saat ini. */
  function refreshPanelForSelection() {
    if (!state.selected || !state.selected.isConnected) return;
    if (overlay.getCurrentTab() === 'history') return; // jangan timpa tab riwayat
    overlay.setSelection(describeForPanel(state.selected));
  }

  /* ---------- Mode pilih ---------- */

  function setPicker(on) {
    state.pickerOn = Boolean(on);
    if (state.pickerOn) {
      document.addEventListener('mousemove', onPickerMove, true);
      document.addEventListener('click', onPickerClick, true);
      document.addEventListener('keydown', onPickerKey, true);
      document.documentElement.style.cursor = 'crosshair';
      showToast('Mode pilih aktif — klik elemen yang mau diedit. Esc untuk batal.');
    } else {
      document.removeEventListener('mousemove', onPickerMove, true);
      document.removeEventListener('click', onPickerClick, true);
      document.removeEventListener('keydown', onPickerKey, true);
      document.documentElement.style.cursor = '';
      overlay.hideHighlight();
      overlay.hideTooltip();
    }
  }

  function onPickerMove(e) {
    const el = realTarget(e);
    if (!el) return;
    highlightFor(el);
  }

  function onPickerClick(e) {
    const el = realTarget(e);
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    setPicker(false);
    selectElement(el);
  }

  function onPickerKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      setPicker(false);
      showToast('Mode pilih dibatalkan.');
    }
  }

  /* ---------- Edit langsung (klik dua kali) ---------- */

  let inlineTarget = null;

  function onDblClick(e) {
    if (state.settings.inlineEditOnDoubleClick === false) return;
    const el = realTarget(e);
    if (!el) return;
    if (core.isControl(el)) return; // kontrol form diedit lewat panel
    if (VOID_TAGS.has(el.tagName)) return;
    if (el.children.length && !(el.textContent || '').trim()) return;

    e.preventDefault();
    e.stopPropagation();

    inlineTarget = el;
    const before = el.textContent || '';
    el.setAttribute('contenteditable', 'plaintext-only');
    el.focus();

    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }

    const finish = (commit) => {
      el.removeEventListener('keydown', onKey);
      el.removeEventListener('blur', onBlur);
      el.removeAttribute('contenteditable');
      inlineTarget = null;
      if (commit) {
        const after = el.textContent || '';
        if (after !== before) {
          // Tulis lewat jalur edit biasa supaya tercatat di riwayat.
          addEdit(el, { kind: 'text', value: after });
        }
      } else {
        el.textContent = before;
      }
    };

    const onKey = (ev) => {
      if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault();
        finish(true);
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        finish(false);
      }
    };

    const onBlur = () => finish(true);

    el.addEventListener('keydown', onKey);
    el.addEventListener('blur', onBlur);
  }

  /* ---------- Aksi panel ---------- */

  function wirePanel() {
    overlay.init({
      onClose: () => overlay.hidePanel(),
      onApplyText: (value) => {
        if (!state.selected) return showToast('Pilih elemen dulu.', 'bad');
        if (addEdit(state.selected, { kind: 'text', value })) showToast('Teks diterapkan.', 'good');
      },
      onApplyValue: (value) => {
        if (!state.selected) return showToast('Pilih elemen dulu.', 'bad');
        if (!core.isControl(state.selected)) return showToast('Elemen ini bukan kontrol form.', 'bad');
        if (addEdit(state.selected, { kind: 'value', value })) showToast('Nilai diterapkan.', 'good');
      },
      onApplyAttrNew: () => {
        if (!state.selected) return showToast('Pilih elemen dulu.', 'bad');
        showToast('Isi nama & nilai atribut lalu klik +.', 'bad');
      },
      onSetAttr: (name, value) => {
        if (!state.selected) return showToast('Pilih elemen dulu.', 'bad');
        const clean = String(name || '').trim();
        if (!clean) return showToast('Nama atribut belum diisi.', 'bad');
        if (clean.toLowerCase().startsWith('on')) {
          return showToast('Atribut event (on*) tidak diizinkan.', 'bad');
        }
        if (addEdit(state.selected, { kind: 'attr', attr: clean, value })) {
          showToast('Atribut ' + clean + ' diterapkan.', 'good');
        }
      },
      onRemoveAttr: (name) => {
        if (!state.selected) return showToast('Pilih elemen dulu.', 'bad');
        const el = state.selected;
        if (!el.hasAttribute(name)) return showToast('Atribut ' + name + ' sudah tidak ada.', 'bad');

        const record = core.toRecord({
          selector: core.buildSelector(el),
          fingerprint: core.fingerprintOf(el),
          kind: 'attr',
          attr: name,
          remove: true,
          value: '',
          original: el.getAttribute(name),
        });

        if (!record.selector) {
          return showToast('Elemen ini tidak bisa diidentifikasi secara unik. Edit dibatalkan.', 'bad');
        }

        const key = core.editKey(record);
        const existingIndex = state.edits.findIndex((e) => core.editKey(e) === key);

        if (existingIndex < 0 && state.edits.length >= MAX_EDITS) {
          return showToast('Batas ' + MAX_EDITS + ' edit per halaman tercapai.', 'bad');
        }

        if (existingIndex >= 0) {
          record.original = state.edits[existingIndex].original;
          record.id = state.edits[existingIndex].id;
          record.createdAt = state.edits[existingIndex].createdAt;
        }

        const res = core.applyEdit(el, record);
        if (!res.ok) return showToast(res.reason || 'Gagal menghapus atribut.', 'bad');

        if (existingIndex >= 0) {
          state.edits[existingIndex] = { ...record, label: core.labelFor(el) };
        } else {
          state.edits.push({ ...record, label: core.labelFor(el) });
        }

        state.elements.set(record.id, el);
        pushAction({ type: 'add', record: { ...record } });
        persistEdits();
        notifyChange();
        refreshPanelForSelection();
        showToast('Atribut ' + name + ' dihapus.', 'good');
      },
      onRevertSelected: () => {
        if (!state.selected) return showToast('Pilih elemen dulu.', 'bad');
        revertElement(state.selected);
      },
      onToggleHide: () => {
        if (!state.selected) return showToast('Pilih elemen dulu.', 'bad');
        const el = state.selected;
        const hidden = el.style.getPropertyValue('display') === 'none';
        if (addEdit(el, { kind: 'visibility', value: hidden ? 'shown' : 'hidden' })) {
          showToast(hidden ? 'Elemen ditampilkan.' : 'Elemen disembunyikan.', 'good');
        }
      },
      onCopySelector: async () => {
        if (!state.selected) return showToast('Pilih elemen dulu.', 'bad');
        const selector = core.buildSelector(state.selected);
        if (!selector) return showToast('Selector unik tidak ditemukan.', 'bad');
        try {
          await navigator.clipboard.writeText(selector);
          showToast('Selector disalin: ' + selector, 'good');
        } catch {
          showToast('Gagal menyalin. Selector: ' + selector, 'bad');
        }
      },
      onResetAll: () => {
        if (!state.edits.length) return showToast('Belum ada edit untuk dibatalkan.', 'bad');
        resetAll();
      },
      onUndo: undo,
      onRedo: redo,
      onRevertItem: (id) => {
        if (revertEditById(id)) showToast('Edit dikembalikan.', 'good');
      },
      onTabShown: () => refreshPanelForSelection(),
      onPanelMoved: () => {},
    });
    overlay.applySettings(state.settings);
  }

  /* ---------- Auto-apply ---------- */

  /**
   * Menerapkan edit tersimpan untuk origin ini.
   *
   * Setiap edit divalidasi dulu (fingerprint + nilai asli masih sama) sebelum
   * ditulis. Edit yang gagal dilewati dan dilaporkan — lebih baik tidak
   * menerapkan apa pun daripada menulis nilai ke elemen yang salah.
   */
  async function autoApplySaved() {
    if (!state.persist || !state.origin) return;
    const saved = await readSavedEdits();
    if (!saved.length) return;

    let applied = 0;
    const failed = [];

    for (const raw of saved) {
      const record = core.toRecord(raw);
      if (!record.selector) continue;

      if (record.selector.startsWith(core.SHADOW_PREFIX)) {
        failed.push({ selector: record.selector, reason: 'Elemen di dalam Shadow DOM tidak bisa dipulihkan otomatis.' });
        continue;
      }

      const el = core.resolveElement(record.selector);
      if (!el) {
        failed.push({ selector: record.selector, reason: 'Elemen tidak ditemukan.' });
        continue;
      }

      const check = core.validateEdit(el, record);
      if (!check.ok) {
        failed.push({ selector: record.selector, reason: check.reason });
        continue;
      }

      const res = core.applyEdit(el, record);
      if (!res.ok) {
        failed.push({ selector: record.selector, reason: res.reason });
        continue;
      }

      state.edits.push({ ...record, label: core.labelFor(el) });
      state.elements.set(record.id, el);
      applied++;
    }

    state.applyReport = { applied, failed };
    if (applied) notifyChange();
    return state.applyReport;
  }

  /* ---------- Router pesan ---------- */

  function tabState() {
    return {
      ok: true,
      origin: state.origin,
      editCount: state.edits.length,
      pickerOn: state.pickerOn,
      persist: state.persist,
      panelVisible: overlay.isPanelVisible(),
      applyReport: state.applyReport,
    };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message && message.type) {
      case MSG.CS_GET_STATE:
        sendResponse(tabState());
        return false;

      case MSG.CS_TOGGLE_PICKER:
        setPicker(!state.pickerOn);
        sendResponse(tabState());
        return false;

      case MSG.CS_START_PICK:
        overlay.showPanel();
        setPicker(true);
        sendResponse(tabState());
        return false;

      case MSG.CS_OPEN_PANEL:
        overlay.showPanel();
        if (state.applyReport.failed.length && !state.applyReport.reported) {
          state.applyReport.reported = true;
          showToast(
            state.applyReport.failed.length + ' edit tersimpan tidak dapat diterapkan di halaman ini.',
            'bad'
          );
        }
        sendResponse(tabState());
        return false;

      case MSG.CS_CLOSE_PANEL:
        overlay.hidePanel();
        sendResponse(tabState());
        return false;

      case MSG.CS_RESET_ALL:
        resetAll();
        sendResponse(tabState());
        return false;

      case MSG.CS_PERSIST_NOW:
        state.persist = Boolean(message.enabled);
        if (state.persist) persistEdits();
        sendResponse(tabState());
        return false;

      default:
        return false;
    }
  });

  /* ---------- Pemasangan awal ---------- */

  function wirePageListeners() {
    // Klik dua kali untuk edit langsung.
    document.addEventListener('dblclick', onDblClick, true);

    // Ingat target klik-kanan supaya context menu tahu elemen mana yang dimaksud.
    document.addEventListener(
      'contextmenu',
      (e) => {
        const el = realTarget(e);
        state.contextTarget = el || null;
      },
      true
    );

    // Highlight ikut bergerak saat halaman di-scroll / di-resize.
    const reposition = () => {
      if (state.pickerOn) {
        if (state.selected && state.selected.isConnected) highlightFor(state.selected);
      } else if (state.selected && state.selected.isConnected && overlay.isPanelVisible()) {
        // Panel terbuka: tetap tandai elemen terpilih agar tidak hilang konteks.
        const rect = state.selected.getBoundingClientRect();
        overlay.showHighlight(rect, {
          selected: true,
          color: state.settings.highlightColor,
          width: state.settings.highlightWidth,
        });
      }
    };
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);

    // Elemen terpilih hilang dari DOM → bersihkan panel.
    const observer = new MutationObserver(() => {
      if (state.selected && !state.selected.isConnected) {
        state.selected = null;
        overlay.setSelection(null);
        overlay.hideHighlight();
      }
    });
    try {
      observer.observe(document.documentElement, { childList: true, subtree: true });
    } catch {
      /* abaikan */
    }
  }

  async function boot() {
    state.origin = safeOrigin();
    await readSettings();
    state.persist = await readPersistFlag();

    wirePanel();
    wirePageListeners();

    // Terapkan edit tersimpan sedini mungkin supaya tidak ada kedipan konten asli.
    if (state.persist) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => autoApplySaved(), { once: true });
      } else {
        autoApplySaved();
      }
    }

    overlay.setHistory([]);
    notifyChange();
  }

  NS.main = Object.freeze({
    getState: tabState,
    setPicker,
    selectElement,
    autoApplySaved,
    resetAll,
  });

  boot();
})();
