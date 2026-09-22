/**
 * Konstanta bersama untuk seluruh extension.
 * Dimodul ini tidak ada akses ke chrome.* — murni data, supaya bisa
 * diimport dari service worker, popup, maupun halaman options.
 */

/** Versi skema data yang disimpan. Naikkan bila bentuk EditRecord berubah. */
export const SCHEMA_VERSION = 1;

/**
 * Penanda format berkas export.
 *
 * `EXPORT_APP_ID` adalah yang ditulis sekarang. `LEGACY_APP_IDS` memuat id
 * lama dari masa sebelum ekstensi ini bernama Pagesmith — berkas export yang
 * dibuat saat itu tetap harus bisa diimpor, jadi penerimaan impor mencakup
 * keduanya.
 */
export const EXPORT_APP_ID = 'pagesmith';
export const LEGACY_APP_IDS = new Set([EXPORT_APP_ID, 'html-value-editor']);

/** Kunci penyimpanan di chrome.storage.local. Semua ber-prefix `psm_`. */
export const STORAGE_KEYS = {
  EDITS: 'psm_edits',
  SETTINGS: 'psm_settings',
  DYNAMIC: 'psm_dynamic',
};

/**
 * Urutan file content script PENTING — dieksekusi berurutan dalam satu
 * isolated world yang sama, jadi core.js harus lebih dulu.
 */
export const CONTENT_FILES = ['content/core.js', 'content/overlay.js', 'content/main.js'];

/** Prefix id untuk chrome.scripting.registerContentScripts(). */
export const DYNAMIC_ID_PREFIX = 'psm_';

/** Jenis edit yang didukung. */
export const EDIT_KINDS = ['text', 'attr', 'value', 'visibility'];

/** Atribut internal extension — tidak pernah ditampilkan di panel atribut. */
export const INTERNAL_ATTRS = ['data-psm-hidden', 'data-psm-id'];

/** Pesan dari popup / options ke service worker. */
export const MSG = {
  // popup/options → service worker
  GET_TAB_STATE: 'GET_TAB_STATE',
  TOGGLE_PICKER: 'TOGGLE_PICKER',
  OPEN_PANEL: 'OPEN_PANEL',
  RESET_TAB: 'RESET_TAB',
  SET_PERSIST: 'SET_PERSIST',
  GET_PERSIST_STATE: 'GET_PERSIST_STATE',
  PICK_ELEMENT: 'PICK_ELEMENT',

  // service worker → content script
  CS_GET_STATE: 'CS_GET_STATE',
  CS_TOGGLE_PICKER: 'CS_TOGGLE_PICKER',
  CS_OPEN_PANEL: 'CS_OPEN_PANEL',
  CS_CLOSE_PANEL: 'CS_CLOSE_PANEL',
  CS_RESET_ALL: 'CS_RESET_ALL',
  CS_PERSIST_NOW: 'CS_PERSIST_NOW',
  CS_START_PICK: 'CS_START_PICK',

  // content script → service worker
  CS_EDITS_CHANGED: 'CS_EDITS_CHANGED',
  CS_STATE: 'CS_STATE',
};

/** Pengaturan default. Dibekukan supaya tidak sengaja termutasi. */
export const DEFAULT_SETTINGS = Object.freeze({
  highlightColor: '#3b82f6',
  highlightWidth: 2,
  showTooltip: true,
  autoOpenPanel: true,
  panelSide: 'right',
  inlineEditOnDoubleClick: true,
  dimOthers: false,
});

/** Batas ukuran supaya data tidak membengkak tanpa kendali. */
export const LIMITS = {
  MAX_EDITS_PER_ORIGIN: 500,
  MAX_ORIGINS: 200,
  MAX_VALUE_LENGTH: 20000,
  MAX_SELECTOR_LENGTH: 2000,
  MAX_ATTR_NAME_LENGTH: 200,
};

/** Nama pesan yang boleh dikirim ke content script (dipakai untuk validasi). */
export const CS_BOUND_MSG = new Set([
  MSG.CS_GET_STATE,
  MSG.CS_TOGGLE_PICKER,
  MSG.CS_OPEN_PANEL,
  MSG.CS_CLOSE_PANEL,
  MSG.CS_RESET_ALL,
  MSG.CS_PERSIST_NOW,
  MSG.CS_START_PICK,
]);
