# 2. Panduan Penggunaan

Panduan lengkap semua fitur Pagesmith.

---

## Daftar isi

- [Membuka panel editor](#membuka-panel-editor)
- [Memilih elemen](#memilih-elemen)
- [Tab Teks](#tab-teks)
- [Tab Atribut](#tab-atribut)
- [Tab Nilai](#tab-nilai)
- [Edit langsung dengan klik dua kali](#edit-langsung-dengan-klik-dua-kali)
- [Sembunyikan elemen](#sembunyikan-elemen)
- [Salin selector](#salin-selector)
- [Riwayat, Undo/Redo, dan Reset](#riwayat-undoredo-dan-reset)
- [Simpan per domain](#simpan-per-domain)
- [Halaman Pengaturan](#halaman-pengaturan)
- [Shortcut keyboard](#shortcut-keyboard)
- [Menu klik-kanan](#menu-klik-kanan)
- [Pertanyaan umum](#pertanyaan-umum)

---

## Membuka panel editor

Tiga cara:

1. Klik ikon ekstensi di toolbar → **Buka Panel Editor**
2. Tekan `Alt+Shift+D`
3. Klik kanan di halaman → **Buka panel editor**

Panel muncul di kanan atas halaman. Bisa **digeser** — tahan bagian judulnya lalu tarik ke posisi yang nyaman.

Tombol **×** menutup panel. Edit yang sudah diterapkan **tetap berlaku** — menutup panel tidak membatalkan apa pun.

---

## Memilih elemen

Klik **Pilih Elemen** di popup, atau tekan `Alt+Shift+E`.

Kursor berubah menjadi *crosshair* dan muncul pesan "Mode pilih aktif". Sekarang:

- **Gerakkan kursor** — elemen di bawahnya diberi kotak highlight, dan tooltip menampilkan selector serta ukurannya dalam piksel.
- **Klik** — elemen terpilih, mode pilih otomatis mati, panel editor menampilkan isi elemen itu.
- **Esc** — batal, mode pilih mati tanpa memilih apa pun.

> 💡 **Elemen di dalam Shadow DOM** juga bisa dipilih. Kursor tetap menemukannya karena ekstensi menelusuri jalur event, bukan sekadar `document.querySelector`.

Setelah elemen terpilih, elemen itu tetap diberi kotak highlight selama panel terbuka, supaya kamu tidak lupa sedang mengedit yang mana.

---

## Tab Teks

Mengubah isi teks elemen.

1. Pilih elemen (misalnya sebuah `<h1>` atau `<p>`)
2. Buka tab **Teks**
3. Tulis teks baru di kotak
4. Klik **Terapkan** — atau tekan `Enter` (pakai `Shift+Enter` untuk baris baru)

### Catatan

- Mengganti teks **mengganti seluruh isi** elemen, termasuk tag anak di dalamnya. Kalau elemen berisi `<b>` atau `<a>`, tag itu akan hilang dan tergantikan teks polos.
- Elemen yang tidak punya teks (misalnya `<img>`, `<input>`, `<br>`) membuat tab ini nonaktif dengan pesan penjelas.

---

## Tab Atribut

Mengelola atribut HTML elemen — `class`, `href`, `src`, `style`, `data-*`, `aria-*`, dan sebagainya.

Setiap atribut ditampilkan satu baris dengan tiga kontrol:

| Kontrol | Fungsi |
|---|---|
| Kolom teks | Nilai atribut. Ubah lalu tekan `Enter` atau klik **Set**. |
| **Set** | Menerapkan nilai yang tertulis di kolom. |
| **×** | Menghapus atribut itu dari elemen. |

### Menambah atribut baru

Di bagian bawah tab, isi **nama** dan **nilai**, lalu klik **+**.

- Kalau nama atribut itu belum ada → atribut baru ditambahkan.
- Kalau sudah ada → nilainya diperbarui.

### Atribut yang ditolak

Atribut event (`onclick`, `onload`, `onerror`, dan semua yang berawalan `on`) **ditolak**. Alasannya: nilainya dieksekusi browser sebagai JavaScript, jadi menerimanya berarti ekstensi ini bisa dipakai menjalankan kode arbitrer di halaman.

### Contoh pemakaian

| Ingin | Atribut | Nilai |
|---|---|---|
| Mengganti gambar | `src` | URL gambar baru |
| Mengubah tautan | `href` | URL tujuan |
| Menyembunyikan lewat CSS | `style` | `opacity: 0.2` |
| Menonaktifkan tombol | `disabled` | `true` |
| Mengubah warna teks | `style` | `color: red` |

> ⚠️ Mengubah `href` atau `src` memang bisa mengarahkan ke alamat lain. Itu tujuan fiturnya, tapi perlu disadari.

---

## Tab Nilai

Mengisi nilai kontrol form: `input`, `textarea`, `select`, `checkbox`, dan `radio`.

Tampilan panel menyesuaikan jenis kontrolnya:

- **Teks / email / password / tel / URL / number / date** → kolom teks biasa
- **Select** → dropdown berisi semua opsi yang tersedia (label + nilainya)
- **Checkbox / radio** → kotak centang

Tekan `Enter` atau klik **Terapkan** untuk menerapkan.

### Kenapa React dan Vue ikut terdeteksi?

Ini bagian yang biasanya gagal kalau kamu mengubah nilai lewat Inspect Element: framework modern **melacak nilai terakhir yang mereka tulis sendiri**. Kalau kamu set `element.value` langsung, pelacak itu tidak melihat perubahan — dan state framework tetap menganggap nilainya kosong.

Ekstensi ini menulis nilai lewat **prototype setter bawaan browser**, bukan setter milik framework, lalu mengirim event `input` dan `change` sintetis. Hasilnya pelacak framework melihat perubahan sebagai nilai baru, dan state-nya ikut diperbarui.

Teknik yang sama dipakai proyek `qa-data-generator` di workspace ini.

### Kalau nilai ditolak

Browser punya validasi bawaan. Contoh:

- Menulis `"abc"` ke `<input type="number">` → ditolak
- Menulis tanggal tidak valid ke `<input type="date">` → ditolak
- Menulis nilai yang bukan opsi `<select>` → ditolak

Kalau itu terjadi, muncul pesan seperti *"Browser menolak format nilai tersebut"*, dan **tidak ada yang berubah** di halaman.

---

## Edit langsung dengan klik dua kali

Cara tercepat mengubah teks:

1. **Klik dua kali** pada teks mana pun di halaman
2. Teks jadi bisa diedit langsung di tempat
3. `Enter` untuk simpan · `Esc` untuk batal · `Shift+Enter` untuk baris baru

Edit ini tetap tercatat di riwayat seperti edit biasa, jadi bisa dibatalkan.

Fitur ini bisa dimatikan di **Pengaturan** → *Klik dua kali pada teks untuk mengedit langsung di halaman*.

> Kontrol form (`input`, `textarea`) sengaja dikecualikan dari klik-dua-kali — untuk itu pakai tab **Nilai**.

---

## Sembunyikan elemen

Klik **Sembunyikan** di bagian bawah panel untuk menyembunyikan elemen terpilih. Klik lagi untuk menampilkannya kembali.

Cara kerjanya: menambahkan `display: none !important` lewat inline style. **Style asli elemen tidak dirusak** — nilai `display` sebelumnya dicatat, dan dikembalikan persis seperti semula saat kamu membatalkan editnya.

Berguna untuk:
- Melihat tampilan halaman tanpa elemen pengganggu (banner, popup, iklan)
- Menguji apakah layout tetap rapi tanpa suatu elemen

---

## Salin selector

Klik **Copy** untuk menyalin CSS selector unik elemen ke clipboard.

Contoh hasil:

```
body > div.container > main > article:nth-of-type(2) > h2
```

Selector ini bisa langsung dipakai di `document.querySelector()`, di stylesheet, atau di test otomasi.

Kalau elemen tidak bisa diidentifikasi secara unik (misalnya strukturnya terlalu dalam atau selector-nya tidak stabil), muncul pesan bahwa selector unik tidak ditemukan.

---

## Riwayat, Undo/Redo, dan Reset

Buka tab **Riwayat**. Angka di sebelahnya menunjukkan berapa edit yang aktif di halaman ini.

Setiap baris menampilkan:

- **Jenis edit** — `text`, `attr`, `value`, atau `visibility`
- **Elemen** — selector dan cuplikan teksnya
- **Nilai baru**
- **↩** — mengembalikan edit itu saja

### Undo / Redo

Tombol **Undo** dan **Redo** di atas daftar riwayat.

Bisa juga lewat keyboard — tapi **hanya saat fokus sedang berada di dalam panel**:

| Tombol | Fungsi |
|---|---|
| `Ctrl+Z` / `Cmd+Z` | Undo |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Redo |

Kenapa dibatasi? Supaya `Ctrl+Z` di halaman tetap berfungsi normal untuk keperluan halaman itu sendiri. Ekstensi ini tidak membajak undo milik halaman.

### Reset

Tombol **Reset** di bagian bawah panel membatalkan **semua** edit di halaman ini sekaligus, dan mengembalikan setiap elemen ke nilai aslinya.

---

## Simpan per domain

Secara default, edit bersifat **sekali pakai** — hilang begitu halaman dimuat ulang.

Untuk membuatnya bertahan:

1. Buka popup ekstensi
2. Aktifkan **Simpan untuk domain ini**
3. Chrome menampilkan dialog izin untuk domain itu → klik **Izinkan**

Setelah itu, setiap kali kamu membuka halaman di domain tersebut, edit otomatis diterapkan lagi.

### Bagaimana ekstensi memastikan tidak salah tulis

Sebelum menulis nilai, setiap edit divalidasi lebih dulu:

1. **Elemen masih ada?** — dicari lewat selector yang tersimpan
2. **Masih elemen yang sama?** — sidik jari (tag, id, class, name, type, role) dibandingkan
3. **Nilainya masih nilai asli?** — dibandingkan dengan nilai yang tercatat saat edit dibuat

Kalau salah satu gagal, edit itu **dilewati** dan dilaporkan. Ini disengaja: lebih baik tidak menerapkan apa pun daripada menulis nilai ke elemen yang salah.

### Kapan edit tersimpan bisa gagal diterapkan

| Penyebab | Contoh |
|---|---|
| Situs memakai `id`/`class` acak | `class="sc-4f8a2b"` berubah tiap kali dimuat |
| Konten dimuat belakangan | Elemen belum ada saat halaman selesai dimuat |
| Struktur halaman berubah | Situs di-update, DOM-nya beda |
| Elemen ada di dalam Shadow DOM | Tidak bisa diidentifikasi ulang dari `document` |

Kalau ada edit yang dilewati, panel editor menampilkan pemberitahuan jumlahnya saat dibuka.

### Mematikan simpan otomatis

Matikan kembali toggle di popup. **Edit yang sudah tersimpan tidak dihapus** — hanya berhenti diterapkan otomatis. Untuk benar-benar menghapusnya, buka **Pengaturan** → hapus domainnya.

---

## Halaman Pengaturan

Buka lewat tautan **Pengaturan** di popup, atau dari `chrome://extensions` → *Extension options*.

### Domain tersimpan

Daftar semua domain yang punya edit tersimpan. Tiap baris menampilkan jumlah edit, waktu pembaruan terakhir, dan status auto-apply.

- **Hapus** — menghapus semua edit domain itu, mencabut izin aksesnya, dan menghentikan auto-apply

Kalau ada domain bertanda **⚠ izinnya sudah tidak ada** (misalnya izinnya dicabut lewat `chrome://extensions`), klik Hapus untuk membersihkannya.

### Tampilan

| Pengaturan | Fungsi |
|---|---|
| **Warna highlight** | Warna kotak penanda elemen. Bisa lewat pemilih warna atau menulis kode hex. |
| **Ketebalan garis** | 1–6 piksel. |
| **Tooltip saat memilih** | Menampilkan/menyembunyikan tooltip selector. |
| **Buka panel otomatis** | Kalau dimatikan, memilih elemen tidak otomatis membuka panel. |
| **Klik dua kali untuk edit** | Mengaktifkan/mematikan edit langsung di halaman. |

### Cadangan

- **Ekspor JSON** — menyimpan seluruh edit, pengaturan, dan daftar domain ke satu berkas
- **Impor (gabung)** — menambahkan isi berkas ke data yang sudah ada; domain yang sama akan ditimpa
- **Impor (ganti semua)** — mengganti seluruh data dengan isi berkas

### Hapus data

- **Hapus semua edit** — menghapus semua edit tersimpan, izin akses dibiarkan
- **Hapus semua data + izin** — menghapus edit, pengaturan, daftar domain, dan mencabut semua izin akses situs

Keduanya tidak bisa dibatalkan. Ekspor dulu bila masih dibutuhkan.

---

## Shortcut keyboard

| Shortcut | Fungsi |
|---|---|
| `Alt+Shift+E` | Aktifkan / matikan mode pilih |
| `Alt+Shift+D` | Tampilkan / sembunyikan panel editor |
| `Esc` | Batalkan mode pilih, atau batalkan edit langsung |
| `Enter` | Terapkan (di kolom teks/nilai), atau simpan (saat edit langsung) |
| `Shift+Enter` | Baris baru |
| `Ctrl+Z` | Undo — hanya saat fokus di dalam panel |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Redo — hanya saat fokus di dalam panel |

Shortcut bisa diubah di `chrome://extensions/shortcuts`.

---

## Menu klik-kanan

Klik kanan di halaman mana pun:

- **Edit elemen ini (Pagesmith)** — membuka panel dan langsung mengaktifkan mode pilih
- **Buka panel editor** — membuka panel saja

> Catatan: Chrome tidak memberi tahu ekstensi elemen mana yang diklik-kanan. Jadi "Edit elemen ini" mengaktifkan mode pilih, dan kamu klik elemen yang dimaksud. Ini keterbatasan API Chrome, bukan bug.

---

## Pertanyaan umum

### Apakah perubahan ini permanen?

**Tidak.** Edit hanya mengubah DOM di browser kamu. Server, berkas sumber, dan situs aslinya tidak tersentuh. Muat ulang halaman → kembali normal (kecuali kamu mengaktifkan *Simpan per domain*).

### Apakah ini bisa merusak halaman?

Dalam batas tertentu, ya — mengubah teks atau atribut bisa membuat tombol tidak berfungsi atau layout berantakan. Karena itu selalu ada tombol **Reset** dan **Kembalikan**, dan memuat ulang halaman selalu memulihkan keadaan aslinya.

### Apakah data saya dikirim ke mana-mana?

**Tidak.** Ekstensi ini 100% offline. Tidak ada permintaan jaringan sama sekali. Semua data tersimpan lokal di `chrome.storage.local` browser kamu.

### Apakah bisa mengedit beberapa elemen sekaligus?

Bisa, satu per satu. Setiap edit tercatat di riwayat, dan semuanya tetap berlaku bersamaan.

### Kenapa edit saya tidak muncul di tab lain?

Edit bersifat per-tab. Tab lain punya DOM sendiri, jadi harus diedit sendiri. Kalau kamu mengaktifkan *Simpan per domain*, tab baru di domain yang sama akan otomatis menerapkan editnya.

### Bagaimana kalau saya salah menghapus domain di Pengaturan?

Tidak bisa dipulihkan, kecuali kamu punya cadangan JSON. Karena itu **Ekspor JSON** disarankan secara berkala.

### Kenapa `Alt+Shift+E` tidak berfungsi di beberapa situs?

Beberapa situs menangkap shortcut keyboard lebih dulu. Klik ikon ekstensi → **Pilih Elemen** sebagai gantinya.

### Apakah bisa dipakai di HP?

Tidak. Chrome di Android tidak mendukung ekstensi.
