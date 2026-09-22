# Pagesmith

Ekstensi Chrome untuk **mengubah teks, atribut, dan nilai form di halaman web tanpa membuka Inspect Element**.

Rasanya seperti panel *Elements* di DevTools, tapi cukup klik elemennya langsung di halaman — lalu edit dari panel yang muncul.

> 📦 **Ini folder distribusi.** Isinya hanya berkas yang dibutuhkan browser untuk menjalankan ekstensi, plus panduan pengguna. Folder ini siap dipasang langsung atau dikemas untuk Chrome Web Store.

---

## Pasang dalam 4 langkah

1. Buka `chrome://extensions`
2. Nyalakan **Developer mode** (saklar di kanan atas)
3. Klik **Load unpacked**, pilih **folder ini**
4. Ikon ekstensi muncul di toolbar — klik ikon puzzle (🧩) lalu **pin** supaya selalu terlihat

Butuh Chrome **versi 106 atau lebih baru**.

Panduan lengkap: [`docs/1-INSTALASI.md`](docs/1-INSTALASI.md)

---

## Cara pakai singkat

1. Buka halaman web apa pun
2. Klik ikon ekstensi → **Buka Panel Editor**
3. Klik **Pilih Elemen** (atau tekan `Alt+Shift+E`)
4. Arahkan kursor ke elemen yang mau diubah → klik
5. Edit lewat tab **Teks** / **Atribut** / **Nilai**, lalu klik **Terapkan**

Edit bersifat **sekali pakai** — hilang begitu halaman dimuat ulang. Mau permanen? Aktifkan **Simpan untuk domain ini** di popup.

Panduan lengkap semua fitur: [`docs/2-PANDUAN-PENGGUNAAN.md`](docs/2-PANDUAN-PENGGUNAAN.md)

---

## Fitur

| Fitur | Keterangan |
|---|---|
| 🎯 **Pilih dengan klik** | Hover menampilkan highlight + tooltip selector, klik untuk memilih. |
| ✏️ **Edit langsung (klik dua kali)** | Klik dua kali pada teks untuk mengeditnya di tempat. Enter simpan, Esc batal, Shift+Enter baris baru. |
| 📝 **Tab Teks** | Ubah isi teks elemen. |
| 🏷️ **Tab Atribut** | Lihat semua atribut — ubah, hapus, atau tambah atribut baru. |
| 🔢 **Tab Nilai** | Isi nilai `input`, `textarea`, `select`, `checkbox`, `radio`. Framework seperti React & Vue ikut mendeteksi perubahannya. |
| 👻 **Sembunyikan elemen** | Sembunyikan / tampilkan tanpa merusak style aslinya. |
| 🕘 **Riwayat + Undo/Redo** | Semua edit tercatat, bisa dibatalkan satu per satu atau sekaligus. |
| 💾 **Simpan per domain** | Aktifkan sekali → edit otomatis diterapkan lagi tiap domain itu dibuka. |
| 📤 **Export / Import** | Cadangkan seluruh edit & pengaturan ke satu berkas JSON. |
| ⌨️ **Shortcut** | `Alt+Shift+E` mode pilih · `Alt+Shift+D` panel editor. |

---

## Izin yang diminta

Ekstensi ini sengaja dirancang agar **tidak meminta izin luas saat dipasang**:

| Izin | Kenapa |
|---|---|
| `storage` | Menyimpan edit, pengaturan, dan daftar domain. |
| `activeTab` | Mengakses tab aktif **hanya saat kamu memicu ekstensi**. Tidak memunculkan peringatan izin saat pemasangan. |
| `scripting` | Menyuntikkan panel editor ke halaman. |
| `contextMenus` | Menambah menu klik-kanan "Edit elemen ini". |

**Akses situs diminta per domain**, hanya ketika kamu menekan **Simpan untuk domain ini** — bukan saat pemasangan. Domain yang tidak kamu pakai tidak pernah tersentuh.

Privasi: ekstensi ini **100% offline**. Tidak ada permintaan jaringan, tidak ada telemetri, tidak ada kode remote. Semua data tersimpan lokal di browser kamu.

---

## Batasan yang diketahui

- **Hanya frame utama.** Elemen di dalam `<iframe>` lintas-origin belum didukung.
- **Edit di dalam Shadow DOM halaman** bisa dilakukan, tapi tidak bisa disimpan untuk auto-apply.
- **Auto-apply bergantung pada selector yang stabil.** Kalau situs memakai `id`/`class` acak yang berubah tiap kali dimuat, edit tersimpan akan **dilewati** dan dilaporkan — ini disengaja: lebih baik tidak menerapkan apa pun daripada menulis ke elemen yang salah.
- **Atribut event (`on*`) ditolak**, karena nilainya dieksekusi sebagai JavaScript.
- Mengubah `href` atau `src` bisa mengarahkan ke alamat lain — itu memang tujuan fiturnya, tapi perlu disadari.

---

## Isi folder ini

```
├── manifest.json          # Konfigurasi ekstensi (Manifest V3)
├── background/            # Service worker
├── content/               # Content script (panel editor)
├── popup/                 # Popup saat ikon diklik
├── options/               # Halaman Pengaturan
├── icons/                 # Ikon 16/32/48/128
├── docs/                  # Panduan pengguna
├── LICENSE
└── VERSION
```

Folder ini dihasilkan oleh `scripts/build-dist.ps1` dari proyek sumber. **Jangan mengedit berkas di sini** — perubahan akan hilang saat folder dibangun ulang. Edit proyek sumbernya, lalu jalankan ulang skrip build.

---

## Lisensi

[MIT](LICENSE)
