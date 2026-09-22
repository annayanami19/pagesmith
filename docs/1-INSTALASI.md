# 1. Instalasi

Ekstensi ini belum dipublikasikan ke Chrome Web Store. Cara memasangnya adalah sebagai **unpacked extension** — memuat folder proyek langsung ke Chrome.

---

## Prasyarat

- **Google Chrome versi 106 atau lebih baru** (atau browser berbasis Chromium seperti Edge / Brave).
  Versi 106 dibutuhkan karena ekstensi memakai `chrome.scripting.registerContentScripts()` untuk fitur simpan-per-domain.
- Tidak perlu Node.js, npm, atau build step. Folder proyek langsung bisa dimuat.

Cek versi Chrome di `chrome://version`.

---

## Langkah pemasangan

### 1. Buka halaman ekstensi

Ketik di address bar:

```
chrome://extensions
```

### 2. Nyalakan Developer mode

Saklar **Developer mode** ada di **kanan atas** halaman. Nyalakan.

Setelah menyala, muncul tiga tombol baru: *Load unpacked*, *Pack extension*, dan *Update*.

### 3. Klik "Load unpacked"

Pilih **folder** `pagesmith/` (folder yang berisi `manifest.json`).

> ⚠️ Pilih **foldernya**, bukan berkas di dalamnya. Kalau salah, Chrome akan bilang "Manifest file is missing or unreadable".

### 4. Selesai

Ikon Pagesmith muncul di daftar ekstensi. Klik ikon puzzle (🧩) di toolbar → **pin** ikon Pagesmith supaya selalu terlihat.

---

## Verifikasi pemasangan

Buka halaman web apa pun (misalnya `https://example.com`), lalu klik ikon ekstensi. Popup harus muncul dan menampilkan:

- Nama domain di bagian atas
- Angka `0` pada "edit di tab ini"
- Tombol **Buka Panel Editor** dalam keadaan aktif

Kalau tombolnya abu-abu dan tertulis "Halaman ini tidak bisa diedit", berarti halaman itu halaman internal browser (`chrome://`, `about:`, Chrome Web Store) yang memang tidak bisa diakses ekstensi.

---

## Izin: apa yang diminta dan kapan

Saat pemasangan, ekstensi ini **tidak meminta izin akses ke situs mana pun**. Ini disengaja.

| Izin | Kapan aktif |
|---|---|
| `storage` | Selalu — untuk menyimpan edit dan pengaturan. |
| `activeTab` | Hanya saat kamu mengklik ikon / menekan shortcut / memakai menu klik-kanan. |
| `scripting` | Dipakai saat menyuntikkan panel ke halaman. |
| `contextMenus` | Menambahkan menu klik-kanan. |

**Akses ke situs diminta terpisah, per domain**, dan hanya ketika kamu menekan **Simpan untuk domain ini** di popup. Chrome akan menampilkan dialog izin khusus untuk domain itu saja.

Konsekuensinya: domain yang tidak kamu simpan tidak pernah tersentuh, dan tidak ada peringatan "Baca dan ubah semua data Anda di situs web" saat pemasangan.

---

## Memperbarui setelah kode diubah

1. Buka `chrome://extensions`
2. Klik tombol **Reload** (⟳) pada kartu Pagesmith
3. **Muat ulang halaman** yang sedang diuji (F5)

Langkah 3 penting: content script yang sudah tertanam di halaman lama tidak ikut ter-update sampai halaman dimuat ulang.

---

## Menghapus

1. Buka `chrome://extensions`
2. Klik **Remove** pada kartu Pagesmith

Semua data (edit tersimpan, pengaturan, izin domain) ikut terhapus.

> Ingin menyimpan datanya dulu? Buka halaman **Pengaturan** → **Ekspor JSON** sebelum menghapus.

---

## Pemecahan masalah

### "Manifest file is missing or unreadable"

Yang dipilih bukan folder proyeknya, atau folder proyeknya salah. Pastikan ada berkas `manifest.json` langsung di dalam folder yang dipilih.

### Ikon muncul tapi panel tidak mau terbuka

1. Pastikan halaman yang dibuka adalah halaman `http://` atau `https://` biasa, bukan `chrome://` atau halaman internal browser.
2. Muat ulang halamannya, lalu coba lagi.
3. Kalau masih gagal, buka `chrome://extensions` → klik **Errors** pada kartu ekstensi untuk melihat pesan kesalahan.

### Shortcut `Alt+Shift+E` tidak berfungsi

Shortcut bisa bertabrakan dengan ekstensi lain atau dengan shortcut sistem. Periksa di `chrome://extensions/shortcuts` dan ubah bila perlu.

### Edit tersimpan tidak diterapkan saat halaman dibuka

Buka popup — kalau tertulis "izin dicabut", berarti izin akses untuk domain itu sudah tidak ada. Aktifkan ulang **Simpan untuk domain ini**.

Kalau izinnya masih ada tapi edit tetap tidak diterapkan, kemungkinan struktur halaman berubah sehingga elemennya tidak bisa diidentifikasi lagi. Buka panel editor untuk melihat laporan edit mana yang dilewati — lihat [`2-PANDUAN-PENGGUNAAN.md`](2-PANDUAN-PENGGUNAAN.md) bagian *Simpan per domain*.
