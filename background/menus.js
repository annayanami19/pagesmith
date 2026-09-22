/**
 * Context menu.
 *
 * Catatan desain: chrome.contextMenus.onClicked tidak memberi tahu elemen
 * mana yang diklik-kanan. Jadi content script memasang listener `contextmenu`
 * sendiri (lihat content/main.js) untuk mengingat target terakhir, dan menu
 * di sini hanya memicu mode pilih — content script yang memutuskan apakah
 * langsung memilih target tersimpan atau menunggu klik berikutnya.
 */

const MENU_PICK = 'psm-pick-element';
const MENU_PANEL = 'psm-toggle-panel';

/** Membuat ulang seluruh menu (removeAll dulu supaya tidak duplikat). */
export async function installMenus() {
  try {
    await chrome.contextMenus.removeAll();
  } catch {
    /* belum ada menu — abaikan */
  }

  chrome.contextMenus.create({
    id: MENU_PICK,
    title: 'Edit elemen ini (Pagesmith)',
    contexts: ['all'],
  });

  chrome.contextMenus.create({
    id: MENU_PANEL,
    title: 'Buka panel editor',
    contexts: ['all'],
  });
}

/** Menangani klik menu. `tab` bisa undefined pada konteks tertentu. */
export async function handleMenuClick(info, tab, deps) {
  const tabId = tab && tab.id;
  if (typeof tabId !== 'number') return;

  if (info.menuItemId === MENU_PICK) {
    await deps.openPanel(tabId, { pick: true });
  } else if (info.menuItemId === MENU_PANEL) {
    await deps.openPanel(tabId, { pick: false });
  }
}

export { MENU_PICK, MENU_PANEL };
