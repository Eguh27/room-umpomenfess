# Skrip keamanan T-61

Skrip ini menguji S-01…S-14, S-19, dan S-20 langsung ke REST/RPC Supabase,
bukan lewat UI. Setiap uji mencetak `LULUS` atau `GAGAL`; kegagalan juga
menampilkan pemeriksaan yang gagal.

## Menjalankan

Default membaca `.env.local` dan hanya mau berjalan ke Supabase lokal
(`127.0.0.1`/`localhost`). Supabase lokal harus aktif.

```bash
# Node 22.22 membutuhkan flag ini untuk mengimpor src/lib/ip.ts pada S-12.
bash scripts/security/run.sh

# Hanya satu uji
bash scripts/security/run.sh --only=S-20

# Laporkan temuan terbuka tanpa membuat exit code gagal
bash scripts/security/run.sh --allow-open
```

Exit code `1` bila ada uji `GAGAL`. Gunakan `--allow-open` hanya saat temuan
yang sudah tercatat di `docs/audit/` belum diperbaiki (misalnya S-20 sebelum
T-64).

## Konfigurasi

Urutan pembacaan: environment proses, lalu `.env.local` (kecuali sudah diset).

| Variabel                                                     | Wajib | Keterangan                                                  |
| ------------------------------------------------------------ | ----: | ----------------------------------------------------------- |
| `PUBLIC_SUPABASE_URL` atau `SECURITY_BASE_URL`               |    ya | URL Supabase lokal                                          |
| `PUBLIC_SUPABASE_ANON_KEY` atau `SECURITY_ANON_KEY`          |    ya | anon/publishable key                                        |
| `SUPABASE_SERVICE_ROLE_KEY` atau `SECURITY_SERVICE_ROLE_KEY` |    ya | hanya setup/cleanup/verifikasi                              |
| `IP_HASH_SALT`                                               |  S-12 | salt HMAC untuk mengimpor `hashIp`                          |
| `SECURITY_ENV_FILE`                                          | tidak | path env alternatif                                         |
| `ALLOW_REMOTE_SECURITY_TESTS=1`                              | tidak | izinkan URL non-lokal (hanya lingkungan uji yang disetujui) |

Script tidak mencetak token, password, service key, atau IP mentah. Service
role **tidak** dipakai untuk request serangan; request serangan memakai anon
key + JWT Host/Guest. Pengecualian yang memang service-only:

- `join_room` dan `record_join_failure` adalah RPC server; S-11/S-12/S-14
  memanggilnya sebagai simulasi Agent B. S-08 membuktikan client tidak bisa.
- Pembuatan user fixture, penghapusan fixture, dan pengecekan state DB.
- S-06 menyetel status `IDLE` lewat service role karena transisi idle normal
  bergantung waktu/`release_idle_members` internal.

## Struktur

- `lib/env.mjs` — parser env dan guard lokal.
- `lib/http.mjs` — REST, RPC, Auth, Admin API.
- `lib/auth.mjs` — Host email/password dan Guest anonymous sign-in.
- `lib/fixtures.mjs` — room/member/message helper dan cleanup.
- `lib/realtime.mjs` — langganan Postgres Changes untuk S-05/S-06.
- `lib/test.mjs` — runner `LULUS`/`GAGAL`.
- `tests/sNN.mjs` — satu berkas per uji.
- `run-all.mjs` — setup fixture, eksekusi berurutan, cleanup di `finally`.

## Catatan hasil

Status terakhir ada di `docs/audit/t61-results.md`. S-11, S-12, dan S-20
sengaja merah selama temuan T-60 (lockout paralel, normalisasi IPv6, akses
setelah `delete_at`) belum diperbaiki di T-64. Jangan menghijaukan uji dengan
melonggarkan assertion; perbaiki produk di zona masing-masing.
