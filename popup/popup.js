/**
 * Popup: status tab aktif, launcher panel, dan toggle simpan-per-domain.
 *
 * Catatan penting soal izin: chrome.permissions.request() hanya berjalan bila
 * dipanggil di dalam user gesture. Karena itu ia dipanggil LANGSUNG di handler
 * change checkbox — sebelum await apa pun — supaya gesture-nya belum hilang.
 */
import { MSG } from '../background/constants.js';
import { originFromUrl, patternFromOrigin } from '../background/permissions.js';

const $ = (id) => document.getElementById(id);

/** Tab aktif saat ini. */
let activeTab = null;

/* ---------- Toast ---------- */

let toastTimer = null;

function toast(message, type) {
  const el = $('toast');
  el.textContent = message;
  el.className = 'toast on' + (type ? ' ' + type : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.className = 'toast';
  }, 2600);
}

/* ---------- Kirim pesan ke service worker ---------- */

async function send(type, extra) {
  try {
    return await chrome.runtime.sendMessage({ type, tabId: activeTab?.id, url: activeTab?.url, ...(extra || {}) });
  } catch (e) {
    return { ok: false, reason: 'error', message: e && e.message ? e.message : String(e) };
  }
}

/* ---------- Render ---------- */

function render(state) {
  const origin = state.origin || '';
  $('origin').textContent = origin || 'Halaman ini tidak bisa diedit';
  $('count').textContent = String(state.editCount || 0);

  if (state.savedCount) {
    $('saved-hint').textContent = state.savedCount + ' edit tersimpan untuk domain ini.';
  } else if (!origin) {
    $('saved-hint').textContent = 'Halaman internal browser tidak dapat diedit.';
  } else {
    $('saved-hint').textContent = '';
  }

  const noOrigin = !origin;
  $('btn-panel').disabled = noOrigin;
  $('btn-pick').disabled = noOrigin;
  $('btn-reset').disabled = noOrigin || !state.editCount;

  const persistBox = $('persist');
  persistBox.disabled = noOrigin;
  persistBox.checked = Boolean(state.persist);
  $('persist-desc').textContent = state.persist
    ? 'Edit diterapkan otomatis tiap domain ini dibuka. Izin hanya untuk domain ini.'
    : 'Edit otomatis diterapkan lagi tiap domain ini dibuka.';
}

async function refresh() {
  const state = await send(MSG.GET_TAB_STATE);
  if (state && state.ok) render(state);
}

/* ---------- Aksi ---------- */

async function openPanel(pick) {
  const res = await send(MSG.OPEN_PANEL, { pick });
  if (res && res.ok) {
    window.close();
    return;
  }
  if (res && res.reason === 'inject-failed') {
    toast('Tidak bisa mengakses halaman ini. Coba muat ulang halaman.', 'bad');
    return;
  }
  toast('Gagal membuka panel.', 'bad');
}

async function resetTab() {
  const res = await send(MSG.RESET_TAB);
  if (res && res.ok) {
    toast('Semua edit di tab ini dibatalkan.', 'good');
    await refresh();
  } else {
    toast('Gagal membatalkan edit.', 'bad');
  }
}

/**
 * Mengaktifkan simpan-per-domain.
 * Urutan: minta izin dulu (harus di dalam gesture), baru catat + daftarkan.
 */
async function enablePersist() {
  const origin = originFromUrl(activeTab?.url || '');
  if (!origin) {
    $('persist').checked = false;
    toast('Domain halaman ini tidak bisa disimpan.', 'bad');
    return;
  }

  let granted = false;
  try {
    granted = await chrome.permissions.request({ origins: [patternFromOrigin(origin)] });
  } catch (e) {
    $('persist').checked = false;
    toast('Permintaan izin gagal: ' + (e && e.message ? e.message : e), 'bad');
    return;
  }

  if (!granted) {
    $('persist').checked = false;
    toast('Izin ditolak. Edit tetap berlaku sampai halaman dimuat ulang.', 'bad');
    return;
  }

  const res = await send(MSG.SET_PERSIST, { origin, enabled: true });
  if (res && res.ok) {
    toast('Disimpan untuk ' + origin + '.', 'good');
  } else {
    $('persist').checked = false;
    toast('Gagal mengaktifkan simpan otomatis.', 'bad');
  }
  await refresh();
}

async function disablePersist() {
  const origin = originFromUrl(activeTab?.url || '');
  if (!origin) return;

  const res = await send(MSG.SET_PERSIST, { origin, enabled: false });
  // Izin host sengaja TIDAK dicabut di sini: data edit tetap tersimpan, dan
  // mencabut izin akan menghapus edit tersimpan dari jangkauan. Pencabutan
  // izin tersedia di halaman Pengaturan.
  if (res && res.ok) {
    toast('Simpan otomatis dimatikan. Edit tersimpan tetap ada.', 'good');
  } else {
    toast('Gagal mematikan simpan otomatis.', 'bad');
  }
  await refresh();
}

/* ---------- Pemasangan ---------- */

async function init() {
  $('version').textContent = 'v' + chrome.runtime.getManifest().version;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tab || null;

  $('btn-panel').addEventListener('click', () => openPanel(false));
  $('btn-pick').addEventListener('click', () => openPanel(true));
  $('btn-reset').addEventListener('click', resetTab);
  $('btn-options').addEventListener('click', () => chrome.runtime.openOptionsPage());

  // Panggil request izin LANGSUNG di handler agar user gesture masih berlaku.
  $('persist').addEventListener('change', (e) => {
    if (e.target.checked) enablePersist();
    else disablePersist();
  });

  await refresh();
}

init();
