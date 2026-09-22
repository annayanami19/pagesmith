/**
 * Akses chrome.storage.local: CRUD edit per-origin, pengaturan, dan
 * pembukuan dynamic content script.
 *
 * Semua tulis lewat sanitasi + antrean serial supaya dua perubahan yang
 * hampir bersamaan tidak saling menimpa (read-modify-write race).
 */
import {
  DEFAULT_SETTINGS,
  EDIT_KINDS,
  EXPORT_APP_ID,
  LEGACY_APP_IDS,
  LIMITS,
  SCHEMA_VERSION,
  STORAGE_KEYS,
} from './constants.js';

/* ---------- Antrean serial ---------- */

let queue = Promise.resolve();

/** Menjalankan fn setelah operasi sebelumnya selesai. */
function serialize(fn) {
  const next = queue.then(() => fn());
  queue = next.catch(() => {});
  return next;
}

/* ---------- Primitif baca/tulis ---------- */

async function readKey(key, fallback) {
  const bag = await chrome.storage.local.get(key);
  const val = bag[key];
  return val === undefined ? fallback : val;
}

async function writeKey(key, value) {
  await chrome.storage.local.set({ [key]: value });
}

/* ---------- Sanitasi ---------- */

function clampStr(val, max) {
  if (typeof val !== 'string') return '';
  return val.length > max ? val.slice(0, max) : val;
}

/**
 * Memvalidasi satu EditRecord. Mengembalikan null bila tidak layak simpan —
 * lebih baik membuang satu record rusak daripada menyimpan data yang bisa
 * membuat auto-apply menulis ke elemen yang salah.
 */
export function sanitizeEdit(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const kind = EDIT_KINDS.includes(raw.kind) ? raw.kind : null;
  if (!kind) return null;

  const selector = clampStr(raw.selector, LIMITS.MAX_SELECTOR_LENGTH).trim();
  if (!selector) return null;

  const fingerprint = clampStr(raw.fingerprint, 1000);
  const attr = raw.attr === undefined || raw.attr === null ? '' : clampStr(raw.attr, LIMITS.MAX_ATTR_NAME_LENGTH);
  if (kind === 'attr' && !attr) return null;

  return {
    id: clampStr(raw.id, 64) || 'e' + Math.random().toString(36).slice(2, 10),
    selector,
    fingerprint,
    kind,
    attr,
    // Hanya kind "attr" yang mengenal mode lepas-atribut (mis. hapus `disabled`).
    remove: kind === 'attr' && raw.remove === true,
    value: clampStr(raw.value, LIMITS.MAX_VALUE_LENGTH),
    // null berarti atribut memang tidak ada sebelumnya → revert = removeAttribute
    original: raw.original === null || raw.original === undefined ? null : clampStr(raw.original, LIMITS.MAX_VALUE_LENGTH),
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
  };
}

function sanitizeEditList(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    const clean = sanitizeEdit(item);
    if (clean) out.push(clean);
    if (out.length >= LIMITS.MAX_EDITS_PER_ORIGIN) break;
  }
  return out;
}

/* ---------- Edit per-origin ---------- */

/** Membaca seluruh peta edit. Bentuk: { [origin]: { origin, updatedAt, edits } } */
export async function readAllEdits() {
  const raw = await readKey(STORAGE_KEYS.EDITS, {});
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
}

/** Membaca edit satu origin. Selalu mengembalikan bentuk lengkap. */
export async function readOriginEdits(origin) {
  const all = await readAllEdits();
  const entry = all[origin];
  if (!entry || !Array.isArray(entry.edits)) return { origin, updatedAt: 0, edits: [] };
  return { origin, updatedAt: entry.updatedAt || 0, edits: sanitizeEditList(entry.edits) };
}

/**
 * Menyimpan daftar edit satu origin. Daftar kosong = hapus entri origin itu
 * (supaya tidak ada sisa entri hampa di penyimpanan).
 */
export async function writeOriginEdits(origin, edits) {
  if (!origin) return { origin, updatedAt: 0, edits: [] };
  return serialize(async () => {
    const all = await readAllEdits();
    const clean = sanitizeEditList(edits);

    if (!clean.length) {
      delete all[origin];
    } else {
      all[origin] = { origin, updatedAt: Date.now(), edits: clean };
    }

    // Jaga jumlah origin agar tidak tumbuh tanpa batas: buang yang paling lama.
    const origins = Object.keys(all);
    if (origins.length > LIMITS.MAX_ORIGINS) {
      origins
        .sort((a, b) => (all[a].updatedAt || 0) - (all[b].updatedAt || 0))
        .slice(0, origins.length - LIMITS.MAX_ORIGINS)
        .forEach((o) => delete all[o]);
    }

    await writeKey(STORAGE_KEYS.EDITS, all);
    return all[origin] || { origin, updatedAt: 0, edits: [] };
  });
}

/** Menghapus seluruh edit satu origin. */
export async function deleteOriginEdits(origin) {
  return serialize(async () => {
    const all = await readAllEdits();
    delete all[origin];
    await writeKey(STORAGE_KEYS.EDITS, all);
  });
}

/** Menghapus semua edit semua origin. */
export async function clearAllEdits() {
  return serialize(async () => {
    await writeKey(STORAGE_KEYS.EDITS, {});
  });
}

/* ---------- Pengaturan ---------- */

export async function readSettings() {
  const raw = await readKey(STORAGE_KEYS.SETTINGS, {});
  return { ...DEFAULT_SETTINGS, ...(raw && typeof raw === 'object' ? raw : {}) };
}

export async function writeSettings(patch) {
  return serialize(async () => {
    const current = await readSettings();
    const merged = { ...current, ...(patch && typeof patch === 'object' ? patch : {}) };
    await writeKey(STORAGE_KEYS.SETTINGS, merged);
    return merged;
  });
}

/* ---------- Pembukuan dynamic content script ---------- */

/** Bentuk: { origins: string[] } — origin yang punya izin + auto-apply aktif. */
export async function readDynamic() {
  const raw = await readKey(STORAGE_KEYS.DYNAMIC, {});
  const origins = raw && Array.isArray(raw.origins) ? raw.origins.filter((o) => typeof o === 'string') : [];
  return { origins };
}

export async function writeDynamic(next) {
  const origins = Array.isArray(next?.origins) ? next.origins.filter((o) => typeof o === 'string') : [];
  await writeKey(STORAGE_KEYS.DYNAMIC, { origins });
  return { origins };
}

export async function addDynamicOrigin(origin) {
  return serialize(async () => {
    const cur = await readDynamic();
    if (!cur.origins.includes(origin)) cur.origins.push(origin);
    return writeDynamic(cur);
  });
}

export async function removeDynamicOrigin(origin) {
  return serialize(async () => {
    const cur = await readDynamic();
    return writeDynamic({ origins: cur.origins.filter((o) => o !== origin) });
  });
}

/* ---------- Export / Import ---------- */

export async function exportAll() {
  const [edits, settings, dynamic] = await Promise.all([readAllEdits(), readSettings(), readDynamic()]);
  return {
    schema: SCHEMA_VERSION,
    app: EXPORT_APP_ID,
    exportedAt: new Date().toISOString(),
    edits,
    settings,
    dynamic,
  };
}

/**
 * Mengimpor data hasil export.
 * mode 'merge' (default) menambahkan ke data yang ada; 'replace' menimpa total.
 */
export async function importAll(payload, mode = 'merge') {
  if (!payload || typeof payload !== 'object') throw new Error('Isi file tidak dikenali.');
  if (!LEGACY_APP_IDS.has(payload.app)) throw new Error('File ini bukan export Pagesmith.');
  if (typeof payload.schema !== 'number' || payload.schema > SCHEMA_VERSION) {
    throw new Error('Versi skema file tidak didukung (schema ' + payload.schema + ').');
  }
  const incoming = payload.edits && typeof payload.edits === 'object' ? payload.edits : {};

  return serialize(async () => {
    const base = mode === 'replace' ? {} : await readAllEdits();
    let importedOrigins = 0;
    let importedEdits = 0;

    for (const [origin, entry] of Object.entries(incoming)) {
      if (typeof origin !== 'string' || !entry || !Array.isArray(entry.edits)) continue;
      const clean = sanitizeEditList(entry.edits);
      if (!clean.length) continue;
      base[origin] = { origin, updatedAt: Date.now(), edits: clean };
      importedOrigins++;
      importedEdits += clean.length;
    }

    await writeKey(STORAGE_KEYS.EDITS, base);

    if (mode === 'replace') {
      const s = payload.settings && typeof payload.settings === 'object' ? payload.settings : {};
      await writeSettings(s);
      const dyn = payload.dynamic && Array.isArray(payload.dynamic.origins) ? payload.dynamic.origins : [];
      await writeDynamic({ origins: dyn });
    }

    return { importedOrigins, importedEdits, mode };
  });
}
