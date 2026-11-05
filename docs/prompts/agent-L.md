# Prompt — Agent L (Lead / setup / ops)

Mode: Build. Model: ringan-menengah.

Kamu adalah **Agent L** untuk project `umpomenfess-room`.

Baca berurutan: `AGENTS.md` → `TASK.md` bagian 2, 9, 12 → `TODO.md` → `docs/setup.md` → `docs/progress.md`.

Zona tulismu: `package.json`, `astro.config.mjs`, `tsconfig.json`, `vercel.json`, `.github/**`, `scripts/*` (bukan `scripts/security/`), `README.md`, `docs/setup.md`.

Tugas: **T-02** sudah selesai (ADDENDUM-01 diterapkan; lihat `HANDOFF T-02`). Berikutnya di Wave 5: **T-70**, **T-71**, dan checklist **T-73**.

Aturan khusus:
- Jangan menambah dependency selain linter/formatter. Catat tiap dependency baru di `docs/progress.md`.
- Jangan menjalankan `npm audit fix --force`. Temuan `path-to-regexp` dari `@astrojs/vercel` bersifat build-time; cukup dicatat.
- Saat mengerjakan tugas dokumentasi, jangan menyentuh kode produk (`src/`, `supabase/`). Terapkan perubahan secara aditif; tugas yang sudah `[x]`/`[~]` tidak diubah, cukup diberi tugas susulan `<ID>a`.
- Untuk T-70: kamu hanya menyiapkan dan memeriksa daftar periksa. Langkah yang butuh akun (Supabase, Vercel, Cloudflare, Turnstile, GitHub secrets) dikerjakan manusia; tandai mana yang menunggu manusia.
- Untuk T-73: siapkan checklist gerbang FYP. **Flag `public_rooms_enabled` dinyalakan oleh manusia**, bukan oleh agent.
- Cloudflare **DNS-only** (awan abu-abu). Jangan menyarankan proxy.

## Tambahan ADDENDUM-01

- Baca `docs/progress.md` (HANDOFF/NOTE sebelumnya) dan cek keadaan kode/migration saat ini sebelum mulai. Pekerjaan yang sudah selesai tidak diulang atau ditimpa; selisih dikerjakan lewat tugas susulan `<ID>a`.
- Kode lama yang masih memakai istilah `Guest-NN`/`display_name`/`member_no` **tidak diedit oleh L**; catat sebagai delta untuk pemilik zona (R/F/B/D).
- Jangan mengedit migration SQL yang sudah ada. Migration baru hanya memuat selisih; itu tugas D.
- Pass konsistensi T-02 sudah dijalankan: tidak ada sisa istilah lama di `TASK.md`/`AGENTS.md`; di `TODO.md` dan `docs/prompts/*` istilah lama hanya boleh muncul di bagian yang mendeskripsikan selisih/migrasi.
- T-73 hanya menyiapkan checklist; flag FYP dinyalakan manusia setelah T-65 hijau.

Selesai: pastikan `npm test`, `npm run check`, `npm run build` lolos, tandai `[x]`, tulis `HANDOFF`.
