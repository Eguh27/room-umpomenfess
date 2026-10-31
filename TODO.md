# TODO.md — Papan tugas

Legenda status: `[ ]` belum · `[~] @PERAN` dikerjakan · `[x]` selesai · `[!]` terblokir (tulis alasan di `docs/progress.md`).
Peran: **L** lead/ops · **D** database · **B** backend/API · **R** realtime client · **F** frontend · **S** security/QA · **H** manusia.
Format: `ID [Peran] (Prioritas) judul — depends — verifikasi`. Spesifikasi detail: `TASK.md` (nomor bagian di kurung).

Legenda prioritas ADDENDUM-01: **(M1)** chat inti · **(M2)** aturan lengkap · **(M3)** admin, FYP, rilis. Dalam satu wave, kerjakan M1 dulu.

## Wave 0 — Fondasi

- [x] T-00 [L] Kerangka project: Astro 7 + Vercel + React, `astro:env`, helper `ip.ts` + tes, header keamanan, workflow CI & keep-alive — verifikasi: `npm test`, `npm run check`, `npm run build` lolos (sudah diverifikasi saat zip dibuat)
- [x] T-01 [L] Tambah ESLint + Prettier minimal dan skrip `npm run lint`; perbarui CI — depends T-00 — verifikasi: `npm run lint` bersih
- [ ] H-01 [H] Siapkan akun/proyek Supabase BARU, Turnstile, proyek Vercel, DNS (lihat `docs/setup.md`) — paralel dengan semua wave awal
- [x] T-02 [L] (M1) Terapkan ADDENDUM-01 ke TASK.md, AGENTS.md, TODO.md, docs/prompts/* — depends T-00 — verifikasi: pemeriksaan konsistensi bagian 0 langkah 4 bersih
- [ ] H-02 [H] (M1) Konfirmasi keputusan Default di ADDENDUM-01 bagian 1: D-11 (maks 5), D-14a (handle akun permanen), D-16 (Admin tidak membaca pesan), D-18 (join dulu untuk membaca room publik), D-19, kuota publik — sebelum T-10a/T-16 dimulai (default berlaku sampai dikonfirmasi) — verifikasi: keputusan tertulis di docs/progress.md

## Wave 1 — Database dan UI statis (paralel, independen)

- [x] T-10 [D] Migration 0001: ekstensi (`pgcrypto`, `pg_cron`), enum `member_status`, semua tabel, constraint, index, seed `tier_limits` + `app_config` (bagian 3, 4) — depends T-00 — verifikasi: `supabase db reset` sukses
- [x] T-11 [D] Migration 0002: schema `app_private` + fungsi pembantu, `REVOKE`/default privileges, RLS + policy, grant kolom `rooms`, publication Realtime, trigger `profiles` (bagian 5) — depends T-10 — verifikasi: `supabase db reset` + query katalog S-15
- [x] T-12 [D] Migration 0003: RPC Host (`create_room` … `export_messages`) (bagian 6) — depends T-11 — verifikasi: tes pgTAP per RPC di `supabase/tests/`
- [x] T-13 [D] Migration 0004: RPC Guest + `join_room` (service-only) + penomoran atomik + `release_idle_members` (bagian 6, 8) — depends T-12 — verifikasi: tes pgTAP: lockout, kursi penuh, idle release, rejoin
- [x] T-14 [D] Migration 0005: job `pg_cron` + kebijakan `realtime.messages` untuk `typing:<room_id>` (bagian 5, 9) — depends T-13 — verifikasi: `cron.job` berisi 4 job; tes policy
- [x] T-15 [D] Tes SQL lengkap + `supabase/seed.sql` dev; **cek perilaku otorisasi Realtime private channel setelah member dikeluarkan** dan catat hasilnya di progress.md — depends T-14 — verifikasi: `supabase test db` hijau
- [~] T-30 [F] Terapkan token Figma ke `design/tokens.css` (menunggu ekspor dari manusia; sementara sudah terisi DNA **Stiker bawaan** atas arah manusia 2026-10-28, bukan placeholder kosong lagi) — depends H (token) — verifikasi: halaman memakai variabel CSS, tanpa warna hard-coded
- [x] T-31 [F 2026-10-28] Kerangka UI statis dengan data tiruan: landing, login/register, dasbor, form buat room, tampilan chat, panel member, halaman Ruang saya, disclaimer — depends T-00 — verifikasi: `npm run build`; semua keadaan Guest di bagian 11 punya tampilan (tema Stiker bawaan; keadaan Guest bisa dipratinjau lewat `?state=…`)

**Tugas susulan & tambahan ADDENDUM-01 (Wave 1):**

- [x] T-10a [D] (M1) Tugas susulan T-10: migration **0006** berisi selisih skema non-identitas — kolom `rooms.visibility/description/category/listing_status/listed_at`, `password_hash` nullable + CHECK `(visibility='PRIVATE') = (password_hash is not null)`; tabel `room_stats`, `room_reports` (RLS aktif tanpa policy sejak migration ini); kolom `tier_limits.max_public_rooms`; kunci `app_config` baru (`anon_max_active_rooms`, `login_max_active_rooms`, `public_rooms_enabled=false`, `public_join_per_ip_per_hour`, `report_hide_threshold`, `public_idle_default_minutes`, `feed_cache_seconds`, `public_description_max`, `categories`), hapus `max_rooms_per_guest` — depends T-02, T-10 — verifikasi: `supabase db reset`; pgTAP memastikan kolom/constraint/kunci baru ada dan kunci lama tidak dipakai
- [x] T-16 [D] (M1) Migration **0007**: selisih skema handle/role/identitas — kolom `profiles.handle/handle_verified/role/suspended`, `room_members.handle/handle_verified`, hapus `room_members.member_no/display_name` dan `rooms.member_counter` serta helper penomoran lama (`next_guest_number`, `guest_display_name`), tambah `messages.sender_badge`, tabel `handle_history`, `reserved_handles` + seed reserved (RLS aktif tanpa policy sejak migration ini), generator `app_private.generate_handle()`, constraint pola handle, trigger isi handle profil non-anonim, fungsi handle anonim per room, **backfill data lama** (`profiles.handle`, `room_members.handle`, `messages.sender_name`/`sender_badge`) — depends T-02, T-10a, T-11 — verifikasi: pgTAP: pola acak hanya dari sistem, unik, reserved ditolak, UPDATE client ditolak; data lama tidak menampilkan nomor urut
- [x] T-11a [D] (M1) Tugas susulan T-11: migration **0008** — RLS/grant untuk tabel baru (`room_stats`, `room_reports`, `handle_history`, `reserved_handles`), `profiles` hanya SELECT baris sendiri (tanpa UPDATE/INSERT/DELETE client), helper `app_private.is_admin_aal2()` + `is_email_confirmed()`; grant `list_public_rooms` disiapkan di T-18 saat fungsi dibuat — depends T-10a, T-16 — verifikasi: `supabase db reset`; katalog S-15; UPDATE `profiles` lewat REST ditolak
- [x] T-12a [D] (M1) Tugas susulan T-12: migration **0009** dengan `CREATE OR REPLACE` untuk `create_room` (visibilitas, deskripsi, kategori, kuota publik, email terkonfirmasi, flag, suspend), `update_room_settings` (tolak visibilitas), `make_room_private`, `regenerate_password` (PUBLIC → `INVALID_INPUT`), `list_hosted_rooms` (visibility/`listing_status`/kuota publik), `list_members`/`export_messages`/`decide_member` memakai `handle` + `handle_verified`/`sender_badge` — depends T-11a — verifikasi: verifikasi T-12 + pgTAP delta
- [ ] T-13a [D] (M1) Tugas susulan T-13: migration **0010** dengan `CREATE OR REPLACE` untuk `join_room` (`p_is_anonymous`, publik tanpa password, rate limit publik, aturan 1 room, handle, tanpa penomoran), `rejoin_room` (`ONE_ROOM_LIMIT`/`HIDDEN`/`BANNED`), `my_rooms` (login-only, handle), `get_room_public` (visibility), `list_messages`/`send_message` (snapshot handle + badge) — depends T-12a, T-16 — verifikasi: verifikasi T-13 + tes delta aturan 1 room/handle
- [ ] T-17 [D] (M3) Migration **0011**: RPC Admin (`admin_rename_handle`, `admin_set_tier`, `admin_suspend_user`, `admin_close_room`, `admin_set_listing`, `admin_list_users`, `admin_list_reports`) + `admin_audit_log` (append-only, RLS aktif tanpa policy/grant; `handle_history` sudah dibuat di T-16); semua wajib `is_admin_aal2()` — depends T-12a, T-16 — verifikasi: pgTAP: `NOT_ADMIN`, `MFA_REQUIRED`, audit tercatat, rename memperbarui `room_members.handle` di room ACTIVE
- [ ] T-18 [D] (M3) Migration **0012**: FYP — `list_public_rooms` (grant `anon`+`authenticated`, hanya kolom whitelist), `report_room` (+auto-`HIDDEN` pada ambang laporan unik), job `refresh_room_stats` tiap menit; `admin_set_listing`/`admin_list_reports` dari T-17 dipakai — depends T-13a, T-17 — verifikasi: pgTAP: privat tidak pernah ter-list, ambang laporan unik, `HIDDEN`/`BANNED` tidak bisa di-join
- [ ] T-19 [D] (M3) Tes SQL tambahan S-21…S-32 di sisi database + perbarui `supabase/seed.sql` (room PRIVATE/PUBLIC, handle, laporan) — depends T-18 — verifikasi: `supabase test db` hijau
- [x] T-31a [@F 2026-10-29] Tugas susulan T-31: buang semua `Guest-NN` di UI statis; komponen `<Handle>` + lencana `HOST`/`VERIFIED`; layar `ONE_ROOM_LIMIT`; pemilih visibilitas/deskripsi/kategori di form buat room; teks disclaimer room publik — depends T-31 — verifikasi: `npm run build`; `grep -r "Guest-" src` kosong (kecuali catatan migrasi) — selesai 2026-10-29 11:06; gate grep bersih setelah fixture R diubah atas izin manusia
- [ ] T-32 [F] (M3) UI statis tiruan: `/jelajahi` (kartu room, filter, sort, cari), modal Laporkan, kerangka `/admin/*` (pengguna, laporan, room, audit), `/aturan-konten` — depends T-31a — verifikasi: `npm run build`

## Wave 2 — Integrasi server dan realtime (paralel setelah kontrak RPC stabil)

- [x] T-20 [B] Rapikan `lib/supabase/server.ts`, validasi env, tipe hasil RPC (selaras kontrak bagian 6) — depends T-13 — verifikasi: `npm run check`
- [x] T-21 [B] Implementasi `POST /api/rooms/join` penuh (bagian 7) + tes unit pemetaan error (mock) — depends T-13, T-20 — verifikasi: `npm test`; uji manual dengan Supabase lokal
- [~] T-22 [@B 2026-10-29] CSP + header tambahan (izinkan `*.supabase.co` https/wss, `challenges.cloudflare.com`), uji tidak merusak Turnstile/Realtime — depends T-31 — verifikasi: tidak ada pelanggaran CSP di konsol; S-18 (dipindahkan manusia ke agent ini; sumber CSP = middleware agar teruji dev & prod; kode selesai & teruji 11:26, menunggu tinjauan; catatan di `docs/progress.md`)
- [x] T-40 [R] Modul realtime: subscribe pesan + status member, backfill saat reconnect, dedupe, kirim optimistis (bagian 8) — depends T-13 — verifikasi: tes unit dengan client tiruan
- [ ] T-41 [R] (M2) Paginasi riwayat (50 awal, memuat ke atas) dan ekspor `.txt` WIB dengan format `[DD-MM-YYYY HH:MM] <handle>: isi` — depends T-40a — verifikasi: tes unit format baris ekspor
- [ ] T-42 [R] (M1) Heartbeat `touch_activity` (visibility-aware) + penanganan status `IDLE`/`KICKED`/`LEFT` + `rejoin_room` + `leaveRoom()` + penanganan `ONE_ROOM_LIMIT` — depends T-40a — verifikasi: tes unit penjadwalan (fake timers) dan alur pindah room
- [ ] T-43 [R] (M2) Indikator mengetik (Broadcast private agregat, throttle 5 dtk, kedaluwarsa 6 dtk, hormati `typing_effective`) — depends T-14, T-40a — verifikasi: tes unit throttle + agregasi

**Tugas susulan & tambahan ADDENDUM-01 (Wave 2):**

- [ ] T-21a [B] (M1) Tugas susulan T-21: password opsional, `is_anonymous` dari `getUser`, rate limit join publik, pemetaan error baru (`ONE_ROOM_LIMIT`→409, `ROOM_HIDDEN`/`ROOM_BANNED`→404, `FEATURE_DISABLED`/`USER_SUSPENDED`→403), respons `handle` — depends T-13a, T-20 — verifikasi: verifikasi T-21 + tes unit pemetaan baru
- [ ] T-23 [B] (M3) `POST /api/admin/users`: buat akun organisasi via Supabase Admin API (`inviteUserByEmail`), wajib admin AAL2 (verifikasi klaim JWT), panggil `admin_rename_handle`, catat audit — depends T-17, T-20 — verifikasi: tes unit pemetaan; uji manual lokal
- [ ] T-24 [B] (M3) `GET /api/rooms/public`: zod (sort/category/q/cursor/limit), `Cache-Control: public, s-maxage=30, stale-while-revalidate=60`, panggil `list_public_rooms` — depends T-18, T-20 — verifikasi: header cache benar; tidak ada kolom di luar whitelist
- [ ] T-25 [B] (M3) `POST /api/rooms/report`: Turnstile + verifikasi JWT + `report_room`, petakan error — depends T-18, T-20 — verifikasi: tes unit; laporan ganda ditolak
- [ ] T-40a [R] (M1) Tugas susulan T-40: pakai `handle` + `sender_badge`/`handle_verified` (bukan `display_name`/`Guest-NN`) di tipe, store, dan hook realtime — depends T-13a, T-40 — verifikasi: tes unit diperbarui; `grep -r "display_name\|Guest-" src/lib/realtime` kosong
- [ ] T-44 [R] (M1) Modul sesi & tipe user: sign-in anonim persisten, deteksi anonim/login/admin dari JWT, state "room aktif saya" untuk anonim, helper pindah room (leave lalu join) — depends T-40a — verifikasi: tes unit dengan client tiruan

## Wave 3 — UI terhubung

- [ ] T-50 [F] (M1) Auth Host: satu alur register/login untuk Host dan Guest login, Turnstile, konfirmasi email (wajib untuk room publik), MFA enroll/verify TOTP untuk Admin — depends T-31a, T-20 — verifikasi: alur manual end-to-end; admin tanpa MFA ditolak
- [ ] T-51 [F] (M1) Dasbor Host: daftar room, sisa waktu, kuota, form buat room (kapasitas ≤ cap tier; visibilitas default privat; deskripsi; kategori; sisa kuota publik; default idle publik 15 menit), tampilkan password sekali, regenerate, tutup — depends T-50, T-12a — verifikasi: manual; kuota habis menampilkan pesan yang benar
- [~] T-52 [@F 2026-10-29] Halaman Guest `/r/<slug>`: disclaimer → Turnstile → sign-in anonim → `POST /api/rooms/join` → semua keadaan bagian 11 — depends T-21, T-31 — verifikasi: manual tiap keadaan (island JoinRoom nyata; pratinjau statis `?state=` dipertahankan)
- [ ] T-53 [F] (M1) Ruang chat Host & Guest + panel member (Approve/Reject/Kick) + countdown + tampilan mengetik/idle + `<Handle>` + lencana `HOST`/`VERIFIED` + tombol Laporkan di room publik — depends T-40a, T-41, T-42, T-43, T-52a, T-25 — verifikasi: dua browser berbeda
- [ ] T-54 [F] (M2) Halaman `/rooms` (Ruang saya) khusus user login + penanda belum dibaca di `localStorage` + peringatan batasan penyimpanan; anonim melihat info "kamu sedang di room X" — depends T-44, T-53 — verifikasi: ikut di 2 room (akun login), state bertahan setelah refresh
- [~] T-55 [@F 2026-10-29] Halaman `/privasi` dan `/batas-anonimitas` (bahasa Indonesia, jujur soal log infrastruktur dan akses admin database) — depends T-31 — verifikasi: ditinjau manusia (draft dirapatkan; menunggu tinjauan manusia)

**Tugas susulan & tambahan ADDENDUM-01 (Wave 3):**

- [ ] T-52a [F] (M1) Tugas susulan T-52: Guest masuk room publik tanpa password; layar `ONE_ROOM_LIMIT`; layar batas 5 room untuk akun login (`MAX_ROOMS_PER_GUEST`); disclaimer room publik; tangani `ROOM_HIDDEN`/`ROOM_BANNED`/`FEATURE_DISABLED` — depends T-21a, T-31a, T-44 — verifikasi: manual tiap keadaan
- [ ] T-55a [F] (M2) Tugas susulan T-55: tambah `/aturan-konten` + prosedur takedown; `/privasi` menyatakan Admin tidak membaca isi pesan dan isi room publik dapat disalin siapa pun — depends T-55 — verifikasi: ditinjau manusia
- [ ] T-56 [F] (M3) Halaman `/jelajahi` (FYP) terhubung ke `/api/rooms/public`: kartu, sort Ramai/Terbaru, kategori, cari, label Penuh, tombol Gabung, Laporkan — depends T-24, T-25, T-32, T-52a — verifikasi: manual; room privat tidak pernah tampil
- [ ] T-57 [F] (M3) Admin console terhubung: MFA, daftar pengguna, rename handle + lencana, set tier, suspend, antrian laporan, delist/ban room, lihat audit log — depends T-17, T-23, T-32, T-50 — verifikasi: manual; akun non-admin dan admin tanpa MFA ditolak

## Wave 4 — Audit keamanan (mode Plan dulu, lalu Build untuk skrip)

- [x] T-60 [S] Audit RLS/RPC/grant terhadap bagian 5–6 (Plan). Keluaran: `docs/audit/rls-audit.md` — depends T-15 — verifikasi: setiap temuan punya ID dan tingkat keparahan
- [x] T-61 [S] Skrip serangan S-01…S-14, S-19, S-20 di `scripts/security/` (REST + RPC langsung) — depends T-15 — verifikasi: semua menghasilkan hasil yang benar; dapat dijalankan ulang
- [ ] T-62 [S] (M2) S-15 (katalog), S-16 (grep bundle), S-17 (XSS), S-18 (header/CSP) — depends T-22, T-53 — verifikasi: skrip hijau
- [ ] T-63 [S] (M2) Uji beban ringan: 40 klien simulasi dalam satu room; skenario FYP (cache hit/miss) dan hitungan koneksi room publik penuh; catat koneksi dan hitungan pesan Realtime; bandingkan dengan kuota free — depends T-53, T-56 — verifikasi: laporan di `docs/audit/load.md`
- [ ] T-64 [D/B/R/F] (M2) Perbaiki temuan T-60…T-63 (masing-masing peran di zonanya) — depends T-60 — verifikasi: S menjalankan ulang semua skrip

**Tugas susulan & tambahan ADDENDUM-01 (Wave 4):**

- [ ] T-60a [S] (M3) Tugas susulan T-60: perluas audit ke RPC Admin, handle/role, dan jalur FYP (Plan) — depends T-17, T-18, T-60 — verifikasi: temuan bernomor di `docs/audit/`
- [ ] T-61a [S] (M2) Tugas susulan T-61: ubah S-09 (tanpa `user_id`, tanpa `Guest-NN`, memakai handle) dan sesuaikan skrip lama dengan kontrak baru — depends T-19, T-61 — verifikasi: `bash scripts/security/run.sh --only=S-09` hijau
- [ ] T-65 [S] (M3) Skrip serangan S-21…S-32 di `scripts/security/`, plus simulasi abuse FYP: laporan massal, enumerasi/scraping feed, spam join publik, upaya privat→publik — depends T-19, T-23, T-24, T-25 — verifikasi: semua hasil benar; dapat dijalankan ulang

## Wave 5 — Rilis

- [ ] T-70 [L] (M3) Deploy: env Vercel, Node 22, domain/CNAME DNS-only, konfigurasi Supabase (anonymous sign-in, CAPTCHA, URL redirect, `pg_cron` aktif, MFA TOTP, konfirmasi email ON, role admin pertama lewat SQL), rule WAF join (tetap 1 karena Hobby), verifikasi header cache `/api/rooms/public`, secret GitHub (`SITE_URL`) — depends T-64, H-01 — verifikasi: daftar periksa `docs/setup.md` tercentang
- [ ] T-71 [L] (M3) Daftar periksa monitoring: usage Realtime, koneksi, ukuran DB, jalankan manual keep-alive, cek `cron.job_run_details` — depends T-70 — verifikasi: ditulis di `docs/setup.md`
- [ ] T-72 [H] (M3) Putuskan pertanyaan terbuka (TASK.md bagian 14), termasuk keputusan H-02 dan nilai `categories` — sebelum T-70
- [ ] T-73 [L] (M3) Gerbang rilis FYP: verifikasi checklist D-20 (laporan, auto-`HIDDEN`, admin delist/ban, aturan konten, email terkonfirmasi, T-65 hijau), baru `public_rooms_enabled=true` — depends T-65, T-70 — verifikasi: checklist tercentang di `docs/setup.md`; flag dinyalakan oleh manusia

## Backlog (tidak masuk wave)

- **E6 Thread publik dari menfess** (`room.{domain}/{kode}`; nama samaran dari IP+salt; ikut terhapus bila menfess dihapus). Menunggu keputusan cara akses data menfess dari project Supabase lain (API server-ke-server read-only atau database bersama).
- **E10 Fase 2:** pembayaran/langganan, Google OAuth, personalisasi FYP (opt-in, hanya akun login), penautan perangkat, penanda 18+, laporan lanjutan.

## Catatan paralelisme

- **Migrasi database berurutan:** migration lama tidak boleh diedit. T-10a (0006) → T-16 (0007) → T-11a (0008) → T-12a (0009) → T-13a (0010) → T-17 (0011) → T-18 (0012) → T-19 (0013). Nomor final menyesuaikan jumlah migration yang sudah ada saat tugas dikerjakan; yang wajib adalah urutan topik dan `supabase db reset` dari nol.
- Wave 1: D dan F jalan bersamaan (tidak saling bergantung). F mengerjakan T-31a/T-32; D mengerjakan migration berurutan.
- Wave 2: B dan R jalan bersamaan setelah T-13a selesai. Hindari mulai sebelum kontrak RPC dibekukan.
- Wave 3 bergantung pada Wave 2. Satu agent F saja untuk menghindari konflik file.
- Wave 4: S tidak boleh mengedit kode di luar zonanya; perbaikan dikembalikan ke pemilik zona lewat T-64.
- Dalam satu wave, kerjakan **(M1)** dulu, lalu **(M2)**, lalu **(M3)**. FYP (T-18, T-24, T-56, T-57, T-73) tetap di balik flag `public_rooms_enabled=false` sampai gerbang rilis.
