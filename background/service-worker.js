/**
 * Service worker: router pesan, command keyboard, context menu, badge.
 *
 * Prinsip: service worker TIDAK menyimpan state di memori. MV3 mematikan SW
 * kapan saja, jadi setiap handler membaca ulang dari chrome.storage.
 */
import { MSG, STORAGE_KEYS } from './constants.js';
import {
  addDynamicOrigin,
  readAllEdits,
  readDynamic,
  readSettings,
  removeDynamicOrigin,
  writeOriginEdits,
} from './storage.js';
import { hasOriginPermission, listGrantedOrigins, originFromUrl } from './permissions.js';
import {
  ensureInjected,
  listRegisteredIds,
  registerOrigin,
  sendToTab,
  syncRegistrations,
  unregisterOrigin,
} from './injection.js';
import { handleMenuClick, installMenus } from './menus.js';

/* ---------- Badge ---------- */

/** Menampilkan jumlah edit di badge icon untuk tab tertentu. */
async function setBadge(tabId, count) {
  const text = count > 0 ? String(count > 999 ? '999+' : count) : '';
  try {
    await chrome.action.setBadgeText({ tabId, text });
    if (text) {
      await chrome.action.setBadgeBackgroundColor({ tabId, color: '#3b82f6' });
    }
  } catch {
    /* tab sudah hilang — abaikan */
  }
}

/**
 * Menghitung ulang badge sebuah tab.
 * Prioritas: state dari content script (paling akurat). Bila content script
 * belum terpasang, pakai jumlah edit tersimpan untuk origin itu.
 */
async function refreshBadge(tabId, url) {
  const state = await sendToTab(tabId, { type: MSG.CS_GET_STATE });
  if (state && state.ok) {
    await setBadge(tabId, state.editCount || 0);
    return;
  }

  const origin = originFromUrl(url || '');
  if (!origin) {
    await setBadge(tabId, 0);
    return;
  }
  const all = await readAllEdits();
  const entry = all[origin];
  await setBadge(tabId, entry && Array.isArray(entry.edits) ? entry.edits.length : 0);
}

/* ---------- Aksi pada tab ---------- */

/** Memastikan content script ada, lalu mengirim pesan. */
async function withContentScript(tabId, message) {
  const ready = await ensureInjected(tabId);
  if (!ready) return { ok: false, reason: 'inject-failed' };
  const res = await sendToTab(tabId, message);
  return res || { ok: false, reason: 'no-response' };
}

/**
 * Membuka panel editor. `pick: true` sekaligus mengaktifkan mode pilih.
 */
async function openPanel(tabId, opts = {}) {
  const msg = opts.pick ? MSG.CS_START_PICK : MSG.CS_OPEN_PANEL;
  const res = await withContentScript(tabId, { type: msg });
  await refreshBadge(tabId, opts.url);
  return res;
}

/* ---------- Pesan dari popup / options ---------- */

async function handleMessage(message, sender) {
  const tabId = message && typeof message.tabId === 'number' ? message.tabId : sender?.tab?.id;

  switch (message?.type) {
    case MSG.GET_TAB_STATE: {
      const origin = originFromUrl(message.url || '');
      const [settings, dynamic, all] = await Promise.all([readSettings(), readDynamic(), readAllEdits()]);
      const entry = origin ? all[origin] : null;
      const live = typeof tabId === 'number' ? await sendToTab(tabId, { type: MSG.CS_GET_STATE }) : null;
      return {
        ok: true,
        origin,
        injected: Boolean(live && live.ok),
        editCount: live && live.ok ? live.editCount : entry && Array.isArray(entry.edits) ? entry.edits.length : 0,
        savedCount: entry && Array.isArray(entry.edits) ? entry.edits.length : 0,
        persist: Boolean(origin && dynamic.origins.includes(origin)),
        canPersist: Boolean(origin),
        settings,
      };
    }

    case MSG.TOGGLE_PICKER: {
      if (typeof tabId !== 'number') return { ok: false, reason: 'no-tab' };
      const res = await withContentScript(tabId, { type: MSG.CS_TOGGLE_PICKER });
      return res;
    }

    case MSG.OPEN_PANEL: {
      if (typeof tabId !== 'number') return { ok: false, reason: 'no-tab' };
      return openPanel(tabId, { pick: Boolean(message.pick), url: message.url });
    }

    case MSG.PICK_ELEMENT: {
      if (typeof tabId !== 'number') return { ok: false, reason: 'no-tab' };
      return openPanel(tabId, { pick: true, url: message.url });
    }

    case MSG.RESET_TAB: {
      if (typeof tabId !== 'number') return { ok: false, reason: 'no-tab' };
      const origin = originFromUrl(message.url || '');
      if (origin) await writeOriginEdits(origin, []);
      const res = await withContentScript(tabId, { type: MSG.CS_RESET_ALL });
      await setBadge(tabId, 0);
      return res;
    }

    /**
     * Mengaktifkan/mematikan persist untuk satu origin.
     * CATATAN: izin host HARUS sudah diminta dari popup (butuh user gesture);
     * handler ini hanya mencatat + mendaftarkan content script.
     */
    case MSG.SET_PERSIST: {
      const origin = originFromUrl(message.origin || '');
      if (!origin) return { ok: false, reason: 'bad-origin' };

      if (message.enabled) {
        const granted = await hasOriginPermission(origin);
        if (!granted) return { ok: false, reason: 'no-permission' };
        await registerOrigin(origin);
        await addDynamicOrigin(origin);
      } else {
        await unregisterOrigin(origin);
        await removeDynamicOrigin(origin);
      }

      return { ok: true, origin, persist: Boolean(message.enabled) };
    }

    case MSG.GET_PERSIST_STATE: {
      const [dynamic, granted] = await Promise.all([readDynamic(), listGrantedOrigins()]);
      const grantedSet = new Set(granted);
      return {
        ok: true,
        origins: dynamic.origins.map((origin) => ({ origin, granted: grantedSet.has(origin) })),
        registered: await listRegisteredIds(),
      };
    }

    case MSG.CS_EDITS_CHANGED: {
      // Dari content script: perbarui badge tab yang bersangkutan.
      const from = sender?.tab?.id;
      if (typeof from === 'number') {
        await setBadge(from, message.count || 0);
      }
      return { ok: true };
    }

    case MSG.CS_STATE: {
      const from = sender?.tab?.id;
      if (typeof from === 'number') await setBadge(from, message.count || 0);
      return { ok: true };
    }

    default:
      return { ok: false, reason: 'unknown-message' };
  }
}

/* ---------- Pemasangan listener ---------- */

chrome.runtime.onInstalled.addListener(async () => {
  await installMenus();
  const [dynamic, granted] = await Promise.all([readDynamic(), listGrantedOrigins()]);
  await syncRegistrations(dynamic.origins, granted);
});

chrome.runtime.onStartup.addListener(async () => {
  const [dynamic, granted] = await Promise.all([readDynamic(), listGrantedOrigins()]);
  await syncRegistrations(dynamic.origins, granted);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then((res) => sendResponse(res))
    .catch((e) => {
      console.warn('[PSM] handler error:', e && e.message ? e.message : e);
      sendResponse({ ok: false, reason: 'error', message: e && e.message ? e.message : String(e) });
    });
  return true; // kanal async tetap terbuka
});

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || typeof tab.id !== 'number') return;

  if (command === 'toggle-picker') {
    await withContentScript(tab.id, { type: MSG.CS_TOGGLE_PICKER });
  } else if (command === 'toggle-panel') {
    await openPanel(tab.id, { pick: false, url: tab.url });
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  handleMenuClick(info, tab, { openPanel: (tabId, opts) => openPanel(tabId, { ...opts, url: tab && tab.url }) }).catch(
    (e) => console.warn('[PSM] context menu error:', e && e.message ? e.message : e)
  );
});

// Badge dihitung ulang saat tab selesai dimuat atau dipindah ke depan.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    refreshBadge(tabId, tab && tab.url).catch(() => {});
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    await refreshBadge(tabId, tab && tab.url);
  } catch {
    /* tab hilang — abaikan */
  }
});

// Izin dicabut dari luar (mis. lewat chrome://extensions) → bersihkan pendaftaran.
chrome.permissions.onRemoved.addListener(async () => {
  const [dynamic, granted] = await Promise.all([readDynamic(), listGrantedOrigins()]);
  const { removed } = await syncRegistrations(dynamic.origins, granted);
  for (const origin of removed) await removeDynamicOrigin(origin);
});

// Perubahan penyimpanan edit → segarkan badge tab aktif.
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local' || !changes[STORAGE_KEYS.EDITS]) return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && typeof tab.id === 'number') {
    refreshBadge(tab.id, tab.url).catch(() => {});
  }
});
