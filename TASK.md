# TASK.md — Spesifikasi & kontrak (umpomenfess-room)

Dokumen ini adalah **sumber kebenaran** untuk semua agent. Menggantikan `docs/PRD_v2.docx` bila ada perbedaan.
Angka bertanda **(usulan)** boleh diubah manusia lewat tabel konfigurasi tanpa mengubah kode.

> **ADDENDUM-01 sudah diterapkan (2026-10-29).** Dokumen ini menggambarkan **keadaan akhir**. Database yang sudah ada dimigrasikan lewat migration aditif, bukan dengan mengedit migration lama. Lihat catatan migrasi di bagian 4.

## 1. Ringkasan

Room chat teks anonim. **Host** (akun email/password) membuat room dan memegang moderasi. **Guest** masuk tanpa akun memakai link (room privat memakai password), tampil dengan **handle acak** `[a-z0-9]{9}` (mis. `wu32t76e3`) — bukan nomor urut. Semua aktor, termasuk Host dan Guest login, memakai handle. Room aktif 7 hari, lalu read-only 15 hari (Host bisa ekspor .txt), lalu dihapus permanen.

Ada dua jenis room: **PRIVATE** (default; link + password; tidak tampil di FYP) dan **PUBLIC** (tanpa password; metadata tampil di FYP; isi chat hanya terbaca setelah join). Guest anonim hanya boleh **1 keanggotaan aktif**; Guest login maksimal **5**. Fitur tambahan versi ini: **kapasitas room per tier**, **auto-kick Guest idle**, **indikator mengetik**, dan **FYP room publik** (di balik flag).

## 2. Keputusan terkunci

| ID | Keputusan | Status |
|---|---|---|
| D-01 | Astro SSR + Vercel + React island. Supabase untuk Postgres/Auth/Realtime/RLS. Tanpa Socket.io. | Terkunci |
| D-02 | Cloudflare DNS-only. Turnstile di register, join, dan CAPTCHA Supabase Auth (anonymous sign-in). | Terkunci |
| D-03 | Guest tanpa login = Anonymous Sign-in dan hanya boleh **1 keanggotaan aktif** (`APPROVED`+`PENDING` di room ACTIVE). `IDLE`/`LEFT` tidak dihitung. Pindah room = keluar dulu. Batas lunak: hapus storage = sesi baru. | Terkunci (menggantikan D-03 lama) |
| D-04 | Semua tulis lewat RPC. Tidak ada policy INSERT/UPDATE/DELETE untuk client. | Terkunci |
| D-05 | Host tidak melihat `user_id` Guest: tabel `room_members` (terlihat Host) dipisah dari `member_identities` (privat). Akun login punya handle permanen sehingga bisa ditautkan antar room oleh sesama anggota; anonim tidak. | Terkunci |
| D-06 | Password room: 6 karakter dari alfabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (tanpa karakter mirip), acak kriptografis, di-hash `crypt(pw, gen_salt('bf', 10))`, **tampil sekali**, input dibandingkan case-insensitive (di-uppercase). | Terkunci |
| D-07 | Status room dihitung dari waktu, bukan menunggu cron. | Terkunci |
| D-08 | Mengetik = Broadcast agregat tanpa identitas, per-room toggle, ada kill switch global. | Terkunci |
| D-09 | Kapasitas dipilih Host saat membuat room, dibatasi cap tier. | Terkunci |
| D-10 | "Kursi" = member berstatus `APPROVED`. Kursi idle dilepas secara lazy (saat ada yang masuk) plus cron. | Terkunci |
| D-11 | Guest login boleh di banyak room, maks 5 keanggotaan aktif (`APPROVED`+`PENDING`). Guest anonim tetap 1 (D-03). | Default |
| D-12 | Pembayaran belum ada. `tier` diubah manual. | Terkunci |
| D-13 | Setelah room CLOSED, Guest kehilangan akses total. Hanya Host yang bisa membaca dan ekspor. | Default (usulan) |
| D-14 | **Handle** untuk semua orang (Host, Guest login, Guest anonim) berupa string acak `[a-z0-9]{9}` (mis. `wu32t76e3`) — kecuali handle terverifikasi buatan Admin (D-14b). Tidak ada nomor urut. User tidak bisa mengganti handle sendiri; hanya Admin. | Terkunci |
| D-14a | Akun login: handle permanen lintas room. Anonim: handle acak baru untuk tiap room yang dimasuki (disimpan per room, tetap sama jika kembali ke room yang sama). Pesan menyimpan snapshot handle; rename tidak mengubah pesan lama. | Default |
| D-14b | Nama buatan Admin (mis. organisasi) **tidak boleh cocok pola acak** `^[a-z0-9]{9}$`, tidak boleh reserved word, dan berlencana `VERIFIED`. Dengan itu handle berpola acak pasti buatan sistem. Lencana `HOST` diberikan server, bukan dari nama. | Default |
| D-15 | Aktor: **Host** (akun login; peran di room miliknya), **Guest login**, **Guest tanpa login**, **Admin platform** (login + MFA). Satu tipe akun untuk Host dan Guest login. | Tiga aktor pertama Terkunci; Admin & satu tipe akun Default |
| D-16 | Admin = kontrol penuh atas moderasi: rename handle, buat akun organisasi (undangan email), set tier, suspend user, tutup room, delist/ban room. Role hanya bisa diset lewat SQL/service_role. Semua RPC Admin wajib MFA (AAL2) dan tercatat di `admin_audit_log`. Admin tidak membaca isi pesan (harus tertulis di `/privasi` bila kebijakan berubah). | "Kontrol penuh" Terkunci; batas baca pesan Default |
| D-17 | Visibilitas room: `PRIVATE` (default; link + password; tidak di FYP) atau `PUBLIC` (tanpa password; tampil di FYP). Persetujuan Host tetap opsional di keduanya. | Terkunci |
| D-18 | FYP hanya menampilkan metadata (nama, deskripsi ≤ 200, kategori, jumlah anggota, aktivitas terakhir, label Penuh). Isi chat tidak tampil. Untuk membaca harus **join dulu** (memakai kursi). Urutan: Ramai, Terbaru; filter kategori; cari nama. Tanpa personalisasi. | Default |
| D-19 | Visibilitas ditetapkan saat membuat room. Hanya boleh **publik → privat** (tombol darurat: turun dari FYP + password baru). **Privat → publik dilarang** (riwayat akan terbuka bagi anggota baru). | Default |
| D-20 | Syarat moderasi sebelum FYP aktif: email terkonfirmasi untuk membuat room publik; kuota `max_public_rooms`; tombol Laporkan; ≥ 3 laporan unik → `HIDDEN` otomatis sampai Admin tinjau; Admin bisa delist/ban; halaman aturan konten + takedown. | Default |
| D-21 | Fitur FYP dikendalikan flag `app_config.public_rooms_enabled` (default `false`). M1/M2 boleh rilis tanpa FYP. | Default |
| D-22 | Istilah untuk persetujuan anggota oleh Host adalah **"Persetujuan Host"**. "Admin" hanya berarti Admin platform. | Terkunci |

Tidak masuk wave (parkir, lihat bagian "Backlog" di `TODO.md`): thread publik dari menfess, pembayaran, personalisasi FYP, Google OAuth.

## 3. Konfigurasi (di database, bukan hard-coded)

`tier_limits` (seed):

| tier | max_active_rooms | max_guests_cap | max_messages_per_room | max_public_rooms |
|---|---|---|---|---|
| free | 3 | 40 | 5000 | 1 (usulan) |
| premium | 10 (usulan) | 75 | 20000 (usulan) | 3 (usulan) |

`app_config` (key → value, seed):

| key | nilai | arti |
|---|---|---|
| message_max_length | 2000 | karakter per pesan |
| messages_per_minute | 20 | rate kirim per member |
| anon_max_active_rooms | 1 | keanggotaan aktif per sesi anonim (D-03) |
| login_max_active_rooms | 5 | keanggotaan aktif per akun login (D-11) |
| password_length | 6 | |
| lockout_fail_threshold | 5 | gagal per (room, ip_hash) |
| lockout_window_minutes | 15 | jendela hitung gagal |
| lockout_duration_minutes | 15 | lama kunci sejak gagal terakhir |
| room_failure_cap_per_hour | 200 | total gagal per room per jam |
| room_cooldown_minutes | 10 | semua join ditolak setelah cap tercapai |
| room_active_days | 7 | |
| room_grace_days | 15 | |
| pending_ttl_hours | 24 | PENDING lebih lama → `LEFT` |
| pending_cap_multiplier | 2 | maks PENDING = 2 × max_guests |
| typing_global_enabled | true | kill switch |
| typing_default_on_max_guests | 20 | default toggle ON bila max_guests ≤ nilai ini |
| public_rooms_enabled | false | flag FYP; M1/M2 boleh rilis tanpa FYP |
| public_join_per_ip_per_hour | 20 | rate limit join room publik per `ip_hash` |
| report_hide_threshold | 3 | laporan unik → `HIDDEN` otomatis |
| public_idle_default_minutes | 15 | default idle room publik |
| feed_cache_seconds | 30 | cache feed FYP (`s-maxage`) |
| public_description_max | 200 | panjang maksimum deskripsi room publik |
| categories | `umum, kampus, hobi, curhat, game, belajar, lainnya` | kategori FYP |

Catatan migrasi: kunci lama `max_rooms_per_guest` digantikan oleh `anon_max_active_rooms` dan `login_max_active_rooms`; migration aditif yang menghapus/menggantinya ada di tugas susulan T-10a.

Batas infrastruktur free plan yang harus diperhatikan (dicek Oktober 2026, verifikasi ulang): Supabase ±200 koneksi Realtime bersamaan, 2 juta pesan Realtime/bulan, DB 500 MB, proyek di-pause setelah 7 hari tidak aktif. **Pesan Realtime dihitung per penerima** (database change = 1 per client yang mendengarkan; Broadcast = 1 terkirim + 1 per penerima). Room 40 Guest berarti satu pesan chat ≈ 40 hitungan. Pantau di dasbor usage.

## 4. Data model (schema `public`, RLS aktif di semua)

**Catatan migrasi:** skema di bagian ini adalah **keadaan akhir**. Database yang sudah ada dimigrasikan lewat migration aditif (bukan edit migration lama). Migration baru hanya memuat selisih terhadap skema yang sudah terpasang, dan harus lolos `supabase db reset` dari nol.

- `profiles(user_id pk → auth.users on delete cascade, tier text not null default 'free' check in ('free','premium'), handle text unique not null, handle_verified bool not null default false, role text not null default 'user' check in ('user','admin'), suspended bool not null default false, created_at)`. Dibuat oleh trigger saat user **non-anonim** mendaftar; trigger mengisi `handle`.
  - `handle` selalu huruf kecil. Constraint: sistem `^[a-z0-9]{9}$` dengan `handle_verified=false`; **atau** buatan Admin `^[a-z0-9._-]{3,24}$`, **bukan** pola 9-acak, bukan reserved, dengan `handle_verified=true`.
  - `role` dan `handle` tidak bisa diubah client; hanya SQL/service_role (role) dan RPC Admin (handle).
- `reserved_handles(handle text pk)`. Seed minimal: `admin, host, system, support, moderator, mod, staff, official, root, null, undefined, anonymous`. Pengecekan reserved dilakukan trigger/generator.
- `handle_history(id bigint generated always as identity pk, user_id uuid not null → auth.users on delete cascade, old_handle text not null, new_handle text not null, changed_by uuid not null → auth.users, changed_at timestamptz not null default now())`.
- `admin_audit_log(id bigint generated always as identity pk, admin_id uuid not null → auth.users, action text not null, target_type text not null, target_id text null, detail jsonb not null default '{}', created_at timestamptz not null default now())`. Append-only, tanpa policy, tanpa grant ke client.
- `tier_limits`, `app_config` seperti bagian 3.
- `rooms(id uuid pk, slug text unique not null, host_id uuid not null → auth.users on delete cascade, name text not null check (char_length(name) between 1 and 80), password_hash text null, password_version int not null default 1, approval_required bool not null, max_guests int not null check (max_guests between 2 and 75), idle_timeout_minutes int not null default 30 check (idle_timeout_minutes between 10 and 240), typing_enabled bool not null, visibility text not null default 'PRIVATE' check (visibility in ('PRIVATE','PUBLIC')), description text null check (description is null or char_length(description) <= 200), category text null, listing_status text not null default 'LISTED' check (listing_status in ('LISTED','HIDDEN','BANNED')), listed_at timestamptz null, created_at, expires_at, closed_at null, delete_at)`.
  - `CHECK ((visibility = 'PRIVATE') = (password_hash is not null))`: room PRIVATE wajib punya password; room PUBLIC tidak boleh punya password.
  - `slug`: 16 karakter `[A-Za-z0-9_-]` dari `gen_random_bytes`. Tidak berurutan.
  - `expires_at = created_at + room_active_days`. `delete_at = expires_at + room_grace_days`; saat tutup manual menjadi `closed_at + room_grace_days`.
  - **Status turunan**: `ACTIVE` jika `closed_at is null and now() < expires_at`, selain itu `CLOSED`.
  - `listing_status`: `LISTED` (boleh tampil di FYP bila PUBLIC + ACTIVE + flag aktif), `HIDDEN` (disembunyikan otomatis karena laporan atau oleh Admin), `BANNED` (dilarang Admin).
- `room_members(id uuid pk, room_id → rooms on delete cascade, handle text not null, handle_verified bool not null default false, status member_status not null, password_version int not null, created_at, status_changed_at, unique(room_id, handle))`.
  - enum `member_status`: `PENDING`, `APPROVED`, `REJECTED`, `KICKED`, `IDLE`, `LEFT`.
  - Handle anonim dibuat saat join pertama dan dipertahankan untuk room yang sama. Handle login disalin dari `profiles`.
- `member_identities(member_id pk → room_members on delete cascade, room_id, user_id uuid not null, unique(room_id, user_id))`. **Tidak ada policy**: hanya fungsi `SECURITY DEFINER` yang menyentuhnya. Index di `user_id`.
- `member_activity(member_id pk → room_members on delete cascade, last_active_at timestamptz not null)`. Tidak masuk publication Realtime.
- `messages(id bigint generated always as identity pk, room_id → rooms on delete cascade, sender_type ('HOST','GUEST'), member_id null → room_members, sender_name text not null, sender_badge text null check (sender_badge in ('HOST','VERIFIED')), content text not null check (char_length(content) <= 2000), client_msg_id uuid not null, created_at, unique(room_id, client_msg_id))`. Index `(room_id, id desc)`. Paginasi memakai `id`, bukan `created_at`. `sender_name` adalah snapshot handle; rename tidak mengubah pesan lama.
- `room_stats(room_id pk → rooms on delete cascade, approved_count int not null default 0, messages_last_hour int not null default 0, last_message_at timestamptz null, updated_at timestamptz not null default now())`. Tidak masuk publication Realtime.
- `room_reports(id bigint generated always as identity pk, room_id → rooms on delete cascade, reporter_user_id uuid not null → auth.users on delete cascade, reason text not null check (reason in ('SPAM','ABUSE','ILLEGAL','OTHER')), created_at timestamptz not null default now(), unique(room_id, reporter_user_id))`. Tanpa policy.
- `join_attempts(id bigint, room_id, ip_hash text, success bool, created_at)`. Index `(room_id, ip_hash, created_at)`. Dihapus setelah 24 jam.

## 5. RLS, privilege, publication

- `REVOKE ALL` pada semua tabel dan fungsi dari `PUBLIC`, `anon`, `authenticated`. `ALTER DEFAULT PRIVILEGES` agar objek baru ikut tertutup. Berikan hanya yang tercantum di bawah.
- Fungsi pembantu di schema privat `app_private` (`SECURITY DEFINER`, `STABLE`, `search_path=''`): `is_room_host(room_id)`, `is_approved_member(room_id)`, `is_self_member(member_id)`, `room_is_active(room_id)`, `room_is_readable_by_host(room_id)` (`now() < delete_at`), `is_admin_aal2()` (role admin **dan** `auth.jwt()->>'aal' = 'aal2'`), `is_email_confirmed()` (memeriksa `auth.users.email_confirmed_at` untuk `auth.uid()`).
- Policy (semua `TO authenticated`, hanya SELECT):
  - `messages`: Host pemilik room dan `now() < delete_at`; atau `is_approved_member(room_id)` dan `room_is_active(room_id)`.
  - `room_members`: Host pemilik room; atau `is_self_member(id)`. Host hanya melihat handle/status, bukan `user_id`.
  - `rooms`: `GRANT SELECT (id, slug, name, approval_required, max_guests, idle_timeout_minutes, typing_enabled, visibility, description, category, listing_status, listed_at, created_at, expires_at, closed_at, delete_at, password_version)` + policy `host_id = auth.uid()`. **Kolom `password_hash` tidak diberi grant.**
  - `profiles`: SELECT baris sendiri. **UPDATE/INSERT/DELETE ditolak untuk semua client** (handle, role, tier tidak bisa diubah sendiri).
  - `tier_limits`, `app_config`: semua authenticated.
  - `member_identities`, `member_activity`, `join_attempts`: RLS aktif, **tanpa policy** (tolak semua).
  - `handle_history`, `admin_audit_log`, `room_reports`, `room_stats`, `reserved_handles`: RLS aktif, **tanpa policy** untuk client.
- `list_public_rooms` boleh `EXECUTE` oleh `anon` dan `authenticated`; hanya kolom whitelist; hanya `visibility='PUBLIC'`, `listing_status='LISTED'`, room ACTIVE, dan `public_rooms_enabled=true`.
- Publication `supabase_realtime`: hanya `messages` dan `room_members`. `room_stats` tidak masuk publication.
- Realtime Authorization (`realtime.messages`): izinkan `SELECT`/`INSERT` ber-extension broadcast untuk topic `typing:<room_id>` hanya bagi Host atau member `APPROVED` pada room `ACTIVE` dengan fitur mengetik aktif. Matikan akses channel publik di pengaturan Realtime (jika tersedia) agar channel wajib private.

## 6. Kontrak RPC

Konvensi: error = `ERRCODE 'P0001'`, `MESSAGE` = kode di bawah, `DETAIL` = JSON opsional (mis. `{"retry_after":600}`). Client memetakan berdasarkan `error.message`.

Kode error baru ADDENDUM-01: `ONE_ROOM_LIMIT`, `NOT_ADMIN`, `MFA_REQUIRED`, `HANDLE_INVALID`, `HANDLE_TAKEN`, `HANDLE_RESERVED`, `PUBLIC_QUOTA_REACHED`, `EMAIL_NOT_CONFIRMED`, `VISIBILITY_LOCKED`, `ROOM_HIDDEN`, `ROOM_BANNED`, `FEATURE_DISABLED`, `ALREADY_REPORTED`, `REPORT_NOT_ALLOWED`, `USER_SUSPENDED`.

**Host** (`authenticated`, JWT **non-anonim** wajib, else `NOT_HOST`):

| RPC | Argumen | Mengembalikan | Error |
|---|---|---|---|
| `create_room` | `p_name, p_max_guests, p_approval_required, p_idle_timeout_minutes, p_typing_enabled, p_visibility default 'PRIVATE', p_description default null, p_category default null` | `room_id, slug, password (null jika PUBLIC), expires_at` | `INVALID_INPUT`, `CAPACITY_EXCEEDS_TIER`, `QUOTA_REACHED`, `PUBLIC_QUOTA_REACHED`, `EMAIL_NOT_CONFIRMED`, `FEATURE_DISABLED`, `USER_SUSPENDED` |
| `regenerate_password` | `p_room_id` | `password` (sekali). Menaikkan `password_version`. Hanya room PRIVATE; PUBLIC → `INVALID_INPUT`. | `NOT_FOUND`, `ROOM_CLOSED`, `INVALID_INPUT` |
| `make_room_private` | `p_room_id` | `password` (sekali). Menurunkan dari FYP (`listing_status='HIDDEN'`, `listed_at=null`), membuat password baru, menaikkan `password_version`. Hanya untuk room PUBLIC; room PRIVATE → `INVALID_INPUT`. | `NOT_FOUND`, `ROOM_CLOSED`, `INVALID_INPUT` |
| `update_room_settings` | `p_room_id` + `p_approval_required, p_max_guests, p_idle_timeout_minutes, p_typing_enabled` (null = tetap), `p_visibility default null` (hanya boleh null/sama) | baris room **tanpa `password_hash`** | `NOT_FOUND`, `INVALID_INPUT`, `CAPACITY_EXCEEDS_TIER`, `CAPACITY_BELOW_MEMBERS`, `ROOM_CLOSED`, `VISIBILITY_LOCKED` |
| `close_room` | `p_room_id` | void. Set `closed_at`, hitung ulang `delete_at`. | `NOT_FOUND` |
| `decide_member` | `p_member_id, p_decision ('APPROVE'\|'REJECT')` | `id, handle, handle_verified, status` | `NOT_FOUND`, `NOT_PENDING`, `ROOM_FULL`, `ROOM_CLOSED` |
| `kick_member` | `p_member_id` | void (status `KICKED`) | `NOT_FOUND` |
| `list_members` | `p_room_id` | `id, handle, handle_verified, status, created_at` (**tanpa user_id**) | `NOT_FOUND` |
| `list_hosted_rooms` | — | room + status turunan + `visibility`, `listing_status`, `approved_count`, `pending_count`, kuota room `{used, max}` + `public_quota {used, max}` | — |
| `export_messages` | `p_room_id, p_after_id default 0, p_limit default 1000` | pesan urut naik (termasuk `sender_name` snapshot handle + `sender_badge`) | `NOT_FOUND` |

Catatan `create_room`: `p_idle_timeout_minutes` boleh null → default 30 untuk PRIVATE, `public_idle_default_minutes` untuk PUBLIC. Room PUBLIC wajib `public_rooms_enabled=true`, email terkonfirmasi, dan kuota `max_public_rooms` tier; room PUBLIC yang berhasil dibuat langsung `listing_status='LISTED'` dan `listed_at=now()`. `p_description` maksimum `public_description_max`; `p_category` harus salah satu `categories`. `update_room_settings` **tidak boleh** mengubah visibilitas: `p_visibility` hanya boleh null atau sama dengan nilai saat ini; upaya mengubah (termasuk privat → publik) → `VISIBILITY_LOCKED`.

**Guest/member** (`authenticated`, termasuk anonim):

| RPC | Argumen | Mengembalikan | Error |
|---|---|---|---|
| `get_room_public` | `p_slug` | `room_id, name, status ('ACTIVE'\|'CLOSED'), visibility, typing_effective` | `NOT_FOUND` |
| `rejoin_room` | `p_room_id` | `status`. Hanya untuk `IDLE` dengan `password_version` sama. | `NOT_MEMBER`, `KICKED`, `ROOM_CLOSED`, `ROOM_FULL`, `PASSWORD_CHANGED`, `ONE_ROOM_LIMIT`, `ROOM_HIDDEN`, `ROOM_BANNED` |
| `my_rooms` | — | `room_id, slug, name, room_status, my_status, handle, handle_verified, expires_at` (room ACTIVE saja). **Hanya user login**; JWT anonim → `NOT_MEMBER`. | `NOT_MEMBER` |
| `list_messages` | `p_room_id, p_before_id null, p_after_id null, p_limit default 50 (maks 100)` | pesan (termasuk `sender_name` snapshot handle + `sender_badge`) | `NOT_MEMBER`, `ROOM_CLOSED` |
| `send_message` | `p_room_id, p_content, p_client_msg_id` | baris pesan. **Idempotent** pada `client_msg_id`. Sender dan handle diturunkan dari DB. Memperbarui `last_active_at`. | `NOT_MEMBER`, `ROOM_CLOSED`, `MESSAGE_TOO_LONG`, `RATE_LIMITED`, `ROOM_MESSAGE_LIMIT`, `USER_SUSPENDED` |
| `touch_activity` | `p_room_id` | status member saat ini (`APPROVED`, `IDLE`, `KICKED`, ...) | `NOT_MEMBER` |
| `leave_room` | `p_room_id` | void (status `LEFT`, kursi lepas) | `NOT_MEMBER` |

**Publik (FYP)** (`anon` dan `authenticated`):

| RPC | Argumen | Mengembalikan | Error |
|---|---|---|---|
| `list_public_rooms` | `p_sort 'ACTIVE'\|'NEW', p_category null, p_q null, p_cursor null, p_limit default 20 (maks 50)` | `slug, name, description, category, approved_count, max_guests, last_activity_at, is_full`. Urutan `ACTIVE` = `messages_last_hour` desc lalu `approved_count` desc; `NEW` = `listed_at` desc. | `FEATURE_DISABLED` |
| `report_room` | `p_room_id, p_reason 'SPAM'\|'ABUSE'\|'ILLEGAL'\|'OTHER'` | void. Hanya user login atau member room; room PRIVATE hanya boleh dilaporkan member; Host tidak boleh melaporkan room miliknya. Mencapai `report_hide_threshold` laporan unik → `listing_status='HIDDEN'`. | `ALREADY_REPORTED`, `REPORT_NOT_ALLOWED`, `USER_SUSPENDED` |

**Khusus server** (`service_role` saja; **tidak** boleh bisa dipanggil `authenticated`/`anon`):

`join_room(p_user_id uuid, p_is_anonymous bool, p_slug text, p_password text null, p_ip_hash text)` → `status, room_id, member_id, handle`.
Urutan wajib:
1. Room tidak ada → `ROOM_NOT_FOUND`. Room CLOSED → `ROOM_CLOSED`. `listing_status='HIDDEN'` → `ROOM_HIDDEN`; `'BANNED'` → `ROOM_BANNED`. Room PUBLIC saat flag FYP mati → `FEATURE_DISABLED`. User login yang `profiles.suspended` → `USER_SUSPENDED`.
2. Cooldown room (gagal ≥ `room_failure_cap_per_hour` dalam 1 jam) → `ROOM_COOLDOWN`. Lockout (gagal ≥ 5 dalam 15 menit untuk `(room, ip_hash)`) → `LOCKED` + `retry_after`.
3. Jika `p_user_id` sudah member `KICKED` → `KICKED`; `REJECTED` → `REJECTED`. Member `PENDING`/`APPROVED` → kembalikan status saat ini (bukan percobaan password).
4. Room PRIVATE: verifikasi password (case-insensitive). Salah → catat gagal, `WRONG_PASSWORD`. Benar → catat berhasil. Room PUBLIC: lewati cek password, tetapi terapkan rate limit `public_join_per_ip_per_hour` per `ip_hash` (dihitung dari `join_attempts` dalam 1 jam) → `RATE_LIMITED` + `retry_after` bila terlampaui.
5. Aturan keanggotaan aktif (`APPROVED`+`PENDING` di room ACTIVE lain): anonim ≥ `anon_max_active_rooms` → `ONE_ROOM_LIMIT`; login ≥ `login_max_active_rooms` → `MAX_ROOMS_PER_GUEST`.
6. `release_idle_members(room)` (lazy). Jika `approval_required` → `PENDING` (tolak `ROOM_FULL` bila PENDING ≥ cap). Jika tidak → bila kursi `APPROVED` < `max_guests` jadi `APPROVED`, selain itu `ROOM_FULL`.
7. Baris `IDLE`/`LEFT` milik user yang sama dipakai ulang. Handle anonim dipertahankan bila sudah ada untuk room itu; jika belum, buat handle acak baru yang tidak bentrok dengan handle Host atau member lain di room itu. Handle login disalin dari `profiles`.
8. Tidak ada penomoran urut.

Catatan: `p_is_anonymous` dan `p_user_id` wajib berasal dari verifikasi token di server, bukan dari body client. Fungsi ini service-only. User yang `profiles.suspended` hanya boleh membaca; create/join/send/report ditolak `USER_SUSPENDED`.

**Admin platform** (semua wajib `is_admin_aal2()`, else `NOT_ADMIN`/`MFA_REQUIRED`; semua menulis `admin_audit_log`). RPC yang menyebut `p_user_id` hanya berlaku untuk akun login yang punya baris `profiles`; user anonim tidak punya handle global dan tidak bisa di-rename/di-suspend lewat RPC ini.

| RPC | Argumen | Mengembalikan | Error |
|---|---|---|---|
| `admin_rename_handle` | `p_user_id, p_new_handle, p_verified` | void. Juga memperbarui `room_members.handle` milik user itu di room ACTIVE dan mengisi `handle_history`. `p_verified` wajib `true`; handle wajib pola Admin, bukan 9-acak, bukan reserved. | `NOT_ADMIN`, `MFA_REQUIRED`, `HANDLE_INVALID`, `HANDLE_TAKEN`, `HANDLE_RESERVED` |
| `admin_set_tier` | `p_user_id, p_tier ('free'\|'premium')` | void | `NOT_ADMIN`, `MFA_REQUIRED`, `NOT_FOUND`, `INVALID_INPUT` |
| `admin_suspend_user` | `p_user_id, p_suspended bool` | void | `NOT_ADMIN`, `MFA_REQUIRED`, `NOT_FOUND` |
| `admin_close_room` | `p_room_id` | void | `NOT_ADMIN`, `MFA_REQUIRED`, `NOT_FOUND` |
| `admin_set_listing` | `p_room_id, p_status ('LISTED'\|'HIDDEN'\|'BANNED')` | void. Room PRIVATE tidak boleh di-`LISTED` → `VISIBILITY_LOCKED`. | `NOT_ADMIN`, `MFA_REQUIRED`, `NOT_FOUND`, `VISIBILITY_LOCKED` |
| `admin_list_users` | `p_q null, p_cursor null` | user_id, handle, handle_verified, role, tier, suspended, created_at | `NOT_ADMIN`, `MFA_REQUIRED` |
| `admin_list_reports` | `p_status null, p_cursor null` | laporan + metadata room + status | `NOT_ADMIN`, `MFA_REQUIRED` |

Catatan: `admin_list_reports.p_status` memfilter `rooms.listing_status` (`LISTED`/`HIDDEN`/`BANNED`); `room_reports` tidak punya kolom status terpisah.

**Internal/cron** (tanpa grant ke client): `release_idle_members(p_room_id default null)`, `expire_pending_members()`, `purge_join_attempts()`, `delete_expired_rooms()`, `refresh_room_stats()`.

## 7. API server (Astro)

`POST /api/rooms/join` — body `{ slug, password?, turnstileToken }`, header `Authorization: Bearer <access_token>`.

1. Validasi `joinRequestSchema` (zod). `password` opsional (wajib hanya untuk room PRIVATE; server tidak tahu visibilitas sebelum RPC, jadi kirim null bila kosong).
2. `verifyTurnstile(token, ip)`; gagal → 403 `TURNSTILE_FAILED`.
3. `verifyAccessToken(token)` → `user_id`; ambil `is_anonymous` dari hasil `getUser(token)` (bukan dari body); gagal → 401.
4. `hashIp(clientAddress, IP_HASH_SALT)`. Jangan percaya header IP dari client selain yang disediakan adapter Vercel.
5. Panggil RPC `join_room(p_user_id, p_is_anonymous, p_slug, p_password, p_ip_hash)` dengan `service_role`.
6. Petakan error: `WRONG_PASSWORD`→401, `LOCKED`/`ROOM_COOLDOWN`/`RATE_LIMITED`→429 (+`Retry-After`), `ROOM_FULL`/`MAX_ROOMS_PER_GUEST`/`KICKED`/`REJECTED`/`ROOM_CLOSED`→403 dengan `code`, `ROOM_NOT_FOUND`→404, `ONE_ROOM_LIMIT`→409, `ROOM_HIDDEN`/`ROOM_BANNED`→404, `FEATURE_DISABLED`/`USER_SUSPENDED`→403. Respons sukses: `{ status, roomId, memberId, handle }`.
7. Satu rule rate limit Vercel WAF pada path ini (dipasang manusia).

Endpoint baru:

- `GET /api/rooms/public` — query zod (`sort`, `category`, `q`, `cursor`, `limit`), panggil `list_public_rooms`, kirim `Cache-Control: public, s-maxage=30, stale-while-revalidate=60`. Tidak menambah kolom di luar whitelist RPC.
- `POST /api/rooms/report` — body `{ roomId, reason, turnstileToken }`, header JWT; Turnstile + verifikasi JWT + panggil `report_room`, petakan `ALREADY_REPORTED`→409, `REPORT_NOT_ALLOWED`→403, `USER_SUSPENDED`→403.
- `POST /api/admin/users` — body `{ email, handle }`; buat akun organisasi lewat Supabase Admin API (`inviteUserByEmail`), wajib admin AAL2 (verifikasi klaim `role` dan `aal` dari JWT **sebelum** memakai `service_role`), lalu panggil `admin_rename_handle`, catat audit.

`GET /api/health[?db=1]` sudah ada (dipakai keep-alive).

## 8. Realtime & perilaku client

- **Pesan**: Postgres Changes `INSERT` pada `messages` filter `room_id=eq.<id>`. Saat `SUBSCRIBED` (termasuk reconnect) panggil `list_messages(p_after_id = id terakhir)` untuk menambal pesan yang terlewat. Dedupe berdasarkan `id` dan `client_msg_id`. Kirim optimistis dengan `client_msg_id` baru.
- **Status member**: Postgres Changes pada `room_members` filter `room_id`. Guest hanya menerima barisnya sendiri (RLS), Host menerima semua.
- **Riwayat**: 50 pesan terakhir saat masuk, scroll ke atas memuat lebih lama (`p_before_id`).
- **Heartbeat**: saat tab `visible` dan online, panggil `touch_activity` tiap 120 detik dan saat tab kembali visible. Tab tersembunyi tidak mengirim heartbeat. Hasil `IDLE`/`KICKED`/`LEFT` → tampilkan layar sesuai status.
- **Auto-kick idle**: member `APPROVED` dengan `last_active_at` lebih tua dari `idle_timeout_minutes` (default 30 untuk PRIVATE; default `public_idle_default_minutes` = 15 untuk PUBLIC; pilihan Host 10–240) menjadi `IDLE`. Dijalankan cron tiap 5 menit **dan** secara lazy saat room penuh. Guest `IDLE` melihat "Kamu keluar otomatis karena tidak aktif" + tombol **Masuk lagi** (`rejoin_room`, tanpa mengetik password bila `password_version` tidak berubah). Host tidak pernah idle-kick.
- **Mengetik**:
  - Channel Broadcast **private** `typing:<room_id>`, event `typing`, payload `{ s: "<8 hex acak per tab>" }` (tanpa identitas member).
  - Pengirim: saat input berubah, kirim paling sering sekali per 5 detik. Berhenti kirim setelah tidak mengetik.
  - Penerima: hitung `s` unik dalam 6 detik terakhir → "Ada yang sedang mengetik…" / "N orang sedang mengetik…". Abaikan event dari diri sendiri.
  - Aktif jika `rooms.typing_enabled` **dan** `app_config.typing_global_enabled` (field `typing_effective`). Default `typing_enabled` = `max_guests <= 20`.
  - Biaya: satu event ≈ satu pesan chat dalam hitungan kuota. Batasi (throttle) dan jangan dikirim bila tidak ada orang lain di room.
  - Keterbatasan diterima: otorisasi channel private kemungkinan hanya dievaluasi saat join, jadi member yang baru dikeluarkan masih bisa menerima denyut "mengetik" sampai reconnect. Payload tidak berisi konten/identitas. Client wajib unsubscribe saat status bukan `APPROVED`. **Verifikasi perilaku ini di T-15/T-60.**
- **Multi-room**:
  - Sesi anonim Supabase tersimpan di browser (`persistSession`) dan hanya boleh **1 keanggotaan aktif**. `leave_room` dan status `IDLE` melepas slot. UI menawarkan "Keluar dari room X dan gabung ke sini" bila `ONE_ROOM_LIMIT`.
  - Akun login boleh **5 keanggotaan aktif**. Halaman `/rooms` hanya untuk user login dan memakai `my_rooms()`; anonim melihat info "kamu sedang di room X" dari state sesi lokal.
  - Penanda belum-dibaca disimpan di `localStorage` kunci `lastRead:<room_id>` (id pesan terakhir). Batasan yang harus ditampilkan di UI: data hilang jika storage dibersihkan, ganti perangkat, atau browser menghapus storage situs yang lama tidak dibuka (mis. Safari ±7 hari).
- **Ekspor**: baris `[DD-MM-YYYY HH:MM] <handle>: isi` (WIB, `Asia/Jakarta`), header nama room + waktu ekspor; baris lanjutan diberi indentasi.
- **Lencana**: `HOST` dan `VERIFIED` datang dari server (`messages.sender_badge`, `room_members.handle_verified`), bukan dari teks nama.

## 9. Lifecycle & cron (pg_cron)

| Job | Jadwal | Aksi |
|---|---|---|
| `release_idle_members()` | tiap 5 menit | APPROVED idle → `IDLE` |
| `expire_pending_members()` | tiap jam | PENDING > `pending_ttl_hours` → `LEFT` |
| `purge_join_attempts()` | tiap jam | hapus > 24 jam |
| `delete_expired_rooms()` | harian 20:00 UTC (03:00 WIB) | hapus room dengan `delete_at < now()` (cascade) |
| `refresh_room_stats()` | tiap menit | hitung ulang `approved_count`, `messages_last_hour`, `last_message_at` untuk FYP |

Pelepasan kursi tidak bergantung pada cron karena juga dilakukan lazy. Akses sudah diblokir RLS meski cron gagal. Keep-alive: workflow `.github/workflows/keepalive.yml` memanggil `/api/health?db=1`.

## 10. Persyaratan keamanan dan tes wajib (dikerjakan S)

Semua harus **ditolak** / benar. Tulis sebagai skrip otomatis di `scripts/security/` dan tes SQL di `supabase/tests/security/`.

| ID | Uji | Hasil yang benar |
|---|---|---|
| S-01 | Host `PATCH /rest/v1/rooms` mengubah `expires_at`/`closed_at`/`max_guests` langsung | ditolak (tidak ada policy UPDATE) |
| S-02 | Host `INSERT` ke `rooms` langsung (lewati kuota) | ditolak |
| S-03 | Host mengubah `profiles.tier` sendiri | ditolak |
| S-04 | `send_message` dengan `sender_name:'Host'` atau parameter sender | parameter tidak ada; sender dari DB |
| S-05 | Guest room A membaca pesan room B (REST dan Realtime) | kosong / ditolak |
| S-06 | Guest `KICKED`/`IDLE`/`LEFT` memanggil `send_message` dan menerima event pesan baru | `NOT_MEMBER`; tidak menerima event |
| S-07 | JWT anonim memanggil `create_room` dan semua RPC Host | `NOT_HOST` |
| S-08 | `authenticated`/`anon` memanggil `join_room` | permission denied |
| S-09 | Host membaca `room_members` / `list_members` | tidak ada `user_id`; tidak ada handle bernomor/berurutan; `member_identities` tidak terbaca |
| S-10 | Host membaca kolom `password_hash` | permission denied |
| S-11 | 6 percobaan password salah dari satu `ip_hash` | percobaan ke-6 → `LOCKED` |
| S-12 | Dua IPv6 dalam satu /64 | dihitung satu klien |
| S-13 | Membuka dua tab Host berbarengan saat kuota 2/3 | tepat satu room ke-3 berhasil |
| S-14 | Guest ke-N+1 saat kursi penuh; dua approve bersamaan | `ROOM_FULL`; tidak ada handle ganda |
| S-15 | Query katalog: semua tabel `public` ber-RLS; semua fungsi `SECURITY DEFINER` punya `search_path`; tidak ada EXECUTE ke `PUBLIC`/`anon` selain yang dikontrak | lolos |
| S-16 | `grep` bundle client untuk `SERVICE_ROLE`, `TURNSTILE_SECRET`, `IP_HASH_SALT` | tidak ada |
| S-17 | Pesan `<img src=x onerror=...>` dan `javascript:` URL | tampil sebagai teks; tidak tereksekusi |
| S-18 | Header: `Referrer-Policy: no-referrer`, CSP, `X-Robots-Tag` di `/r/*` | ada |
| S-19 | Pesan setelah `closed_at`/`expires_at` | `ROOM_CLOSED` |
| S-20 | Akses room setelah `delete_at` walau cron belum jalan | ditolak RLS |
| S-21 | Room privat muncul di `list_public_rooms`/pencarian | tidak pernah |
| S-22 | `anon` memanggil `list_public_rooms` dan membaca kolom sensitif | hanya kolom whitelist |
| S-23 | `update_room_settings`/REST mengubah privat → publik | `VISIBILITY_LOCKED` / ditolak |
| S-24 | Satu user melapor dua kali; pelapor bukan member/login | satu hitungan; `REPORT_NOT_ALLOWED` |
| S-25 | Join baru ke room `HIDDEN`/`BANNED` | ditolak |
| S-26 | User `UPDATE profiles` (handle/role/tier) lewat REST | ditolak |
| S-27 | RPC Admin tanpa role admin / tanpa AAL2 | `NOT_ADMIN` / `MFA_REQUIRED` |
| S-28 | Membuat handle berpola 9-acak, reserved word, atau tanpa verified lewat RPC Admin | `HANDLE_INVALID`/`HANDLE_RESERVED` |
| S-29 | Host menautkan satu Guest anonim antar room | tidak mungkin (tidak ada identifier bersama) |
| S-30 | Sesi anonim join room ke-2 sebelum keluar dari yang pertama; setelah `leave_room`/`IDLE` | `ONE_ROOM_LIMIT`; lalu berhasil |
| S-31 | `create_room` PUBLIC dengan email belum terkonfirmasi / kuota publik habis / flag mati | `EMAIL_NOT_CONFIRMED` / `PUBLIC_QUOTA_REACHED` / `FEATURE_DISABLED` |
| S-32 | `admin_audit_log` dibaca/diubah client | ditolak |

## 11. Halaman (agent F)

`/` landing · `/login`, `/register` (satu alur untuk Host dan Guest login; Turnstile) · `/dashboard` (daftar room, sisa kuota, buat room) · `/dashboard/r/<id>` (ruang Host: chat + panel member Approve/Reject/Kick, ganti password, tutup, ekspor) · `/r/<slug>` (Guest: disclaimer → Turnstile → anonymous sign-in → password bila PRIVATE → status lobby/chat) · `/rooms` (Ruang saya; **hanya user login**) · `/jelajahi` (FYP room publik) · `/admin/*` (pengguna, laporan, room, audit; wajib login admin + MFA) · `/aturan-konten` · `/privasi` dan `/batas-anonimitas`.

Keadaan Guest yang wajib ditangani: password salah, terkunci (tampilkan waktu tunggu), room penuh, menunggu persetujuan, ditolak, dikeluarkan, idle (tombol Masuk lagi), room ditutup, **`ONE_ROOM_LIMIT`** ("Keluar dulu dari room X"), room `HIDDEN`/`BANNED`, `FEATURE_DISABLED`, dan batas 5 room untuk akun login.

Form buat room: nama, kapasitas (slider 2…cap tier, tampilkan cap), approval, timeout idle (10/30/60/120/240 menit; default 15 untuk publik), toggle mengetik (default sesuai `max_guests`), **pemilih visibilitas (default privat)**, deskripsi (≤ 200), kategori, sisa kuota publik, dan tombol **"Jadikan privat"** yang menampilkan password baru sekali. Saat kuota habis tampilkan "Batas room aktif tercapai (3/3)" tanpa tombol bayar.

Komponen `<Handle>` dipakai untuk semua tampilan nama (pesan, daftar member, ekspor) dengan lencana `HOST`/`VERIFIED` dari server. Nama room, deskripsi, dan handle dirender sebagai **teks biasa**.

Room publik wajib menampilkan disclaimer: isi chat dapat dibaca dan disalin siapa pun yang join. `/rooms` hanya untuk user login; anonim melihat info "kamu sedang di room X". Halaman `/admin/*` tidak boleh bisa diakses tanpa guard server-side (bukan hanya menyembunyikan menu).

Ekspor `.txt` dibuat di browser dari `export_messages` berhalaman. Baris: `[DD-MM-YYYY HH:MM] <handle>: isi` (WIB, `Asia/Jakarta`), header nama room + waktu ekspor; baris lanjutan diberi indentasi.
Desain: pakai `design/tokens.css` (sementara; token Figma menyusul di T-30). Tema terpilih: DNA template **Stiker bawaan** situs utama (mint `#DFF2EC→#BFE5DA`, ink `#1F4D46`, aksen koral `#E8604C`, panel kaca miring) — dipilih manusia 2026-10-28; palet kaca-blush sudah dipakai subsite form. Kerangka UI statis (T-31) sudah dikerjakan; keadaan Guest dapat dipratinjau lewat query `?state=…` di `/r/<slug>`.

## 12. Environment

`PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `PUBLIC_TURNSTILE_SITE_KEY` (publik) · `SUPABASE_SERVICE_ROLE_KEY`, `TURNSTILE_SECRET_KEY`, `IP_HASH_SALT` (≥ 32 karakter, rahasia). Skema dideklarasikan di `astro.config.mjs` (`astro:env`). Runtime Node ≥ 22.22 (atur di Vercel).

## 13. Di luar scope MVP

Pembayaran/langganan aktif, Cloudflare proxy, co-host, edit/hapus pesan, file/media, E2EE, presence "siapa online", nama pengetik, notifikasi push/email, penautan akun Guest antar-perangkat, thread publik dari menfess, personalisasi FYP, Google OAuth, penanda 18+, laporan lanjutan.

## 14. Pertanyaan terbuka (default dipakai sampai manusia memutuskan)

1. Angka kuota/kapasitas tier (bagian 3), termasuk `max_public_rooms` dan `login_max_active_rooms`.
2. D-13: Guest kehilangan akses total setelah CLOSED.
3. Supabase: akun/proyek baru terpisah (default).
4. Konfirmasi email: aktif dan **wajib untuk membuat room publik**. SMTP bawaan Supabase terbatas; default aktif.
5. Google OAuth untuk Host: fase berikutnya.
6. Nama produk dan subdomain final.
7. Konfirmasi keputusan Default ADDENDUM-01 (H-02): D-11 (maks 5), D-14a (handle akun permanen), D-16 (Admin tidak membaca pesan), D-18 (join dulu untuk membaca room publik), D-19 (privat → publik dilarang), kuota publik.
8. Daftar kategori FYP final (default: `umum, kampus, hobi, curhat, game, belajar, lainnya`).
