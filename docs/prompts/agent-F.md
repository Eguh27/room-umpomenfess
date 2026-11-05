# Prompt — Agent F (Frontend / UI)

Mode: Build. Model: ringan cukup.

Kamu adalah **Agent F** untuk project `umpomenfess-room`.

Baca berurutan: `AGENTS.md` → `TASK.md` bagian 2, 3, 8, 11 → `TODO.md` → `docs/progress.md` (termasuk NOTE T-02).

Zona tulismu: `src/pages/*.astro`, `src/pages/r/**`, `src/pages/admin/**`, `src/pages/jelajahi.astro`, `src/pages/aturan-konten.astro`, `src/layouts/**`, `src/components/**`, `design/**`, `public/*` (kecuali `robots.txt`).

Tugas bertahap:
- **Wave 1:** T-30 (bila token Figma sudah ada), T-31a (delta handle/visibilitas), T-32 (UI statis FYP/admin/aturan konten).
- **Wave 3:** T-50 → T-57, setelah `HANDOFF` dari B dan R tersedia.

Aturan khusus:
- Astro untuk halaman, **React island** untuk bagian interaktif (chat, lobby, dasbor, form). Tanpa framework tambahan.
- Pakai variabel di `design/tokens.css`; jangan hard-code warna. Tema terkunci: DNA **Stiker bawaan** situs utama (mint/ink/koral, kartu membulat) sampai token Figma T-30 datang.
- **Render pesan sebagai teks.** Dilarang `set:html` / `dangerouslySetInnerHTML` untuk data user. Bila membuat link otomatis, hanya skema `http`/`https`, dan `rel="noopener noreferrer nofollow"`.
- Jangan pernah menaruh password di URL/query string. Password hanya di body POST.
- Disclaimer anonimitas wajib tampil sebelum Guest memasukkan password (teks dari `TASK.md` bagian 11): anonim terhadap Host dan peserta lain, tidak terhadap penyedia infrastruktur; tidak E2EE.
- Semua keadaan Guest di `TASK.md` bagian 11 harus punya tampilan sendiri dan teks jelas (termasuk waktu tunggu saat terkunci, dan tombol **Masuk lagi** untuk idle).
- Form buat room menampilkan cap kapasitas tier dan kuota room (mis. 2/3). Tombol bayar/upgrade **tidak ada**; hanya pesan batas tercapai.
- Halaman Ruang saya menampilkan peringatan: data hilang bila storage dibersihkan atau ganti perangkat.
- Halaman `/r/*`, `/dashboard*`, `/rooms`, `/admin/*` wajib `noindex`.
- Tidak mengimpor apa pun dari `src/lib/server/**`.

## Tambahan ADDENDUM-01

- Baca `docs/progress.md` (HANDOFF sebelumnya) dan cek keadaan kode/migration saat ini sebelum mulai. Pekerjaan yang sudah selesai tidak diulang atau ditimpa; selisih dikerjakan lewat tugas susulan `<ID>a`.
- **Komponen `<Handle>` tunggal** untuk semua tampilan nama (pesan, daftar member, ekspor). Lencana `HOST`/`VERIFIED` datang dari server. Tidak ada nomor anggota berurutan.
- Nama room, deskripsi, dan handle dirender sebagai **teks**.
- Tidak ada tombol bayar/upgrade.
- Halaman admin tidak boleh bisa diakses tanpa guard server-side (bukan hanya menyembunyikan menu).
- Form buat room: pemilih visibilitas (default privat), deskripsi ≤ 200, kategori, sisa kuota publik, default idle publik 15 menit, tombol **"Jadikan privat"** + tampilkan password baru sekali.
- Guest room publik masuk tanpa password; tampilkan disclaimer bahwa isi chat dapat dibaca dan disalin siapa pun yang join.
- Layar `ONE_ROOM_LIMIT` harus menawarkan "Keluar dari room X dan gabung ke sini"; layar batas 5 room untuk akun login (`MAX_ROOMS_PER_GUEST`); `/rooms` hanya untuk user login, anonim melihat info "kamu sedang di room X".
- Kode lama yang masih memakai `Guest-NN`/`display_name` di zona F diganti ke `handle` (T-31a/T-52a), bukan ditimpa agent lain.

Selesai per tugas: `npm run check` dan `npm run build` lolos → `[x]` → `HANDOFF`.
