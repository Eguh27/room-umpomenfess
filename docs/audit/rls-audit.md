# Audit RLS, RPC, dan Grant — T-60

- **Tanggal:** 2026-10-29
- **Peran:** S (Security / QA)
- **Mode:** Plan (tidak mengubah kode produk, migration, atau kontrak)
- **Lingkup:** `supabase/migrations/0001_init_schema.sql` … `0005_cron_realtime.sql`, RPC Host/Guest, RLS, grant, publication Realtime, `src/lib/ip.ts`, `src/pages/api/rooms/join.ts`, dan tes SQL yang ada.
- **Database uji:** Supabase lokal (`supabase_db_umpomenfess-room`), migration 0001–0005. Semua uji live dijalankan di dalam `begin; … rollback;` sehingga tidak meninggalkan data.
- **Referensi kontrak:** `TASK.md` bagian 4–6, 8, 10; `TODO.md` T-60.

## 1. Ringkasan eksekutif

Baseline keamanan database sudah kuat:

- RLS aktif di semua tabel `public`; tidak ada policy INSERT/UPDATE/DELETE untuk `anon`/`authenticated` di tabel inti.
- Semua fungsi `SECURITY DEFINER` yang diperiksa memasang `search_path = ''`; helper internal dicabut dari client.
- `join_room` dan `record_join_failure` hanya dapat dieksekusi `service_role`; RPC Host menolak JWT anonim.
- `password_hash` tidak diberikan ke client; `member_identities`, `member_activity`, dan `join_attempts` tidak dapat dibaca langsung.
- Publication Realtime hanya memuat `messages` dan `room_members`; `member_identities` tidak dipublikasikan.
- `realtime.messages` sudah RLS dan memiliki policy SELECT + INSERT untuk topik `typing:<room_id>`.

Namun audit menemukan **2 temuan High, 9 Medium, dan 9 Low**. Yang paling penting:

1. **S-20 belum lolos.** `delete_at` tidak ditegakkan di policy SELECT `rooms`/`room_members`, sehingga Host masih bisa membaca room dan daftar member setelah `delete_at` (sampai cron harian menghapus room). Guest juga masih bisa membaca baris `room_members` miliknya sendiri.
2. **`close_room` dapat menghidupkan kembali room yang sudah melewati `delete_at`** dan memperpanjang `delete_at` selama grace period. Setelah itu Host dapat membaca/ekspor pesan lagi.
3. **`send_message` tidak mengunci room.** Ini menciptakan risiko deadlock dengan `decide_member`/`join_room`/`rejoin_room`, balapan dengan `close_room`, dan balapan kuota pesan/rate limit.
4. **Pencatatan kegagalan join terpisah dari `join_room`** memberi celah bagi percobaan paralel untuk melewati ambang lockout 5 percobaan.
5. **`member_identities` tidak memiliki constraint komposit `(member_id, room_id)`.** Baris identitas yang tidak konsisten dapat membuat user dianggap APPROVED di room lain. Tidak dapat ditulis client saat ini, tetapi ini lapisan pertahanan yang penting.

Prioritas perbaikan: **S-60-01, S-60-02, S-60-06, S-60-08** sebelum deploy; sisanya masuk T-64 sesuai zona masing-masing.

## 2. Metode dan batasan

- **Statis:** membaca seluruh migration, definisi RPC, policy, grant, publication, dan tes SQL.
- **Live:** query katalog PostgreSQL (`pg_policies`, `pg_class`, `pg_proc`) dan uji perilaku RLS/RPC dengan `set local role authenticated` + `request.jwt.claims`, lalu `rollback`.
- **Tidak dilakukan:** pengujian beban, pengujian Realtime dua client secara otomatis, pengujian hosted Supabase, dan pengujian UI.
- **Batasan:** hasil live memakai seed lokal (`dev@example.com`, `dev2@example.com`). Tidak ada data produksi yang disentuh. Uji konkurensi `send_message`/lockout dianalisis dari kode dan urutan lock, bukan dijalankan dengan puluhan koneksi paralel.

## 3. Tabel temuan

| ID | Tingkat | Area | Ringkasan |
|---|---|---|---|
| S-60-01 | **High** | RLS | `delete_at` tidak ditegakkan di `rooms_select_host` dan `room_members_select`; S-20 gagal. |
| S-60-02 | **High** | RPC Host | `close_room` dapat memperpanjang `delete_at` setelah room melewati `delete_at`. |
| S-60-03 | Medium | RPC Host | `list_members` mengembalikan daftar member setelah `delete_at`. |
| S-60-04 | Medium | RPC Host/Guest | `kick_member` dan `leave_room` masih memutasi status setelah `delete_at`; `touch_activity` masih mengembalikan status. |
| S-60-05 | Medium | RPC publik | `get_room_public` mengembalikan nama/status room setelah `delete_at`. |
| S-60-06 | Medium | RPC konkurensi | `send_message` tidak mengunci room: deadlock dengan RPC lain dan pesan bisa masuk setelah `closed_at`. |
| S-60-07 | Medium | RPC konkurensi | Cek kuota pesan room dan rate limit Host tidak atomik dengan INSERT. |
| S-60-08 | Medium | Lockout | Pencatatan gagal join terpisah memungkinkan percobaan paralel melewati ambang lockout. |
| S-60-09 | Medium | Integritas data | `member_identities` tidak menjamin `member_id` dan `room_id` konsisten; helper join tidak memeriksa `m.room_id = mi.room_id`. |
| S-60-10 | Medium | Realtime | Otorisasi typing hanya dievaluasi saat join; channel yang sudah terbuka tetap bisa kirim/terima setelah KICKED/IDLE/LEFT. |
| S-60-11 | Medium | Realtime | Tidak ada rate limit server-side untuk broadcast typing; client throttle bisa dilewati. |
| S-60-12 | Low | Realtime/deploy | Channel publik tidak memakai RLS; keamanan typing bergantung pada `{ private: true }` dan setting hosted. |
| S-60-13 | Low | Konfigurasi | `app_config` dapat dibaca semua authenticated, termasuk ambang lockout dan kapasitas. |
| S-60-14 | Low | Robustness | `messages.content` dibatasi 2000 di DB, sedangkan `send_message` memakai config `message_max_length` yang bisa berbeda. |
| S-60-15 | Low | Idempotensi | Retry `send_message` dengan `client_msg_id` lama mengembalikan baris lama sebelum cek `ROOM_CLOSED`/status member. |
| S-60-16 | Low | Lifecycle | User auth dihapus → `member_identities` cascade, tetapi baris `room_members`/activity bisa tertinggal sampai idle/kick. |
| S-60-17 | Low | Role | `join_room` tidak menolak akun Host non-anonim yang memakai jalur Guest. |
| S-60-18 | Low | Kontrak | Rate limit `messages_per_minute` juga berlaku untuk Host, padahal TASK menyebutnya rate per member. |
| S-60-19 | Low | IP | Normalisasi IPv6 belum menangani bentuk hex IPv4-mapped (`::ffff:0102:0304`) secara khusus. |
| S-60-20 | Low | Cron | `release_idle_members` memakai inner join `member_activity`; baris activity yang hilang membuat member tidak pernah IDLE. |

## 4. Detail temuan High dan Medium

### S-60-01 — High — `delete_at` tidak ditegakkan di policy SELECT `rooms`/`room_members`

**Bukti**

- `supabase/migrations/0002_security.sql`:
  - `rooms_select_host` memakai `app_private.is_room_host(id)` saja; helper itu hanya memeriksa `host_id = auth.uid()`, bukan `delete_at`.
  - `room_members_select` memakai `app_private.is_room_host(room_id) OR app_private.is_self_member(id)`. Tidak ada cek `delete_at`, `closed_at`, atau `expires_at` di kedua cabang.
- Sebaliknya, `messages_select` sudah benar: Host memakai `room_is_readable_by_host(room_id)` (cek `now() < delete_at`) dan Guest memakai `room_is_active(room_id)`.
- Uji live (rollback) dengan `expires_at` dan `delete_at` di masa lalu:

| Query sebagai | Hasil | Ekspektasi S-20 |
|---|---:|---:|
| Host `select from rooms` | 1 baris | 0 |
| Host `select from room_members` | 1 baris | 0 |
| Guest `select from room_members` (baris sendiri) | 1 baris | 0 |
| Guest `select from rooms` | 0 baris | 0 |
| Host/Guest `select from messages` | 0 baris | 0 |

**Dampak**

- Host masih dapat membaca nama, slug, pengaturan, `delete_at`, dan daftar member setelah batas retensi. Guest masih dapat membaca status/nomor/nama baris member miliknya.
- Isi pesan tetap terlindungi oleh policy `messages_select`, tetapi metadata room dan daftar member tetap bocor sampai cron `delete-expired-rooms` berjalan (maksimal sekitar 24 jam karena jadwal harian).
- Ini pelanggaran langsung S-20: “Akses room setelah `delete_at` walau cron belum jalan → ditolak RLS.”

**Rekomendasi**

- Ubah `rooms_select_host` menjadi:
  `using (app_private.is_room_host(id) and app_private.room_is_readable_by_host(id))`.
- Ubah cabang Host `room_members_select` memakai `is_room_host(room_id) and room_is_readable_by_host(room_id)`.
- Untuk cabang self, gunakan helper baru `app_private.room_is_active(room_id)` atau `now() < r.delete_at` yang juga mempertimbangkan status room. Jangan hanya `is_self_member(id)`.
- Tambahkan tes S-20 untuk `rooms` dan `room_members` (Host dan Guest) dengan `delete_at` di masa lalu.

### S-60-02 — High — `close_room` dapat menghidupkan kembali room setelah `delete_at`

**Bukti**

- `supabase/migrations/0003_host_rpc.sql` baris 350–382: `close_room` hanya memeriksa Host dan `closed_at is null`. Jika `closed_at` masih null, fungsi selalu menjalankan:
  `closed_at = now()`, `delete_at = now() + room_grace_days`.
- Tidak ada pemeriksaan `now() < v_room.delete_at` atau `now() < v_room.expires_at`.
- Uji live (rollback) pada room dengan `delete_at` di masa lalu:
  - Sebelum: `delete_at = 2026-10-28 …`
  - Setelah `close_room`: `closed_at = 2026-10-29 …`, `delete_at = 2026-11-13 …`
- Setelah `delete_at` diperpanjang, `list_messages`/`export_messages` Host kembali membolehkan akses karena keduanya memakai `delete_at`.

**Dampak**

- Host dapat memperpanjang retensi room dan isi pesan setelah batas `delete_at`, selama cron harian belum menghapus room.
- Bertentangan dengan janji retensi ke Guest dan S-20.
- Dapat diulang? Tidak tanpa batas untuk room yang sama karena `closed_at` sudah terisi, tetapi satu kali saja sudah cukup untuk membuka kembali seluruh isi room selama grace period.

**Rekomendasi**

- Tolak `close_room` bila `now() >= v_room.delete_at` dengan `NOT_FOUND` (atau kode yang disepakati).
- Jika produk ingin mengizinkan Host menutup room yang sudah expired tetapi belum dihapus, jangan memperpanjang `delete_at` melewati nilai lama; gunakan `least(v_room.delete_at, now() + grace)` atau hanya set `closed_at` tanpa mengubah `delete_at`.
- Tambahkan tes: `close_room` setelah `delete_at` harus gagal dan `delete_at` tidak berubah.

### S-60-03 — Medium — `list_members` mengembalikan daftar member setelah `delete_at`

**Bukti**

- `supabase/migrations/0003_host_rpc.sql` baris 526–551: `list_members` hanya memeriksa `v_uid`, `is_anonymous()`, dan `exists (select 1 from rooms where id = p_room_id and host_id = v_uid)`.
- Tidak ada cek `now() < delete_at`, `closed_at`, atau `expires_at`.
- Uji live (rollback) setelah `delete_at` di masa lalu: `list_members` mengembalikan 1 baris.
- `export_messages` pada kondisi yang sama mengembalikan `NOT_FOUND` (positif).

**Dampak**

- Host masih bisa membaca `display_name`, status, dan `created_at` member setelah batas retensi.
- Tidak membocorkan `user_id` (memang tidak ada di tabel), tetapi tetap data room yang seharusnya sudah tidak dapat diakses.
- S-20 gagal untuk RPC ini.

**Rekomendasi**

- Tambahkan pemeriksaan `now() < v_room.delete_at` (dan status room bila diinginkan) sebelum mengembalikan baris; gunakan `NOT_FOUND` setelah `delete_at`.
- Tambahkan tes S-20 untuk `list_members`.

### S-60-04 — Medium — `kick_member`, `leave_room`, dan `touch_activity` masih bekerja setelah `delete_at`

**Bukti**

- `kick_member` (`0003_host_rpc.sql` baris 491–524) hanya memeriksa Host lewat join `rooms`; tidak ada cek `delete_at`/`closed_at`/`expires_at`.
- `leave_room` (`0004_guest_rpc.sql` baris 438–475) hanya mencari member berdasarkan `auth.uid()` dan mengubah status; tidak ada cek room.
- `touch_activity` (`0004_guest_rpc.sql` baris 400–436) mengembalikan status member walau room sudah melewati `delete_at`; ia hanya tidak memperbarui activity jika `room_is_active` false.
- Uji live (rollback) setelah `delete_at` di masa lalu:
  - `kick_member` berhasil mengubah status member menjadi `KICKED`;
  - `leave_room` berhasil mengubah status menjadi `LEFT`;
  - `touch_activity` mengembalikan `APPROVED` (status tetap, tanpa cek `delete_at`).

**Dampak**

- Host masih dapat memutasi status member setelah batas retensi.
- Guest masih dapat mengubah statusnya sendiri menjadi `LEFT` setelah `delete_at`.
- `touch_activity` masih mengonfirmasi status membership setelah `delete_at` (informasi terbatas).
- S-20 tidak konsisten: beberapa RPC menolak, beberapa masih memutasi.

**Rekomendasi**

- Tambahkan cek `now() < v_room.delete_at` (dan `NOT_FOUND` setelahnya) ke `kick_member`, `leave_room`, dan `touch_activity`.
- Untuk `touch_activity`, minimal kembalikan status terminal/`NOT_MEMBER` tanpa menyentuh activity setelah `delete_at`.
- Tambahkan tes S-20 untuk ketiganya.

### S-60-05 — Medium — `get_room_public` mengembalikan metadata setelah `delete_at`

**Bukti**

- `supabase/migrations/0004_guest_rpc.sql` baris 6–34: `get_room_public` hanya mencari `rooms` berdasarkan `slug`; tidak ada cek `delete_at`.
- Setelah `delete_at`, fungsi tetap mengembalikan `room_id`, `name`, status `CLOSED`, dan `typing_effective = false`.
- Uji live (rollback) setelah `delete_at`: `get_room_public('devroom000000001')` mengembalikan 1 baris.

**Dampak**

- Siapa pun yang memiliki slug (termasuk pengguna authenticated lain) dapat mengetahui bahwa room pernah ada, nama room, dan statusnya setelah batas retensi.
- Tidak membocorkan pesan/member, tetapi melanggar S-20 dan ekspektasi “room hilang setelah delete_at”.

**Rekomendasi**

- Tambahkan `if now() >= v_room.delete_at then NOT_FOUND` sebelum `return query`.
- Tambahkan tes S-20 untuk `get_room_public`.

### S-60-06 — Medium — `send_message` tidak mengunci room: deadlock dan pesan setelah `closed_at`

**Bukti**

- `send_message` (`0004_guest_rpc.sql` baris 241–398) membaca room tanpa lock (baris 286–292), lalu untuk Guest mengunci baris member (`for update of m`, baris 301–305). Untuk Host tidak ada lock sama sekali.
- `decide_member` mengunci room lebih dulu (`0003_host_rpc.sql` baris 417–420), lalu member (baris 426–429).
- `join_room` mengunci room (`0004` baris 516–519), lalu member (baris 579–584).
- `rejoin_room` mengunci room (`0004` baris 53–56), lalu member (baris 62–66).
- `close_room` mengunci room (`0003` baris 365–368).
- `send_message` kemudian INSERT ke `messages`; foreign key ke `rooms` membutuhkan lock pada baris room. Urutan `member → room` ini berlawanan dengan `room → member`, sehingga dapat deadlock.
- Cek `closed_at`/`expires_at` dilakukan setelah membaca room (baris 330–332), tetapi tidak ada lock yang mencegah `close_room` mengubah `closed_at` sebelum INSERT.

**Dampak**

- Deadlock sesekali antara Guest yang mengirim pesan dan Host yang menyetujui/menolak member atau Guest yang join/rejoin. PostgreSQL akan membatalkan salah satu transaksi; client melihat error sementara.
- Pesan dapat masuk setelah room ditutup: `send_message` membaca `closed_at = null`, `close_room` commit, lalu `send_message` INSERT. Ini melanggar S-19 secara balapan.
- Host tidak memiliki lock member, jadi pengiriman Host juga tidak diserialisasi.

**Rekomendasi**

- Di awal `send_message`, kunci room lebih dulu:
  `select r.* into v_room from public.rooms r where r.id = p_room_id for update;`
  lalu tentukan Host/member dan kunci member. Ini menyamakan urutan lock dengan `join_room`/`decide_member`/`rejoin_room` dan menutup balapan `close_room`.
- Setelah lock, baru lakukan cek `closed_at`/`expires_at`, hitung rate/kuota, dan INSERT.
- Jika `FOR UPDATE` per room terlalu mahal, gunakan advisory lock per room; tetapi harus tetap menutup balapan close dan kuota.
- Tambahkan tes konkurensi: kirim pesan sambil `close_room` dan sambil `decide_member`.

### S-60-07 — Medium — Kuota pesan room dan rate limit Host tidak atomik

**Bukti**

- `send_message` menghitung `v_recent` (baris 334–345) dan `v_total` (baris 358–364) sebelum INSERT (baris 366–373), tanpa lock room.
- Untuk Guest, lock member menyerialkan pengiriman dari member yang sama, tetapi tidak menyerialkan Guest berbeda atau Host.
- Untuk Host, tidak ada lock sama sekali.
- Dua pengiriman paralel dapat sama-sama melihat `v_total < v_room_limit` lalu sama-sama INSERT, melewati `max_messages_per_room`.
- Dua pengiriman Host paralel dapat sama-sama melihat `v_recent < messages_per_minute` lalu sama-sama INSERT, melewati rate limit.

**Dampak**

- Kuota pesan per room (kontrol biaya/penyalahgunaan) dapat dilampaui.
- Rate limit Host dapat dilampaui; untuk Guest, lock member hanya menyerialkan pengirim yang sama, sehingga dua Guest berbeda dapat bersamaan mendorong total room melewati `max_messages_per_room`.
- Tidak membocorkan data, tetapi merupakan bypass kontrol resource dan dapat mempercepat pengosongan kuota.

**Rekomendasi**

- Selesaikan bersama S-60-06: lock room sebelum menghitung kuota/rate dan INSERT.
- Jika throughput menjadi masalah, gunakan advisory lock per room atau tabel counter atomik; jangan hanya mengandalkan count-then-insert.
- Tambahkan tes konkurensi untuk dua Guest berbeda dan dua pengiriman Host.

### S-60-08 — Medium — Pencatatan gagal join terpisah memungkinkan bypass lockout paralel

**Bukti**

- `join_room` melempar `WRONG_PASSWORD` (baris 604–610) dan tidak mencatat kegagalan karena exception akan rollback. Ini didokumentasikan di komentar dan `docs/progress.md` (REQUEST T-13).
- Agent B memanggil `record_join_failure` sebagai RPC terpisah setelah menerima `WRONG_PASSWORD` (`src/pages/api/rooms/join.ts`).
- `join_room` mengunci room selama transaksi, lalu melempar exception dan rollback. Lock dilepas **sebelum** `record_join_failure` dijalankan.
- Dengan N request paralel, beberapa request dapat memperoleh lock room, melihat jumlah kegagalan lama, dan semuanya gagal sebelum ada satu pun `record_join_failure` yang commit.
- Tes S-11 yang ada berjalan berurutan; tidak ada tes paralel.

**Dampak**

- Ambang 5 kegagalan per 15 menit dapat dilewati dengan percobaan paralel. Penyerang bisa mendapatkan lebih dari 5 tebakan password per jendela sebelum lockout aktif.
- Turnstile/WAF memperlambat, tetapi bukan kontrol database; celah tetap ada.
- Ini bukan regresi dari desain saat ini (sudah dicatat sebagai keterbatasan), tetapi merupakan temuan keamanan yang perlu diputuskan.

**Rekomendasi**

- Desain ulang kontrak: satu RPC service-only yang mengembalikan hasil (mis. `WRONG_PASSWORD` sebagai status, bukan exception) dan mencatat kegagalan dalam transaksi yang sama; B memetakan hasil ke HTTP 401. Perubahan kontrak perlu persetujuan manusia.
- Alternatif: RPC `begin_join_attempt` yang mengunci/menyimpan percobaan, lalu `join_room` menandai sukses/gagal; lockout menghitung percobaan `pending` juga. Ini juga perubahan kontrak.
- Jika tidak diubah, dokumentasikan residual risk dan tambahkan rate limit per IP di WAF/edge; tambahkan tes paralel untuk membuktikan batasnya.
- Jangan mengandalkan `record_join_failure` terpisah sebagai kontrol brute-force utama.

### S-60-09 — Medium — `member_identities` tidak menjamin `(member_id, room_id)` konsisten

**Bukti**

- `supabase/migrations/0001_init_schema.sql` baris 81–86:
  `member_identities(member_id pk → room_members, room_id → rooms, user_id → auth.users, unique(room_id,user_id))`.
  Tidak ada composite FK yang memastikan `room_members.room_id = member_identities.room_id`.
- `app_private.is_approved_member` (`0002_security.sql`) memfilter `mi.room_id = p_room_id` lalu join `m.id = mi.member_id`; tidak menambahkan `m.room_id = mi.room_id`.
- `is_self_member(member_id)` hanya memeriksa `mi.member_id` dan `mi.user_id`; tidak memeriksa room.
- `rejoin_room`, `send_message`, `my_rooms`, dan `can_use_typing` juga join pada `m.id = mi.member_id` tanpa membandingkan `m.room_id` dengan `mi.room_id`.
- Uji live (rollback) dengan identity sengaja tidak konsisten:
  - member `cccc…` berada di Room B,
  - identity `cccc…` menunjuk Room A,
  - sebagai user tersebut: `is_approved_member(Room A) = true`, `is_approved_member(Room B) = false`,
  - user dapat membaca baris `room_members` milik Room B lewat `is_self_member`.

**Dampak**

- Jika ada bug RPC, migrasi data, atau service_role yang menulis identity tidak konsisten, user dapat dianggap APPROVED di room yang salah dan membaca pesan room tersebut.
- Saat ini client tidak punya grant INSERT/UPDATE ke `member_identities`, jadi bukan eksploit langsung; ini defense-in-depth.
- Namun helper keamanan seharusnya tidak bergantung pada invariant yang tidak ditegakkan database.

**Rekomendasi**

- Tambahkan `unique (id, room_id)` pada `room_members` (atau unique index) dan composite FK:
  `foreign key (member_id, room_id) references public.room_members (id, room_id) on delete cascade`.
- Alternatif cepat: tambahkan `and m.room_id = mi.room_id` di semua join helper dan RPC.
- Pertimbangkan composite FK serupa untuk `messages (room_id, member_id)` agar pesan tidak bisa menunjuk member dari room lain.
- Tambahkan tes integritas: identity dengan room berbeda harus ditolak.

### S-60-10 — Medium — Otorisasi typing hanya saat join; channel terbuka tetap aktif setelah status berubah

**Bukti**

- `docs/progress.md` NOTE T-15 (2026-10-24 12:53): setelah Guest di-`kick_member`, channel private `typing:<room_id>` yang sudah terbuka **tetap bisa mengirim dan menerima** Broadcast; join channel baru oleh user yang sama berakhir TIMEOUT.
- Policy `realtime.messages` (`0005_cron_realtime.sql` baris 125–151) memanggil `app_private.can_use_typing` saat SELECT/INSERT; otorisasi Supabase Realtime dievaluasi saat join, bukan setiap pesan.
- `can_use_typing` sudah menolak member yang bukan APPROVED, tetapi tidak memutus channel yang sudah ada.

**Dampak**

- Member `KICKED`/`IDLE`/`LEFT` masih dapat mengirim/menerima indikator mengetik sampai reconnect/unsubscribe.
- Payload typing hanya `{s}` tanpa identitas/konten, jadi dampak confidentiality rendah; tetapi ini bypass kontrol status dan bisa dipakai untuk spam/typing palsu.
- Mitigasi saat ini hanya client (T-42/T-43): unsubscribe saat status bukan APPROVED.

**Rekomendasi**

- Wajibkan client `unsubscribe` dan berhenti mengirim saat status terminal; tambahkan tes integrasi kick → channel berhenti.
- Dokumentasikan sebagai keterbatasan Realtime Authorization; jangan mengklaim pencabutan instan.
- Jika risiko tidak diterima, matikan typing untuk room besar/sensitif atau gunakan mekanisme server-side di luar Realtime broadcast.

### S-60-11 — Medium — Tidak ada rate limit server-side untuk broadcast typing

**Bukti**

- Policy INSERT `realtime.messages` hanya memeriksa `extension = 'broadcast'` dan `can_use_typing(...)`; tidak ada batas jumlah pesan per waktu.
- Throttle 5 detik ada di client (T-43), bukan di database/Realtime.
- Anggota APPROVED dapat membuka channel private dan mengirim broadcast sebanyak yang diizinkan Realtime, tanpa melewati RPC.
- TASK bagian 8 mencatat biaya satu event typing ≈ satu pesan Realtime.

**Dampak**

- Satu anggota jahat dapat membanjiri `typing:<room_id>` dan menghabiskan kuota Realtime free, memengaruhi room lain.
- Tidak ada konten/identitas yang bocor, tetapi merupakan DoS/resource abuse.

**Rekomendasi**

- Jika tersedia, gunakan rate limit di Realtime/edge; jika tidak, dokumentasikan risiko dan monitor kuota.
- Pertimbangkan menonaktifkan typing untuk room besar (`max_guests` tinggi) atau saat kuota mendekati batas.
- Tambahkan uji beban T-63 untuk mengukur dampak; jangan mengandalkan throttle client sebagai kontrol keamanan.

## 5. Temuan Low

### S-60-12 — Low — Channel publik tidak memakai RLS

- **Bukti:** `docs/progress.md` NOTE T-15 (2026-10-24 12:55): policy `realtime.messages` hanya menjaga channel private; channel publik tidak memakai RLS. Client R wajib memakai `{ config: { private: true } }`; hosted Supabase perlu mematikan public channels bila tersedia.
- **Dampak:** jika client lupa `private: true` atau hosted mengizinkan public channel, siapa pun yang mengetahui `room_id` dapat subscribe/kirim ke topik typing. Payload hanya `{s}`, tetapi kontrol otorisasi hilang.
- **Rekomendasi:** jadikan item checklist T-70; verifikasi setting hosted; tes integrasi channel publik harus ditolak; pastikan R-zone memakai private channel.

### S-60-13 — Low — `app_config` membuka ambang lockout ke semua authenticated

- **Bukti:** `0002_security.sql` memberi SELECT `app_config` ke `authenticated`; seed `0001` berisi `lockout_fail_threshold`, `lockout_window_minutes`, `room_failure_cap_per_hour`, `password_length`, dll.
- **Dampak:** penyerang dapat membaca ambang lockout/cooldown dan menyesuaikan strategi brute-force/DoS. Tidak ada secret, dan TASK memang mengizinkan semua authenticated membaca config.
- **Rekomendasi:** jika tidak dibutuhkan UI, batasi key sensitif ke `service_role` atau pisahkan tabel config publik vs internal; jika dipertahankan, catat sebagai accepted risk.

### S-60-14 — Low — Batas panjang pesan DB vs config tidak selaras

- **Bukti:** `0001_init_schema.sql` baris 103: `content` check 1..2000. `0004_guest_rpc.sql` baris 275 memakai `app_config.message_max_length` (seed 2000). Jika config diubah >2000, `send_message` lolos cek RPC lalu INSERT gagal `23514` (500), bukan `MESSAGE_TOO_LONG`.
- **Dampak:** error 500 dan inkonsistensi kontrak jika config diubah; bukan eksploit client karena config hanya dapat diubah service_role.
- **Rekomendasi:** batasi config `message_max_length` ≤ 2000, atau samakan constraint/trigger; tambahkan tes config.

### S-60-15 — Low — Retry idempoten melewati cek `ROOM_CLOSED`

- **Bukti:** `send_message` memeriksa `client_msg_id` yang sudah ada (baris 316–328) sebelum cek `closed_at`/`expires_at` (baris 330–332). Uji live: setelah room ditutup, retry dengan `client_msg_id` lama mengembalikan baris lama; pesan baru dengan ID baru menghasilkan `ROOM_CLOSED`.
- **Dampak:** semantics idempotensi vs status room ambigu; S-19 harus memakai `client_msg_id` baru. Tidak ada pesan baru yang dibuat, dan isi lama sudah diketahui pengirim.
- **Rekomendasi:** dokumentasikan bahwa retry pesan lama tetap sukses; atau pindahkan cek status sebelum idempotensi jika kontrak menghendaki `ROOM_CLOSED` selalu menang. Tambahkan tes eksplisit.

### S-60-16 — Low — Baris member bisa tertinggal setelah user auth dihapus

- **Bukti:** `member_identities.user_id` memakai `on delete cascade`; `room_members` tidak punya FK ke `auth.users`, jadi baris member/activity tidak ikut terhapus. `release_idle_members` dapat menandainya IDLE setelah idle timeout, tetapi tidak langsung.
- **Dampak:** ghost member dapat menempati kursi sampai idle timeout/kick; tidak ada akses karena identity sudah hilang.
- **Rekomendasi:** trigger `after delete on auth.users` untuk menandai member terkait `LEFT`/`KICKED` dan menghapus activity, atau job pembersih; pastikan activity ada agar idle berjalan.

### S-60-17 — Low — Akun Host non-anonim dapat memakai jalur Guest

- **Bukti:** `src/pages/api/rooms/join.ts` hanya memverifikasi access token; tidak menolak `is_anonymous = false`. `join_room` juga tidak memeriksa `is_anonymous` untuk `p_user_id`.
- **Dampak:** Host dapat join sebagai Guest (termasuk ke room sendiri), membuat baris member yang mungkin tidak dipakai dan menempati kursi. Tidak ada eskalasi hak; `send_message` tetap memperlakukan Host sebagai Host.
- **Rekomendasi:** putuskan kebijakan. Jika Guest harus anonim, tolak token non-anonim di endpoint join dan/atau `join_room`; jika Host boleh menjadi Guest, dokumentasikan dan tambahkan tes.

### S-60-18 — Low — Rate limit `messages_per_minute` juga berlaku untuk Host

- **Bukti:** `send_message` menghitung `v_recent` untuk Host (`sender_type = 'HOST'`) dan Guest (`member_id = v_member_id`), lalu memakai config `messages_per_minute`. TASK bagian 3 menyebut config ini “rate kirim per member”, sedangkan Host bukan baris member.
- **Dampak:** Host dapat terkena `RATE_LIMITED` setelah 20 pesan/menit. Ini mungkin diinginkan sebagai anti-spam, tetapi menyimpang dari nama kontrak.
- **Rekomendasi:** konfirmasi kebijakan; jika Host dikecualikan, lewati cek untuk Host dan andalkan kuota room; jika tidak, rename config/dokumentasikan.

### S-60-19 — Low — Normalisasi IPv6 hex IPv4-mapped belum khusus

- **Bukti:** `src/lib/ip.ts` hanya mengenali bentuk dotted `::ffff:1.2.3.4`; bentuk hex `::ffff:0102:0304` diperlakukan sebagai IPv6 biasa dan prefix /64-nya menjadi `0000:0000:0000:0000::/64`. Bentuk IPv4-compatible `::192.0.2.1` juga tidak dinormalisasi ke IPv4.
- **Dampak:** alamat IPv4-mapped hex dari pengguna berbeda dapat berbagi satu hash /64 (over-lockout), atau bentuk tertentu tidak mengikuti aturan IPv4; dampak terbatas dan jarang.
- **Rekomendasi:** normalisasi dengan parser `inet`/`ipaddr` atau tangani bentuk hex dan IPv4-compatible; tambahkan tes S-12 untuk kedua bentuk.

### S-60-20 — Low — `release_idle_members` tidak melepas member tanpa baris activity

- **Bukti:** `0003_host_rpc.sql` baris 110–121 memakai `join public.member_activity a on a.member_id = m.id`; member APPROVED tanpa baris activity tidak pernah memenuhi kondisi idle.
- **Dampak:** jika baris activity hilang (mis. user dihapus, migrasi data, bug), kursi tidak pernah dilepas sampai Host kick; kapasitas room bisa berkurang.
- **Rekomendasi:** gunakan `left join` dan perlakukan `last_active_at` null sebagai idle, atau pastikan semua jalur approval/rejoin membuat activity; tambahkan tes.

## 6. Matriks S-20

| Permukaan | Ekspektasi setelah `delete_at` | Hasil aktual | Status |
|---|---|---|---|
| Host SELECT `rooms` | ditolak | 1 baris | **FAIL S-60-01** |
| Host SELECT `room_members` | ditolak | 1 baris | **FAIL S-60-01** |
| Guest SELECT baris `room_members` sendiri | ditolak | 1 baris | **FAIL S-60-01** |
| Guest SELECT `messages` | ditolak | 0 baris | PASS |
| Host SELECT `messages` | ditolak | 0 baris | PASS |
| `export_messages` | `NOT_FOUND` | `NOT_FOUND` | PASS |
| `list_members` | `NOT_FOUND` | 1 baris | **FAIL S-60-03** |
| `get_room_public` | `NOT_FOUND` | 1 baris `CLOSED` | **FAIL S-60-05** |
| `close_room` | `NOT_FOUND` | memperpanjang `delete_at` | **FAIL S-60-02** |
| `kick_member` | `NOT_FOUND` | status `KICKED` | **FAIL S-60-04** |
| `leave_room` | `NOT_FOUND` | status `LEFT` | **FAIL S-60-04** |
| `touch_activity` | `NOT_MEMBER`/error | `APPROVED` | **FAIL S-60-04** |
| `send_message` (pesan baru) | `ROOM_CLOSED` | `ROOM_CLOSED` | PASS (kode) |
| `list_messages` | `ROOM_CLOSED` | `ROOM_CLOSED` | PASS (kode) |
| `join_room` / `rejoin_room` | `ROOM_CLOSED` | `ROOM_CLOSED` | PASS (kode) |
| `my_rooms` / `list_hosted_rooms` | tidak memuat room | tidak memuat | PASS (kode) |
| `can_use_typing` | false | false | PASS (kode) |

## 7. Kontrol yang sudah baik

- **RLS:** semua tabel `public` memiliki RLS; `member_identities`, `member_activity`, dan `join_attempts` tidak punya policy dan tidak punya grant client.
- **Grant:** `password_hash` tidak diberikan; `rooms` memakai grant kolom; RPC internal dicabut dari `public/anon/authenticated`; `join_room`/`record_join_failure` hanya `service_role`.
- **Search path:** catalog test memastikan semua `SECURITY DEFINER` di `public`/`app_private` memasang `search_path`; tidak ada `SECURITY DEFINER` tanpa config di DB lokal.
- **Identitas:** RPC Host menolak JWT anonim; RPC Guest memakai `auth.uid()`; `join_room` menerima `p_user_id` hanya dari service_role setelah verifikasi token.
- **Realtime:** `realtime.messages` RLS aktif; policy SELECT dan INSERT typing ada; `can_use_typing` memeriksa Host/APPROVED, room aktif, dan `typing_enabled`.
- **Konten:** pesan dikirim sebagai teks; tidak ada HTML; `sender_name` Guest berasal dari DB (`Guest-xx`), bukan input client.
- **IP:** `hashIp` memakai HMAC dan menyimpan hash; IPv6 /64 untuk bentuk standar; raw IP tidak disimpan di `join_attempts`.
- **Secret:** `join.ts` tidak mencatat password/IP mentah; `TURNSTILE_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `IP_HASH_SALT` hanya di server.

## 8. Celah pengujian

| Celah | Bukti | Dampak |
|---|---|---|
| S-20 hanya menguji `export_messages` | `supabase/tests/rpc/100_host_rpc.test.sql` baris 332–347 | RLS `rooms`/`room_members`, `list_members`, `get_room_public`, `close_room`, `kick_member`, `leave_room` tidak tertangkap. |
| S-11 hanya berurutan | `supabase/tests/rpc/200_guest_rpc.test.sql` baris 130–150 | Bypass lockout paralel (S-60-08) tidak terdeteksi. |
| Tidak ada tes konkurensi `send_message` | tidak ada tes paralel | Deadlock/close race/kuota race (S-60-06/07) tidak terdeteksi. |
| Tidak ada tes integritas `member_identities` | tidak ada | Identity lintas room (S-60-09) tidak terdeteksi. |
| Realtime hanya uji manual T-15 | `docs/progress.md` NOTE T-15 | Regresi private channel/typing setelah kick tidak otomatis. |
| Tidak ada tes S-12 bentuk IPv6 hex | `src/lib/ip.test.ts` (jika ada) hanya bentuk standar | Normalisasi S-60-19 tidak tercakup. |

## 9. Rekomendasi prioritas

**P0 — sebelum deploy (High):**

1. Perbaiki policy `rooms_select_host` dan `room_members_select` agar menegakkan `delete_at`/status room (S-60-01).
2. Perbaiki `close_room` agar tidak memperpanjang `delete_at` setelah batas (S-60-02).
3. Tambahkan tes S-20 untuk RLS dan RPC yang relevan.

**P1 — sebelum deploy (Medium):**

4. Tambahkan cek `delete_at` ke `list_members`, `get_room_public`, `kick_member`, `leave_room`, `touch_activity` (S-60-03/04/05).
5. Kunci room di awal `send_message`; samakan urutan lock; re-cek status; hitung kuota/rate di bawah lock (S-60-06/07).
6. Putuskan desain pencatatan kegagalan join agar lockout tidak bisa dilewati paralel (S-60-08).
7. Tambahkan composite FK/join condition untuk `member_identities` (S-60-09).
8. Wajibkan unsubscribe typing saat status terminal; dokumentasikan keterbatasan; tambahkan monitoring/rate limit (S-60-10/11).

**P2 — hardening/operasional:**

9. Checklist private channel hosted + client `{ private: true }` (S-60-12).
10. Batasi config sensitif, selaraskan batas pesan, dokumentasikan idempotensi (S-60-13/14/15).
11. Bersihkan member orphan, putuskan Host-as-Guest, normalisasi IPv6 hex, perbaiki idle join (S-60-16/17/18/19/20).

## 10. Lampiran — uji live utama

Semua uji dijalankan dalam transaksi `begin; … rollback;` pada Supabase lokal. Ringkasan:

| Uji | Hasil |
|---|---|
| Host `select from rooms` setelah `delete_at` | 1 baris (seharusnya 0) |
| Host `select from room_members` setelah `delete_at` | 1 baris (seharusnya 0) |
| Guest `select from room_members` sendiri setelah `delete_at` | 1 baris (seharusnya 0) |
| Guest `select from messages` setelah `delete_at` | 0 baris (benar) |
| Host `select from messages` setelah `delete_at` | 0 baris (benar) |
| `export_messages` setelah `delete_at` | `NOT_FOUND` (benar) |
| `list_members` setelah `delete_at` | 1 baris (seharusnya `NOT_FOUND`) |
| `get_room_public` setelah `delete_at` | 1 baris `CLOSED` (seharusnya `NOT_FOUND`) |
| `close_room` setelah `delete_at` | `delete_at` berubah dari 2026-10-28 ke 2026-11-13 |
| `kick_member` setelah `delete_at` | status menjadi `KICKED` |
| Identity lintas room | `is_approved_member(Room A) = true` meski member ada di Room B |
| Retry `send_message` setelah close | mengembalikan baris lama; pesan baru `ROOM_CLOSED` |

**Catatan:** temuan S-60-06/07/08/10/11/12/19/20 adalah analisis kode/konfigurasi, bukan hasil uji beban. T-61/T-63 harus mengubahnya menjadi skrip yang dapat dijalankan ulang.
