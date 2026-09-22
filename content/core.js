/**
 * Inti content script: identitas elemen, penerapan/pembatalan edit, dan
 * baca/tulis nilai form.
 *
 * File ini dijalankan sebagai classic script di isolated world. Ia membuat
 * satu namespace `globalThis.__PSM__` yang dipakai oleh overlay.js dan main.js.
 * Tidak ada `import`/`export` di sini — lihat docs/4-REFERENSI-TEKNIS.md.
 */
(function () {
  'use strict';

  const KEY = '__PSM__';
  const NS = (globalThis[KEY] = globalThis[KEY] || {});
  if (NS.core) return; // sudah terpasang (injeksi ganda)

  /** Atribut penanda UI milik extension sendiri. */
  const UI_ATTR = 'data-psm-ui';
  /** Awalan kelas CSS milik UI extension — dipakai untuk menyaringnya dari label. */
  const UI_CLASS_PREFIX = 'psm-';
  /** Prefix selector untuk elemen yang hidup di dalam Shadow DOM halaman. */
  const SHADOW_PREFIX = '@shadow:';

  /* ---------- Util dasar ---------- */

  function cssEscape(value) {
    const str = String(value);
    if (globalThis.CSS && typeof globalThis.CSS.escape === 'function') return globalThis.CSS.escape(str);
    return str.replace(/[^a-zA-Z0-9_-]/g, (ch) => '\\' + ch);
  }

  /** Root non-document (ShadowRoot) tempat elemen berada, atau null. */
  function shadowRootOf(el) {
    try {
      const root = el.getRootNode();
      return root && root.nodeType === 11 ? root : null;
    } catch {
      return null;
    }
  }

  /** Benar bila node ini bagian dari UI extension sendiri. */
  function isOurNode(node) {
    if (!node) return false;
    if (node === NS.uiRoot) return true;
    if (node.nodeType === 1 && node.hasAttribute && node.hasAttribute(UI_ATTR)) return true;
    try {
      return Boolean(NS.uiRoot) && node.getRootNode() === NS.uiRoot;
    } catch {
      return false;
    }
  }

  /* ---------- Selector ---------- */

  function queryIn(root, selector) {
    try {
      return root.querySelectorAll(selector);
    } catch {
      return null; // selector tidak valid
    }
  }

  function isUniqueIn(root, selector) {
    const found = queryIn(root, selector);
    return Boolean(found && found.length === 1);
  }

  /**
   * Membangun CSS selector yang menunjuk tepat satu elemen.
   *
   * Strategi: pakai #id bila unik; kalau tidak, susun jalur dari elemen ke
   * atas dengan :nth-of-type hanya saat memang ada saudara setag. Berhenti
   * begitu selector sudah unik. Mengembalikan '' bila tidak berhasil —
   * pemanggil harus memperlakukan ini sebagai "tidak bisa disimpan".
   */
  function buildSelector(el) {
    if (!(el instanceof Element)) return '';

    const shadow = shadowRootOf(el);
    const root = shadow || el.ownerDocument || document;
    const prefix = shadow ? SHADOW_PREFIX : '';

    if (!shadow) {
      if (el === document.documentElement) return 'html';
      if (el === document.body) return 'body';
    }

    if (el.id) {
      const byId = '#' + cssEscape(el.id);
      if (isUniqueIn(root, byId)) return prefix + byId;
    }

    const parts = [];
    let node = el;
    let depth = 0;

    while (node && node.nodeType === 1 && depth < 15) {
      if (!shadow && node === document.documentElement) break;

      if (node.id) {
        const byId = '#' + cssEscape(node.id);
        if (isUniqueIn(root, byId)) {
          parts.unshift(byId);
          const candidate = parts.join(' > ');
          return isUniqueIn(root, candidate) ? prefix + candidate : prefix + candidate;
        }
      }

      let part = node.tagName.toLowerCase();
      const parent = node.parentElement;
      if (parent) {
        const sameTag = [];
        for (const child of parent.children) {
          if (child.tagName === node.tagName) sameTag.push(child);
        }
        if (sameTag.length > 1) {
          part += ':nth-of-type(' + (sameTag.indexOf(node) + 1) + ')';
        }
      }

      parts.unshift(part);
      const candidate = parts.join(' > ');
      if (isUniqueIn(root, candidate)) return prefix + candidate;

      node = parent;
      depth++;
    }

    const fallback = parts.join(' > ');
    return isUniqueIn(root, fallback) ? prefix + fallback : '';
  }

  /**
   * Mengubah selector menjadi elemen.
   * Selector ber-prefix `@shadow:` tidak bisa diselesaikan dari document —
   * dikembalikan null supaya auto-apply melaporkannya sebagai gagal, bukan
   * menulis ke elemen yang salah.
   */
  function resolveElement(selector) {
    if (typeof selector !== 'string' || !selector) return null;
    if (selector.startsWith(SHADOW_PREFIX)) return null;
    const found = queryIn(document, selector);
    if (!found || found.length !== 1) return null;
    return found[0] instanceof Element ? found[0] : null;
  }

  /* ---------- Fingerprint ---------- */

  /**
   * Sidik jari identitas elemen yang stabil terhadap perubahan isi.
   * Sengaja TIDAK memuat textContent: yang menjaga kesesuaian nilai adalah
   * pembandingan `original`, sedangkan fingerprint menjaga identitas elemen.
   */
  function fingerprintOf(el) {
    if (!(el instanceof Element)) return '';
    return JSON.stringify([
      el.tagName,
      el.id || '',
      Array.from(el.classList).sort().join(' '),
      el.getAttribute('name') || '',
      el.getAttribute('type') || '',
      el.getAttribute('role') || '',
    ]);
  }

  /* ---------- Deskripsi manusiawi ---------- */

  function describeElement(el) {
    if (!(el instanceof Element)) return 'Elemen';
    let out = el.tagName.toLowerCase();
    if (el.id) out += '#' + el.id;
    const cls = Array.from(el.classList)
      .filter((c) => !c.startsWith(UI_CLASS_PREFIX))
      .slice(0, 3);
    if (cls.length) out += '.' + cls.join('.');
    return out.slice(0, 160);
  }

  /** Label singkat untuk daftar riwayat. */
  function labelFor(el) {
    if (!(el instanceof Element)) return 'Elemen';
    const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60);
    const desc = describeElement(el);
    return text ? desc + ' — "' + text + '"' : desc;
  }

  /* ---------- Kontrol form ---------- */

  function isCheckable(el) {
    return el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio');
  }

  function isControl(el) {
    return (
      el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement
    );
  }

  /** Membaca nilai kontrol apa adanya. null bila bukan kontrol yang didukung. */
  function readControlValue(el) {
    if (!isControl(el)) return null;
    if (isCheckable(el)) return String(el.checked);
    if (el instanceof HTMLSelectElement && el.multiple) return null;
    return el.value;
  }

  /** Apakah kontrol ini bisa diedit? */
  function isControlEditable(el) {
    if (!isControl(el)) return false;
    if (el.disabled) return false;
    if ('readOnly' in el && el.readOnly) return false;
    if (el instanceof HTMLInputElement && el.type === 'file') return false;
    if (el instanceof HTMLSelectElement && el.multiple) return false;
    return true;
  }

  /**
   * Menulis nilai ke kontrol form.
   *
   * Memakai prototype setter milik browser, bukan `el.value = x` langsung.
   * Alasannya: React dan Vue memasang setter sendiri di instance elemen dan
   * melacak nilai terakhir yang mereka tulis. Menulis lewat prototype
   * membuat pelacak itu melihat perubahan sebagai nilai baru, sehingga
   * framework ikut memperbarui state-nya.
   * Teknik ini sama dengan yang dipakai qa-data-generator/src/autofill/fill.ts.
   */
  function writeControlValue(el, raw) {
    if (!isControl(el)) return { ok: false, reason: 'Elemen ini bukan kontrol form.' };
    if (!isControlEditable(el)) return { ok: false, reason: 'Kontrol tidak dapat diedit (disabled/readonly).' };

    if (isCheckable(el)) {
      const next = raw === 'true' || raw === '1' || raw === 'on' || raw === 'ya';
      try {
        const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked');
        if (desc && desc.set) desc.set.call(el, next);
        else el.checked = next;
      } catch {
        return { ok: false, reason: 'Gagal menulis properti checked.' };
      }
      if (el.checked !== next) return { ok: false, reason: 'Browser menolak nilai tersebut.' };
      fireValueEvents(el);
      return { ok: true };
    }

    const proto =
      el instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLSelectElement.prototype;

    let target = raw;

    // Select: bila nilai persis tidak ada, coba cocokkan lewat label opsi.
    if (el instanceof HTMLSelectElement) {
      const options = Array.from(el.options);
      const exact = options.find((o) => o.value === raw);
      if (!exact) {
        const norm = (s) => String(s).trim().toLowerCase();
        const byLabel = options.filter((o) => norm(o.label) === norm(raw) || norm(o.value) === norm(raw));
        if (byLabel.length === 1) target = byLabel[0].value;
      }
    }

    try {
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) desc.set.call(el, target);
      else el.value = target;
    } catch {
      return { ok: false, reason: 'Gagal menulis properti value.' };
    }

    if (el.value !== target) {
      return {
        ok: false,
        reason:
          el instanceof HTMLSelectElement
            ? 'Nilai itu bukan salah satu opsi pada select ini.'
            : 'Browser menolak format nilai tersebut (mis. tanggal/number tidak valid).',
      };
    }

    fireValueEvents(el);
    return { ok: true };
  }

  /** Mengirim event sintetis supaya framework & listener halaman ikut tahu. */
  function fireValueEvents(el) {
    try {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } catch {
      /* event tidak kritis */
    }
  }

  /* ---------- Snapshot nilai asli ---------- */

  /**
   * Mengambil nilai asli sebelum diedit, untuk dipakai saat revert dan
   * sebagai prasyarat validasi saat auto-apply.
   */
  function snapshotOriginal(el, kind, attr) {
    if (kind === 'text') return el.textContent || '';
    if (kind === 'attr') return el.getAttribute(attr); // null = atribut memang tidak ada
    if (kind === 'value') return readControlValue(el);
    if (kind === 'visibility') {
      return JSON.stringify({
        v: el.style.getPropertyValue('display'),
        p: el.style.getPropertyPriority('display'),
      });
    }
    return null;
  }

  /* ---------- Validasi & penerapan ---------- */

  /**
   * Memastikan elemen masih elemen yang sama DAN nilainya masih nilai asli
   * sebelum ditimpa. Ini yang mencegah ekstensi menulis ke elemen yang salah
   * ketika struktur halaman berubah.
   */
  function validateEdit(el, record) {
    if (!(el instanceof Element)) return { ok: false, reason: 'Elemen tidak ditemukan.' };
    if (!el.isConnected) return { ok: false, reason: 'Elemen sudah tidak ada di halaman.' };

    if (record.fingerprint && fingerprintOf(el) !== record.fingerprint) {
      return { ok: false, reason: 'Elemen sudah berubah bentuk.' };
    }

    const original = record.original;

    if (record.kind === 'text') {
      if ((el.textContent || '') !== original) return { ok: false, reason: 'Teks sudah berbeda dari saat disimpan.' };
      return { ok: true };
    }

    if (record.kind === 'attr') {
      // `original` selalu berarti "kondisi SEBELUM edit" — termasuk untuk edit
      // yang melepas atribut, di mana kondisi aslinya adalah atribut masih ada.
      if (el.getAttribute(record.attr) !== original) {
        return { ok: false, reason: 'Atribut ' + record.attr + ' sudah berbeda.' };
      }
      return { ok: true };
    }

    if (record.kind === 'value') {
      if (!isControl(el)) return { ok: false, reason: 'Bukan kontrol form.' };
      if (readControlValue(el) !== original) return { ok: false, reason: 'Nilai sudah berbeda.' };
      return { ok: true };
    }

    if (record.kind === 'visibility') return { ok: true };

    return { ok: false, reason: 'Jenis edit tidak dikenal: ' + record.kind };
  }

  /**
   * Menerapkan satu edit ke elemen. Mengembalikan { ok, reason }.
   *
   * Untuk kind "attr", `record.remove === true` berarti atribut harus DILEPAS,
   * bukan diisi nilai kosong. Perbedaannya penting pada atribut boolean
   * (disabled, checked, hidden, required): kehadirannya yang bermakna, jadi
   * `disabled=""` tetap membuat elemen nonaktif, sedangkan melepasnya
   * mengaktifkan kembali.
   */
  function applyEdit(el, record) {
    if (record.kind === 'text') {
      try {
        el.textContent = record.value;
        return { ok: true };
      } catch {
        return { ok: false, reason: 'Gagal menulis teks.' };
      }
    }

    if (record.kind === 'attr') {
      try {
        if (record.remove) el.removeAttribute(record.attr);
        else el.setAttribute(record.attr, record.value);
        return { ok: true };
      } catch {
        return { ok: false, reason: 'Nama atau nilai atribut tidak valid.' };
      }
    }

    if (record.kind === 'value') {
      return writeControlValue(el, record.value);
    }

    if (record.kind === 'visibility') {
      try {
        if (record.value === 'hidden') el.style.setProperty('display', 'none', 'important');
        else {
          const orig = parseDisplayOriginal(record.original);
          if (orig.v) el.style.setProperty('display', orig.v, orig.p || '');
          else el.style.removeProperty('display');
        }
        return { ok: true };
      } catch {
        return { ok: false, reason: 'Gagal mengubah tampilan elemen.' };
      }
    }

    return { ok: false, reason: 'Jenis edit tidak dikenal.' };
  }

  /** Mengembalikan elemen ke nilai aslinya. */
  function revertEdit(el, record) {
    if (record.kind === 'text') {
      try {
        el.textContent = record.original || '';
        return { ok: true };
      } catch {
        return { ok: false, reason: 'Gagal mengembalikan teks.' };
      }
    }

    if (record.kind === 'attr') {
      try {
        if (record.original === null) el.removeAttribute(record.attr);
        else el.setAttribute(record.attr, record.original);
        return { ok: true };
      } catch {
        return { ok: false, reason: 'Gagal mengembalikan atribut.' };
      }
    }

    if (record.kind === 'value') {
      if (record.original === null) return { ok: false, reason: 'Nilai asli tidak tercatat.' };
      return writeControlValue(el, record.original);
    }

    if (record.kind === 'visibility') {
      const orig = parseDisplayOriginal(record.original);
      try {
        if (orig.v) el.style.setProperty('display', orig.v, orig.p || '');
        else el.style.removeProperty('display');
        return { ok: true };
      } catch {
        return { ok: false, reason: 'Gagal mengembalikan tampilan.' };
      }
    }

    return { ok: false, reason: 'Jenis edit tidak dikenal.' };
  }

  function parseDisplayOriginal(raw) {
    try {
      const parsed = JSON.parse(raw || '{}');
      return { v: typeof parsed.v === 'string' ? parsed.v : '', p: typeof parsed.p === 'string' ? parsed.p : '' };
    } catch {
      return { v: '', p: '' };
    }
  }

  /* ---------- Kunci dedupe ---------- */

  /**
   * Kunci unik sebuah edit dalam satu origin. Dua edit dengan kunci sama
   * dianggap edit yang sama (yang terbaru menang), sehingga mengedit satu
   * atribut dua kali tidak menumpuk jadi dua baris riwayat.
   */
  function editKey(record) {
    return [record.kind, record.selector, record.attr || ''].join('|');
  }

  /** Membersihkan record dari properti sementara sebelum dikirim/disimpan. */
  function toRecord(partial) {
    const kind = partial.kind;
    return {
      id: partial.id || 'e' + Math.random().toString(36).slice(2, 10),
      selector: partial.selector || '',
      fingerprint: partial.fingerprint || '',
      kind,
      attr: partial.attr || '',
      // Hanya kind "attr" yang mengenal mode lepas-atribut.
      remove: kind === 'attr' && partial.remove === true,
      value: partial.value === undefined || partial.value === null ? '' : String(partial.value),
      original: partial.original === undefined ? null : partial.original,
      createdAt: partial.createdAt || Date.now(),
    };
  }

  /* ---------- Ekspor ke namespace ---------- */

  NS.core = Object.freeze({
    UI_ATTR,
    UI_CLASS_PREFIX,
    SHADOW_PREFIX,
    cssEscape,
    shadowRootOf,
    isOurNode,
    buildSelector,
    resolveElement,
    fingerprintOf,
    describeElement,
    labelFor,
    isControl,
    isCheckable,
    isControlEditable,
    readControlValue,
    writeControlValue,
    snapshotOriginal,
    validateEdit,
    applyEdit,
    revertEdit,
    editKey,
    toRecord,
  });
})();
