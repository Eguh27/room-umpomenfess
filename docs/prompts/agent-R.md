# Prompt — Agent R (Realtime client)

Mode: Build. Model: menengah-kuat.

Kamu adalah **Agent R** untuk project `umpomenfess-room`.

Baca berurutan: `AGENTS.md` → `TASK.md` bagian 3, 6, 8, 11 → `TODO.md` → `docs/progress.md` (HANDOFF dari D, termasuk hasil uji otorisasi Realtime di T-15, dan NOTE T-02).

Zona tulismu: `src/lib/realtime/**`, `src/lib/supabase/browser.ts`, `src/lib/config.ts`.

Tugas: **T-40a → T-41 → T-42 → T-43 → T-44**. Modul framework-agnostic (TypeScript murni + hook React tipis), sehingga mudah dites tanpa DOM.

Aturan khusus:
- Pesan datang dari Postgres Changes. Setiap `SUBSCRIBED` (termasuk reconnect) wajib menambal lewat `list_messages(p_after_id)`. Dedupe dengan `id` dan `client_msg_id`.
- Kirim pesan optimistis dengan `client_msg_id` (UUID) baru; retry memakai id yang sama (RPC idempotent).
- Heartbeat hanya saat `document.visibilityState === 'visible'` dan online; interval dari `APP_DEFAULTS.heartbeatSeconds`. Hentikan saat status bukan `APPROVED`.
- Indikator mengetik: **tanpa identitas**. Payload hanya `{ s }` (8 hex acak per tab). Throttle 5 dtk, kedaluwarsa 6 dtk, jangan kirim bila `typing_effective` false. Unsubscribe channel saat status bukan `APPROVED`.
- Jangan membuat lebih dari satu koneksi realtime per room yang sedang dibuka. Jangan subscribe ke room yang tidak sedang dilihat.
- Jangan simpan isi pesan atau handle di `localStorage`. Token hanya boleh disimpan oleh `persistSession` Supabase (bukan manual). Boleh simpan `lastRead:<room_id>` (id pesan terakhir) sebagai angka.
- Ekspor `.txt`: baris `[DD-MM-YYYY HH:MM] <handle>: isi`, zona `Asia/Jakarta`, baris lanjutan diindentasi, ambil data berhalaman dari `export_messages`.
- Uji dengan fake timers dan client Supabase tiruan. Tidak ada tes yang bergantung pada jaringan.

## Tambahan ADDENDUM-01

- Baca `docs/progress.md` (HANDOFF sebelumnya) dan cek keadaan kode/migration saat ini sebelum mulai. Pekerjaan yang sudah selesai tidak diulang atau ditimpa; selisih dikerjakan lewat tugas susulan `<ID>a`.
- Pakai `handle` untuk tampilan; `sender_badge`/`handle_verified` untuk lencana `HOST`/`VERIFIED`.
- Modul sesi harus membedakan anonim vs login tanpa memercayai storage. Jangan simpan handle/token secara manual di `localStorage`; token hanya milik sesi Supabase (`persistSession`), ditambah `lastRead` untuk penanda baca.
- Tambah `leaveRoom()` dan penanganan `ONE_ROOM_LIMIT` pada `rejoin_room`; UI menawarkan "Keluar dari room X dan gabung ke sini".
- Kode lama yang masih memakai `display_name`/`member_no`/`Guest-NN` di zona R diganti ke `handle` (T-40a), bukan ditimpa agent lain.

Selesai: tes lolos → `[x]` → `HANDOFF` (API modul: fungsi, event, tipe) untuk F.
