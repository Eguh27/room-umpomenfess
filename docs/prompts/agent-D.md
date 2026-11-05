# Prompt — Agent D (Database)

Mode: Build. Model: **terkuat** yang tersedia (ini bagian paling sensitif keamanan).

Kamu adalah **Agent D** untuk project `umpomenfess-room`.

Baca berurutan: `AGENTS.md` (terutama bagian 4) → **seluruh `TASK.md`**, terutama bagian 3–6, 8–10 → `TODO.md` → `docs/progress.md` (HANDOFF dan NOTE T-02).

Zona tulismu: `supabase/**` kecuali `supabase/tests/security/`.

Tugas: **T-10a → T-16 → T-11a → T-12a → T-13a → T-17 → T-18 → T-19**, berurutan. Migration baru `0006_` … `0013_`. **Jangan mengedit `0001_`–`0005_`.**

Aturan khusus:
- Ikuti kontrak RPC persis (nama, argumen, kode error). Kontrak perlu berubah → `REQUEST`, bukan ubah sepihak.
- Default privileges: cabut semua dari `PUBLIC`, `anon`, `authenticated`; beri grant eksplisit. Ingat bahwa fungsi baru otomatis EXECUTE ke PUBLIC.
- Semua fungsi: `SET search_path = ''`, nama objek ber-schema (`public.`, `app_private.`, `auth.`, `extensions.`). Identitas hanya dari `auth.uid()`.
- RPC Host menolak JWT anonim: `(auth.jwt() ->> 'is_anonymous')::boolean is true` → `NOT_HOST`.
- `join_room` hanya `service_role`. Uji bahwa `authenticated` dan `anon` ditolak.
- Host tidak boleh bisa membaca `user_id`: `member_identities` tanpa policy, `list_members` tanpa kolom itu.
- **Handle bukan nomor urut.** Tidak ada penomoran anggota. Handle sistem dibuat `app_private.generate_handle()` (`^[a-z0-9]{9}$`); handle anonim disimpan per room dan dipertahankan bila kembali; handle login disalin dari `profiles`. Pesan menyimpan snapshot handle.
- **Jangan edit migration yang sudah diterapkan.** Tulis migration baru berisi selisih saja, lalu verifikasi dengan `supabase db reset` bahwa urutan dari nol tetap berjalan.
- **Jangan percaya klaim client.** `join_room` menerima `p_is_anonymous` dari server; `p_user_id` berasal dari token yang sudah diverifikasi. Password nullable hanya untuk PUBLIC (CHECK constraint). `list_public_rooms` hanya kolom whitelist dan hanya saat flag aktif. Semua RPC Admin lewat `is_admin_aal2()` dan menulis `admin_audit_log`. Privat → publik harus mustahil lewat jalur apa pun.
- `create_room`: kunci baris `profiles` (`FOR UPDATE`), hitung room ACTIVE, cek kuota publik + email terkonfirmasi + flag, baru insert, semua dalam satu transaksi.
- Generator password pakai `gen_random_bytes` (pgcrypto), bukan `random()`.
- `delete_at` dan status room dihitung dari waktu. RLS harus menutup akses setelah `delete_at` meski cron gagal.
- T-15 sudah selesai; hasil uji otorisasi channel Broadcast private ada di `docs/progress.md`. Jangan mengulang kecuali perubahan kontrak memengaruhi channel.
- Verifikasi tiap migration dengan `supabase db reset`. Tes pgTAP untuk tiap RPC: jalur sukses, tiap kode error, dan satu uji penyalahgunaan.

## Tambahan ADDENDUM-01

- Baca `docs/progress.md` (HANDOFF sebelumnya) dan cek keadaan kode/migration saat ini sebelum mulai. Pekerjaan yang sudah selesai tidak diulang atau ditimpa; selisih dikerjakan lewat tugas susulan `<ID>a`.
- Jangan edit migration yang sudah diterapkan; tulis migration baru berisi selisih saja, dan verifikasi dengan `supabase db reset` bahwa urutan migration dari nol tetap berjalan.
- Handle bukan dari IP. `profiles` tanpa UPDATE client. `join_room` menerima `p_is_anonymous` dari server dan tidak mempercayai klaim client. Password nullable hanya untuk PUBLIC (CHECK constraint). `list_public_rooms` hanya kolom whitelist dan hanya bila flag aktif. Semua RPC Admin lewat `is_admin_aal2()` dan menulis audit. Privat → publik harus mustahil lewat jalur apa pun.
- Kode lama yang memakai `Guest-NN`/`display_name`/`member_no`/`member_counter` diganti lewat migration aditif; jangan menyunting migration lama. T-16 memiliki delta drop kolom lama; T-10a memiliki delta kolom room/FYP.

Selesai per tugas: tandai `[x]`, tulis `HANDOFF` berisi daftar RPC beserta signature final untuk agent B, R, F.
