/**
 * Halaman Pengaturan: kelola domain tersimpan, preferensi tampilan, dan
 * export/import data.
 *
 * Halaman ini adalah extension page, jadi boleh memakai ES module dan
 * mengimpor modul dari background/ secara langsung (service worker tidak
 * perlu jadi perantara).
 */
import { DEFAULT_SETTINGS, SCHEMA_VERSION } from '../background/constants.js';
import {
  clearAllEdits,
  deleteOriginEdits,
  exportAll,
  importAll,
  readAllEdits,
  readDynamic,
  readSettings,
  removeDynamicOrigin,
  writeDynamic,
  writeSettings,
} from '../background/storage.js';
import { listGrantedOrigins, removeOriginPermission } from '../background/permissions.js';
import { registerOrigin, unregisterOrigin } from '../background/injection.js';

const $ = (id) => document.getElementById(id);

/* ---------- Toast ---------- */

let toastTimer = null;

function toast(message, type) {
  const el = $('toast');
  el.textContent = message;
  el.className = 'toast on' + (type ? ' ' + type : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.className = 'toast';
  }, 3000);
}

/* ---------- Util ---------- */

function formatDate(ms) {
  if (!ms) return 'belum pernah';
  try {
    return new Date(ms).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(ms);
  }
}

function pluralEdits(n) {
  return n + ' edit';
}

/* ---------- Daftar domain ---------- */

async function renderDomains() {
  const [all, dynamic, granted] = await Promise.all([readAllEdits(), readDynamic(), listGrantedOrigins()]);
  const grantedSet = new Set(granted);

  // Gabungkan: origin yang punya edit + origin yang tercatat persist.
  const origins = new Set([...Object.keys(all), ...dynamic.origins]);

  const container = $('domains');
  container.innerHTML = '';
  $('domain-count').textContent = String(origins.size);

  if (!origins.size) {
    container.innerHTML =
      '<div class="empty">Belum ada domain tersimpan.<br>Aktifkan "Simpan untuk domain ini" di popup saat berada di halaman yang mau diedit.</div>';
    return;
  }

  const sorted = Array.from(origins).sort((a, b) => (all[b]?.updatedAt || 0) - (all[a]?.updatedAt || 0));

  for (const origin of sorted) {
    const entry = all[origin];
    const count = entry && Array.isArray(entry.edits) ? entry.edits.length : 0;
    const persist = dynamic.origins.includes(origin);
    const hasPerm = grantedSet.has(origin);

    const item = document.createElement('div');
    item.className = 'item';

    const main = document.createElement('div');
    main.className = 'item-main';

    const name = document.createElement('div');
    name.className = 'item-origin';
    name.textContent = origin;
    name.title = origin;

    const meta = document.createElement('div');
    meta.className = 'item-meta';
    const bits = [pluralEdits(count), 'diperbarui ' + formatDate(entry?.updatedAt)];
    if (persist && hasPerm) bits.push('auto-apply aktif');
    else if (persist && !hasPerm) bits.push('izin dicabut');
    meta.textContent = bits.join(' · ');

    if (persist && !hasPerm) {
      const warn = document.createElement('span');
      warn.className = 'warn';
      warn.textContent = ' ⚠ izinnya sudah tidak ada';
      meta.appendChild(warn);
    }

    main.append(name, meta);

    const remove = document.createElement('button');
    remove.className = 'btn mini danger';
    remove.textContent = 'Hapus';
    remove.addEventListener('click', () => removeDomain(origin, count));

    item.append(main, remove);
    container.appendChild(item);
  }
}

async function removeDomain(origin, count) {
  const msg =
    count > 0
      ? 'Hapus ' + pluralEdits(count) + ' untuk ' + origin + ' dan cabut izinnya?'
      : 'Cabut izin akses untuk ' + origin + '?';
  if (!confirm(msg)) return;

  await unregisterOrigin(origin);
  await removeDynamicOrigin(origin);
  await deleteOriginEdits(origin);
  await removeOriginPermission(origin);

  toast('Domain ' + origin + ' dihapus.', 'good');
  await renderDomains();
  await renderStorageInfo();
}

/* ---------- Preferensi ---------- */

async function loadSettings() {
  const s = await readSettings();
  $('highlightColor').value = s.highlightColor || DEFAULT_SETTINGS.highlightColor;
  $('highlightColorText').value = s.highlightColor || DEFAULT_SETTINGS.highlightColor;
  $('highlightWidth').value = String(s.highlightWidth || DEFAULT_SETTINGS.highlightWidth);
  $('showTooltip').checked = Boolean(s.showTooltip);
  $('autoOpenPanel').checked = Boolean(s.autoOpenPanel);
  $('inlineEditOnDoubleClick').checked = Boolean(s.inlineEditOnDoubleClick);
}

async function saveSetting(patch) {
  await writeSettings(patch);
}

function wireSettings() {
  const colorPicker = $('highlightColor');
  const colorText = $('highlightColorText');

  colorPicker.addEventListener('input', () => {
    colorText.value = colorPicker.value;
    saveSetting({ highlightColor: colorPicker.value });
  });

  colorText.addEventListener('change', () => {
    const val = colorText.value.trim();
    if (!/^#[0-9a-fA-F]{6}$/.test(val)) {
      toast('Format warna harus #RRGGBB.', 'bad');
      loadSettings();
      return;
    }
    colorPicker.value = val;
    saveSetting({ highlightColor: val });
  });

  $('highlightWidth').addEventListener('change', () => {
    const raw = Number($('highlightWidth').value);
    const val = Math.min(Math.max(Number.isFinite(raw) ? Math.round(raw) : 2, 1), 6);
    $('highlightWidth').value = String(val);
    saveSetting({ highlightWidth: val });
  });

  $('showTooltip').addEventListener('change', (e) => saveSetting({ showTooltip: e.target.checked }));
  $('autoOpenPanel').addEventListener('change', (e) => saveSetting({ autoOpenPanel: e.target.checked }));
  $('inlineEditOnDoubleClick').addEventListener('change', (e) =>
    saveSetting({ inlineEditOnDoubleClick: e.target.checked })
  );
}

/* ---------- Export / Import ---------- */

function downloadJson(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function doExport() {
  const payload = await exportAll();
  const stamp = new Date().toISOString().slice(0, 10);
  downloadJson('pagesmith-' + stamp + '.json', JSON.stringify(payload, null, 2));
  toast('Data diekspor.', 'good');
}

/** mode: 'merge' | 'replace' */
function pickImportFile(mode) {
  const input = $('file-input');
  input.onchange = async () => {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;

    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      toast('Berkas itu bukan JSON yang valid.', 'bad');
      return;
    }

    if (mode === 'replace') {
      const ok = confirm(
        'Ganti SEMUA data dengan isi berkas ini?\n\nEdit, pengaturan, dan daftar domain yang sekarang akan hilang.'
      );
      if (!ok) return;
    }

    try {
      const res = await importAll(parsed, mode);
      toast(
        'Impor selesai: ' + res.importedEdits + ' edit dari ' + res.importedOrigins + ' domain.',
        'good'
      );
      await syncRegistrationsWithStorage();
      await loadSettings();
      await renderDomains();
      await renderStorageInfo();
    } catch (e) {
      toast(e && e.message ? e.message : 'Impor gagal.', 'bad');
    }
  };
  input.click();
}

/**
 * Setelah impor/ganti data, pendaftaran content script dinamis harus
 * disesuaikan lagi dengan daftar origin yang punya izin.
 */
async function syncRegistrationsWithStorage() {
  const dynamic = await readDynamic();
  const granted = new Set(await listGrantedOrigins());
  for (const origin of dynamic.origins) {
    if (granted.has(origin)) {
      try {
        await registerOrigin(origin);
      } catch {
        /* lewati origin yang gagal didaftarkan */
      }
    } else {
      await unregisterOrigin(origin);
    }
  }
}

/* ---------- Hapus data ---------- */

async function clearEdits() {
  const all = await readAllEdits();
  const origins = Object.keys(all);
  if (!origins.length) {
    toast('Belum ada edit tersimpan.', 'bad');
    return;
  }
  if (!confirm('Hapus semua edit tersimpan untuk ' + origins.length + ' domain? Izin aksesnya tetap ada.')) return;

  await clearAllEdits();
  toast('Semua edit dihapus.', 'good');
  await renderDomains();
  await renderStorageInfo();
}

async function clearEverything() {
  if (
    !confirm(
      'Hapus SEMUA data (edit, pengaturan, daftar domain) dan cabut seluruh izin akses situs?\n\nTindakan ini tidak bisa dibatalkan.'
    )
  ) {
    return;
  }

  const dynamic = await readDynamic();
  for (const origin of dynamic.origins) {
    await unregisterOrigin(origin);
    await removeOriginPermission(origin);
  }

  await clearAllEdits();
  await writeDynamic({ origins: [] });
  await writeSettings({ ...DEFAULT_SETTINGS });

  toast('Semua data dan izin sudah dihapus.', 'good');
  await loadSettings();
  await renderDomains();
  await renderStorageInfo();
}

/* ---------- Info penyimpanan ---------- */

async function renderStorageInfo() {
  try {
    const bytes = await chrome.storage.local.getBytesInUse(null);
    const kb = bytes / 1024;
    $('storage-info').textContent =
      'Penyimpanan terpakai: ' + (kb < 1024 ? kb.toFixed(1) + ' KB' : (kb / 1024).toFixed(2) + ' MB');
  } catch {
    $('storage-info').textContent = '';
  }
}

/* ---------- Pemasangan ---------- */

async function init() {
  $('version').textContent = 'Pagesmith v' + chrome.runtime.getManifest().version + ' · skema ' + SCHEMA_VERSION;

  wireSettings();
  $('btn-export').addEventListener('click', doExport);
  $('btn-import-merge').addEventListener('click', () => pickImportFile('merge'));
  $('btn-import-replace').addEventListener('click', () => pickImportFile('replace'));
  $('btn-clear-edits').addEventListener('click', clearEdits);
  $('btn-clear-all').addEventListener('click', clearEverything);

  await loadSettings();
  await renderDomains();
  await renderStorageInfo();
}

init();
