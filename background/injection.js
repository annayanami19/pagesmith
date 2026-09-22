/**
 * Injeksi content script dan pengelolaan pendaftaran dinamis.
 *
 * Dua jalur:
 *  1. On-demand (klik icon / shortcut / context menu) — pakai activeTab.
 *  2. Persist per-origin — butuh host permission untuk origin itu, lalu
 *     content script didaftarkan permanen dan jalan otomatis tiap halaman
 *     origin itu dibuka.
 */
import { CONTENT_FILES, DYNAMIC_ID_PREFIX, MSG } from './constants.js';
import { dynamicIdForOrigin } from './permissions.js';

/** Benar bila tabId adalah tab web yang bisa disuntik. */
export function isInjectable(tabId) {
  return typeof tabId === 'number' && tabId >= 0;
}

/**
 * Mengirim pesan ke content script. Mengembalikan null bila content script
 * belum ada / belum siap — bukan melempar, karena "belum ada" itu kondisi
 * normal yang ditangani pemanggil.
 */
export async function sendToTab(tabId, message) {
  if (!isInjectable(tabId)) return null;
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch {
    return null;
  }
}

/** Apakah content script sudah aktif di tab ini? */
export async function isInjected(tabId) {
  const res = await sendToTab(tabId, { type: MSG.CS_GET_STATE });
  return Boolean(res && res.ok);
}

/**
 * Memastikan content script terpasang di tab ini, lalu mengirim pesan.
 * Idempotent: content script sendiri yang menolak dipasang dua kali.
 */
export async function ensureInjected(tabId) {
  if (!isInjectable(tabId)) return false;
  if (await isInjected(tabId)) return true;

  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_FILES });
  } catch (e) {
    console.warn('[PSM] inject gagal:', e && e.message ? e.message : e);
    return false;
  }
  return isInjected(tabId);
}

/** Mendaftarkan content script permanen untuk satu origin. */
export async function registerOrigin(origin) {
  const id = dynamicIdForOrigin(origin);
  const matches = [origin + '/*'];

  // Idempotent: buang dulu kalau sudah ada, supaya pendaftaran ulang bersih.
  await unregisterOrigin(origin);

  await chrome.scripting.registerContentScripts([
    {
      id,
      matches,
      js: CONTENT_FILES,
      run_at: 'document_start',
      allFrames: false,
      persistAcrossSessions: true,
    },
  ]);
  return id;
}

/** Mencabut pendaftaran content script permanen satu origin. */
export async function unregisterOrigin(origin) {
  const id = dynamicIdForOrigin(origin);
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [id] });
    return true;
  } catch {
    // Belum terdaftar — bukan kesalahan.
    return false;
  }
}

/** Daftar id content script dinamis milik extension ini. */
export async function listRegisteredIds() {
  try {
    const scripts = await chrome.scripting.getRegisteredContentScripts();
    return scripts.map((s) => s.id).filter((id) => id.startsWith(DYNAMIC_ID_PREFIX));
  } catch {
    return [];
  }
}

/**
 * Menyinkronkan pendaftaran dinamis dengan daftar origin yang sebenarnya
 * masih punya izin. Dipanggil saat service worker start / setelah izin dicabut
 * supaya tidak ada pendaftaran yatim.
 */
export async function syncRegistrations(desiredOrigins, grantedOrigins) {
  const granted = new Set(grantedOrigins);
  const removed = [];

  for (const origin of desiredOrigins) {
    if (granted.has(origin)) {
      try {
        await registerOrigin(origin);
      } catch (e) {
        console.warn('[PSM] register gagal untuk', origin, e && e.message ? e.message : e);
      }
    } else {
      // Punya catatan persist tapi izinnya sudah hilang → bersihkan.
      await unregisterOrigin(origin);
      removed.push(origin);
    }
  }

  // Buang pendaftaran yang originnya tidak lagi diminta.
  const desired = new Set(desiredOrigins);
  const registeredIds = await listRegisteredIds();
  const orphanIds = registeredIds.filter((id) => {
    return !desiredOrigins.some((o) => dynamicIdForOrigin(o) === id) && !desired.has(id);
  });
  if (orphanIds.length) {
    try {
      await chrome.scripting.unregisterContentScripts({ ids: orphanIds });
    } catch {
      /* abaikan */
    }
  }

  return { removed };
}
