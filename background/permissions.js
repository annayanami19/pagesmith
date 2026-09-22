/**
 * Izin host opsional (optional_host_permissions).
 *
 * PENTING: chrome.permissions.request() hanya boleh dipanggil dari konteks
 * user gesture. Karena itu fungsi request di sini dipanggil LANGSUNG dari
 * handler klik di popup/options — bukan lewat perantara service worker,
 * sebab gesture tidak ikut menyeberang lewat runtime.sendMessage().
 */
import { DYNAMIC_ID_PREFIX } from './constants.js';

/** Mengambil origin dari URL halaman. '' bila bukan http/https. */
export function originFromUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.origin; // mis. "https://example.com" atau "https://example.com:8443"
  } catch {
    return '';
  }
}

/** Origin → match pattern. '' bila origin tidak valid. */
export function patternFromOrigin(origin) {
  if (!origin || typeof origin !== 'string') return '';
  if (!/^https?:\/\//.test(origin)) return '';
  return origin + '/*';
}

/** Origin → id content script dinamis yang stabil dan aman dipakai. */
export function dynamicIdForOrigin(origin) {
  let hash = 5381;
  for (let i = 0; i < origin.length; i++) {
    hash = ((hash << 5) + hash + origin.charCodeAt(i)) | 0;
  }
  const safe = origin.replace(/[^a-z0-9]+/gi, '_').slice(0, 40);
  return DYNAMIC_ID_PREFIX + safe + '_' + (hash >>> 0).toString(36);
}

/** Apakah izin untuk origin ini sudah diberikan? */
export async function hasOriginPermission(origin) {
  const pattern = patternFromOrigin(origin);
  if (!pattern) return false;
  try {
    return await chrome.permissions.contains({ origins: [pattern] });
  } catch {
    return false;
  }
}

/**
 * Meminta izin untuk satu origin. HARUS dipanggil dari user gesture.
 * Mengembalikan true bila user menyetujui.
 */
export async function requestOriginPermission(origin) {
  const pattern = patternFromOrigin(origin);
  if (!pattern) throw new Error('Origin tidak valid: ' + origin);
  return chrome.permissions.request({ origins: [pattern] });
}

/** Mencabut izin satu origin. */
export async function removeOriginPermission(origin) {
  const pattern = patternFromOrigin(origin);
  if (!pattern) return false;
  try {
    return await chrome.permissions.remove({ origins: [pattern] });
  } catch {
    return false;
  }
}

/** Daftar semua origin yang izinnya sedang diberikan ke extension ini. */
export async function listGrantedOrigins() {
  const perms = await chrome.permissions.getAll();
  const origins = [];
  for (const pattern of perms.origins || []) {
    // Buang wildcard luas; yang kita simpan hanya pola per-origin.
    if (pattern === '<all_urls>' || pattern === 'http://*/*' || pattern === 'https://*/*') continue;
    const m = /^(https?:\/\/[^/]+)\/\*$/.exec(pattern);
    if (m) origins.push(m[1]);
  }
  return origins;
}
