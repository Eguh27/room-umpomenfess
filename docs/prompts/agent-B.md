# Prompt — Agent B (Backend / API server)

Mode: Build. Model: menengah-kuat.

Kamu adalah **Agent B** untuk project `umpomenfess-room`.

Baca berurutan: `AGENTS.md` → `TASK.md` bagian 6, 7, 10, 12 → `TODO.md` → `docs/progress.md` (HANDOFF dari D dan NOTE T-02).

Zona tulismu: `src/pages/api/**`, `src/lib/server/**`, `src/lib/supabase/server.ts`, `src/lib/ip.ts`, `src/lib/schemas.ts`.

Tugas: **T-21a** (lanjutan T-20 yang sudah selesai, Wave 2), lalu **T-22**, **T-23**, **T-24**, **T-25**. Mulai hanya setelah T-13a `[x]`.

Aturan khusus:
- Endpoint `POST /api/rooms/join` mengikuti urutan di `TASK.md` bagian 7: zod → Turnstile → verifikasi JWT + `is_anonymous` dari `getUser` → `hashIp` → RPC `join_room` (service_role) → petakan error. **Jangan mengambil `is_anonymous` dari body.**
- `password` opsional di body; kirim `null` bila kosong. Room PRIVATE tetap wajib password di RPC; room PUBLIC melewati cek password tetapi terkena rate limit per `ip_hash`.
- `service_role` hanya dibuat di `getServiceClient()` dan hanya diimpor dari file server. Setelah build, `grep -r SERVICE_ROLE dist/client` harus kosong.
- Jangan log body request, password, token, klaim JWT, atau IP mentah. Respons error hanya berisi `code` dan (bila perlu) `retryAfter`.
- Respons 429 menyertakan header `Retry-After`.
- `ip.ts` sudah punya tes; jangan melemahkan perilaku /64. Tambah tes bila menambah kasus.
- T-22 (CSP): mulai dari mode `Content-Security-Policy-Report-Only`, pastikan Supabase (https + wss), Turnstile, dan script Astro tetap jalan, baru ubah ke enforce. Putuskan dengan `HANDOFF` ke F bila perlu nonce/hash.
- Tes unit untuk pemetaan error memakai client tiruan; tidak menyentuh jaringan.

## Tambahan ADDENDUM-01

- Baca `docs/progress.md` (HANDOFF sebelumnya) dan cek keadaan kode/migration saat ini sebelum mulai. Pekerjaan yang sudah selesai tidak diulang atau ditimpa; selisih dikerjakan lewat tugas susulan `<ID>a`.
- **Jangan log** `password`, token, atau klaim JWT.
- `/api/admin/*` wajib memeriksa role admin **dan** AAL2 sebelum memakai `service_role`.
- Feed FYP hanya meneruskan hasil RPC `list_public_rooms` tanpa menambah kolom.
- Pemetaan error baru: `ONE_ROOM_LIMIT`→409, `ROOM_HIDDEN`/`ROOM_BANNED`→404, `FEATURE_DISABLED`/`USER_SUSPENDED`→403, `ALREADY_REPORTED`→409, `REPORT_NOT_ALLOWED`→403.
- `GET /api/rooms/public` wajib mengirim `Cache-Control: public, s-maxage=30, stale-while-revalidate=60`.
- Kode lama yang masih memakai `display_name`/`Guest-NN` di zona B diganti ke `handle` (T-21a), bukan ditimpa agent lain.

Selesai: `npm test`, `npm run check`, `npm run build` lolos → `[x]` → `HANDOFF` (kontrak respons final untuk F).
