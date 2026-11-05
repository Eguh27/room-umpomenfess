# T-61 — Hasil skrip serangan S-01…S-14, S-19, S-20

Tanggal: 2026-10-29
Lingkungan: Supabase lokal (`http://127.0.0.1:54321`), Docker
Perintah:

```bash
node --experimental-strip-types scripts/security/run-all.mjs --allow-open
```

## Ringkasan

**13/16 LULUS, 3 GAGAL (S-11, S-12, S-20).**

| Uji | Hasil | Catatan |
|---|---|---|
| S-01 | LULUS | `PATCH /rest/v1/rooms` ditolak; nilai tidak berubah |
| S-02 | LULUS | `INSERT /rest/v1/rooms` ditolak; tidak ada baris baru |
| S-03 | LULUS | `PATCH /rest/v1/profiles` ditolak; tier tetap |
| S-04 | LULUS | parameter `sender_name`/`sender_type` tidak ada; sender dari DB |
| S-05 | LULUS | REST kosong, `list_messages` `NOT_MEMBER`, Realtime tanpa event |
| S-06 | LULUS | KICKED/IDLE/LEFT: `NOT_MEMBER`, REST kosong, Realtime tanpa event |
| S-07 | LULUS | semua RPC Host menolak JWT anonim dengan `NOT_HOST` |
| S-08 | LULUS | `join_room` untuk authenticated/anon = `permission denied` (`42501`) |
| S-09 | LULUS | `room_members`/`list_members` tanpa `user_id`; `member_identities` tidak terbaca |
| S-10 | LULUS | `SELECT password_hash` = `42501`; kolom tidak ada di baris yang diizinkan |
| S-11 | **GAGAL** | urutan 5 salah + ke-6 `LOCKED` lulus; 6 join paralel semuanya `WRONG_PASSWORD` (S-60-08) |
| S-12 | **GAGAL** | dua IPv6 satu /64 hash sama; bentuk IPv4-mapped hex/IPv4-compatible belum dinormalisasi (S-60-19) |
| S-13 | LULUS | dua `create_room` bersamaan pada kuota 2/3: tepat satu berhasil |
| S-14 | LULUS | Guest ke-3 saat kapasitas 2 = `ROOM_FULL`; dua approve bersamaan: tepat satu berhasil, `member_no` unik |
| S-19 | LULUS | `send_message`/`list_messages` setelah closed/expired = `ROOM_CLOSED` |
| S-20 | **GAGAL** | lihat temuan di bawah |

## Temuan terbuka S-11, S-12, dan S-20

S-11, S-12, dan S-20 masih gagal pada Supabase lokal. Ini sesuai temuan T-60
dan harus diperbaiki di T-64, bukan dengan melonggarkan skrip.

### S-11 — lockout paralel (S-60-08)

- Jalur berurutan sudah benar: 5 percobaan salah, percobaan ke-6 = `LOCKED`.
- Namun 6 `join_room` paralel dengan `ip_hash` yang sama semuanya mendapat
  `WRONG_PASSWORD` (0 `LOCKED`) karena `record_join_failure` dicatat terpisah
  setelah exception. Ini memungkinkan lebih dari 5 tebakan per jendela lockout.
- Perbaikan menyentuh desain pencatatan gagal join (B/D; perubahan kontrak perlu
  persetujuan manusia) atau kontrol rate limit edge yang didokumentasikan.

### S-12 — normalisasi IPv6 (S-60-19)

- Dua alamat dalam satu /64 menghasilkan hash yang sama; percobaan ke-6 dari
  alamat lain di /64 yang sama = `LOCKED`.
- `::ffff:cb00:7107` tidak menghasilkan hash yang sama dengan `203.0.113.7`,
  dan `::192.0.2.1` tidak sama dengan `192.0.2.1`. Bentuk ini belum
  dinormalisasi oleh `src/lib/ip.ts` (zona B).

### S-20 — akses setelah `delete_at` (S-60-01/03/04/05)

S-20 masih gagal pada Supabase lokal:

- Host masih melihat baris `rooms` setelah `delete_at` (1 baris; harus 0).
- Host masih melihat baris `room_members` setelah `delete_at` (1 baris; harus 0).
- Guest masih melihat baris member sendiri setelah `delete_at` (1 baris; harus 0).
- `list_members` masih mengembalikan baris setelah `delete_at` (harus `NOT_FOUND`).
- `get_room_public` masih mengembalikan room `CLOSED` setelah `delete_at` (harus `NOT_FOUND`).
- `touch_activity` masih mengembalikan `APPROVED` setelah `delete_at` (harus ditolak).
- `leave_room`, `kick_member`, dan `close_room` masih berhasil setelah `delete_at`
  (harus `NOT_FOUND`).

Yang sudah benar pada S-20: RLS `messages` Host/Guest kosong, dan
`export_messages` mengembalikan `NOT_FOUND`.

Temuan ini terkait S-60-01 dan temuan Medium T-60 tentang RPC setelah
`delete_at`. Perbaikan berada di zona D/B/F/R sesuai T-64; Agent S tidak
mengubah produk.

## Catatan implementasi

- Fixture Host/Guest dan room unik per run; cleanup di `finally` menghapus
  room dan user fixture.
- Request serangan memakai anon key + JWT; service role hanya untuk
  setup/cleanup/verifikasi dan RPC server-only (`join_room`,
  `record_join_failure`).
- S-06 menggunakan service role untuk menyetel status `IDLE` sebagai fixture;
  pengujian serangan tetap memakai JWT Guest.
- S-14 memakai ulang Guest A–D yang sama (bukan membuat tujuh Guest) agar
  tekanan rate-limit anonymous sign-in lokal lebih kecil; room fixture tetap
  dibersihkan di `finally`.
- S-11 menambahkan burst 6 join paralel untuk menangkap S-60-08; S-12 mengimpor
  `hashIp` asli dan menguji bentuk IPv4-mapped hex/IPv4-compatible. Detail
  kegagalan tidak mencetak alamat IP mentah.
- S-12 mengimpor `hashIp` asli dari `src/lib/ip.ts`; jalankan dengan
  `--experimental-strip-types` pada Node 22.22.
- Tidak ada perubahan kontrak RPC, migration, dependency, atau kode produk.
