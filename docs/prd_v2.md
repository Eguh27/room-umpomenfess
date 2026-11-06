# PRODUCT REQUIREMENTS DOCUMENT (PRD)
**Anonymous Private & Public Room Chat — umpomenfess room (v2.1 Final)**

**Status:** Ready / Implementation Verified · **Diperbarui:** November 2026 · **Project:** 3 dari 3 dalam Ekosistem UMPOMENFESS (1: Menfess Utama, 2: Form, 3: Room Chat) · **Subdomain Resmi:** `room.umpomenfess.com`

---

## Ringkasan Perubahan dari Draft Awal v2

* **Sinkronisasi Penuh Arsitektur:** Menyelaraskan seluruh spesifikasi dengan kontrak akhir `TASK.md` (Addendum-01).
* **Model Identitas & Handle:** Mengganti penomoran urut lama (`Guest-01`) dengan sistem **handle acak 9-karakter** `[a-z0-9]{9}` (misal: `wu32t76e3`) untuk semua aktor, dengan dukungan badge `HOST` dan lencana `VERIFIED` khusus akun resmi buatan Admin.
* **Dual Visibility Room:** Menyediakan dua mode room:
  * **PRIVATE (Default):** Menggunakan link dan password 6-karakter acak; tidak diindeks dan tidak tampil di FYP.
  * **PUBLIC:** Tanpa password, terdaftar di katalog publik (FYP / Jelajah) di balik flag kontrol platform.
* **Siklus Hidup & Pelepasan Kursi:** Mendukung pemilihan kapasitas fleksibel (2 s.d. 40 Guest pada Free Tier) dengan mekanisme pelepasan kursi idle otomatis (default 30 menit).
* **Hak Akses Pasca-Tutup:** Setelah room `CLOSED` (7 hari atau manual), akses Guest ditutup total. Hanya Host yang dapat membaca dan mengekspor riwayat chat (.txt) selama masa tenggang 15 hari sebelum dihapus permanen oleh database cron.
* **Keamanan & Moderasi Platform:** Penambahan peran Admin Platform terproteksi MFA (AAL2), pelaporan penyalahgunaan room publik dengan ambang batas auto-hide (≥ 3 laporan unik), dan audit logging yang ketat.
* **Resolusi Pertanyaan Terbuka:** Seluruh 7 poin pertanyaan terbuka telah terjawab dan ditetapkan secara permanen.

---

## 1. Product Vision & Problem Statement

Banyak mahasiswa dan komunitas membutuhkan ruang diskusi online yang cepat, aman, dan privat tanpa harus mengorbankan identitas pribadi—baik untuk keperluan pelaporan internal, sesi curhat/konseling, diskusi kelompok rahasia, maupun obrolan publik bertopik seputar kampus. Platform chat mainstream umumnya memaksa pengguna mendaftarkan akun, membagikan nomor telepon, atau menampilkan profil pribadi.

**umpomenfess room** menyediakan platform percakapan berbasis room web serverless di mana Guest dapat berpartisipasi secara anonim (tanpa akun) cukup dengan mengakses link (dan password untuk room privat), sementara kontrol keamanan dan moderasi dipegang oleh Host terautentikasi dan dipantau oleh Admin Platform.

> **Pernyataan Batas Anonimitas (Wajib tampil di UI / Disclaimer Join):**
> Anonimitas berlaku penuh antar sesama peserta dan terhadap Host di dalam room (Host tidak pernah dapat melihat `user_id` Guest). Namun, anonimitas tidak berlaku terhadap penyedia infrastruktur (jaringan, hosting serverless, dan database), dan pesan tidak dienkripsi end-to-end (E2EE). Layanan ini tidak ditujukan sebagai pengganti kanal *whistleblowing* berisiko pidana tinggi.

---

## 2. Target Pengguna & Persona

1. **Host (Akun Terdaftar):**
   * Individu mahasiswa, pengurus organisasi kampus, konselor sebaya, atau admin komunitas yang ingin membuat ruang diskusi sementara dan memegang kendali atas ruangannya.
2. **Guest Anonim (Tanpa Akun):**
   * Pengguna yang bergabung melalui tautan/password tanpa mendaftar akun; hanya boleh memiliki **1 keanggotaan aktif** sekaligus. Mendapatkan handle acak baru per room.
3. **Guest Terdaftar (Login Member):**
   * Pengguna yang login dengan akun platform; memiliki handle permanen lintas room dan diizinkan memiliki hingga **5 keanggotaan aktif** sekaligus.
4. **Admin Platform (MFA Required):**
   * Pengelola platform dengan hak moderasi darurat, investigasi laporan penyalahgunaan, pengelolaan tier, verifikasi organisasi kampus, dan audit platform. Wajib menggunakan autentikasi dua faktor (AAL2 TOTP).

---

## 3. Goals & Non-Goals

### Goals (MVP & Milestone Rilis)
* Pembuatan room instan oleh Host terdaftar dengan batas kuota room aktif (Free Tier: 3 room aktif).
* Dua jenis visibilitas room: **PRIVATE** (password 6-karakter acak, tampil sekali) dan **PUBLIC** (katalog FYP).
* Alur Waiting Room / Lobby opsional (*Persetujuan Host*) untuk menyaring peserta sebelum masuk.
* Sistem identitas berbasis handle acak `[a-z0-9]{9}` dan real-time chat teks berbasis Supabase Realtime.
* Indikator mengetik (*typing indicator*) agregat tanpa identitas (misal: "2 orang sedang mengetik").
* Siklus hidup otomatis: 7 hari aktif, penutupan otomatis/manual, masa tenggang 15 hari (hanya Host yang bisa baca dan ekspor .txt), lalu hard delete permanen via pg_cron.
* Moderasi Host (Approve/Reject lobby, Kick, Regenerate password, Emergency Private switch).
* Moderasi Admin Platform (MFA AAL2, Report triage, Auto-hide ≥3 reports, Ban/Delist, Audit log).
* Perlindungan anti-abuse berlapis (Cloudflare Turnstile, hash IP untuk lockout rate-limit tanpa menyimpan IP mentah).

### Non-Goals (Ditunda / Post-MVP)
* Kirim media/file (gambar, video, voice note). Chat murni teks (maks. 2000 karakter).
* Aplikasi mobile native (cukup responsif web modern).
* Enkripsi End-to-End (E2EE). Keamanan bersandar pada HTTPS/WSS, password hash, dan Row Level Security (RLS).
* Sistem pembayaran/langganan otomatis (tier disiapkan di database, pengubahan tier dilakukan manual oleh Admin).
* Integrasi Google OAuth untuk Host (MVP fokus email/password + TOTP MFA untuk Admin).
* Personalisasi feed FYP atau algoritma rekomendasi (FYP hanya berdasarkan filter kategori, urutan ramai, dan terbaru).

---

## 4. User Stories

### Sebagai Host:
* *Saya ingin* mendaftar dengan email dan password serta memverifikasi email saya melalui tautan konfirmasi agar akun saya sah dan aman.
* *Saya ingin* membuat room baru dengan menentukan nama, deskripsi, kapasitas peserta (2–40 orang), durasi idle timeout, dan memilih visibilitas (Privat/Publik).
* *Saya ingin* sistem membuatkan password kriptografis acak 6 karakter untuk room privat yang hanya tampil sekali, serta dapat me-regenerate jika bocor.
* *Saya ingin* mengaktifkan fitur Persetujuan Host agar bisa meninjau peserta di lobby sebelum mereka dapat membaca atau mengirim pesan.
* *Saya ingin* mengeluarkan (*kick*) peserta yang melanggar agar suasana diskusi tetap kondusif.
* *Saya ingin* mengekspor seluruh riwayat chat ke format `.txt` bertanda waktu WIB selama room aktif atau dalam masa tenggang 15 hari untuk dokumentasi.
* *Saya ingin* mengubah status room publik menjadi privat sewaktu-waktu sebagai tombol darurat jika terjadi serbuan/spam.

### Sebagai Guest (Anonim & Login):
* *Saya ingin* bergabung ke room privat memakai password tanpa membuat akun agar kerahasiaan identitas saya terjaga penuh.
* *Saya ingin* menjelajahi katalog room publik (FYP) berdasarkan kategori dan bergabung langsung tanpa password jika ada kursi kosong.
* *Saya ingin* melihat status antrean di lobby ketika Persetujuan Host aktif sehingga saya tahu proses verifikasi saya sedang berjalan.
* *Saya ingin* melihat riwayat chat room lengkap sejak awal setelah berhasil di-approve agar dapat memahami konteks pembicaraan.
* *Saya ingin* keluar secara sukarela dari room agar kursi saya terbebas dan saya bisa bergabung ke room lain.

### Sebagai Admin Platform:
* *Saya ingin* login dengan perlindungan MFA wajib (AAL2) sebelum dapat mengakses fungsi konsol admin.
* *Saya ingin* meninjau laporan penyalahgunaan dari room publik dan melihat room yang otomatis di-hide (≥ 3 laporan).
* *Saya ingin* menangguhkan akun pelanggar, membekukan room yang bermasalah, atau memberikan handle terverifikasi kepada organisasi resmi kampus.

---

## 5. Ringkasan Modul & Fitur

| Modul | Deskripsi Fungsional |
|---|---|
| **Autentikasi & Akun** | Supabase Auth (email/password untuk Host/Admin; Anonymous Sign-in untuk Guest). Pendaftaran Host mewajibkan konfirmasi email via Custom SMTP. TOTP MFA wajib untuk peran Admin. |
| **Manajemen Room** | Buat room, kapasitas 2–40 kursi, slug acak 16 karakter, password generator (alfabet bebas ambigu), opsi Persetujuan Host, idle timeout (10–240 menit), dan toggle indikator mengetik. |
| **Katalog FYP (Publik)** | Halaman jelajah `/jelajahi` menampilkan metadata room publik (nama, deskripsi ≤ 200 karakter, kategori, jumlah member aktif). Chat hanya dapat dibaca setelah join. Flag kontrol platform `public_rooms_enabled`. |
| **Lobby & Admission** | Status peserta: `PENDING`, `APPROVED`, `REJECTED`, `KICKED`, `IDLE`, `LEFT`. Host menerima sinyal Realtime saat ada antrean di lobby. |
| **Realtime Chat** | Pengiriman pesan via RPC `send_message`, broadcast instan Supabase Realtime, penandaan handle snapshot, deduplikasi via `client_msg_id`, pagination pesan 50 baris. |
| **Indikator Mengetik** | Realtime Broadcast agregat tanpa identitas ("*X orang sedang mengetik*") dengan batas frekuensi dan kill-switch global. |
| **Siklus Hidup & Ekspor** | Room aktif 7 hari. Penutupan otomatis atau manual mengunci room menjadi `CLOSED`. Akses Guest ditutup total; Host dapat mengunduh log `.txt` selama 15 hari. Pembersihan permanen dijalankan oleh `pg_cron`. |
| **Anti-Abuse & Moderasi** | Cloudflare Turnstile, pelacakan lockout per (room, IP hash) tanpa log IP mentah, pelaporan room publik (threshold 3 laporan unik), tombol darurat ubah publik ke privat. |

---

## 6. Arsitektur Teknis & Infrastruktur

| Layer | Teknologi | Pertimbangan Teknis |
|---|---|---|
| **Frontend & SSR** | Astro SSR + Vercel Serverless + React Island | Performa awal cepat, SEO aman untuk landing page, interaktivitas chat terisolasi di pulau React. |
| **Database & Auth** | Supabase Postgres, GoTrue Auth, Realtime (Postgres Changes + Broadcast), RLS | Proyek Supabase terpisah khusus room chat untuk menjaga independensi kuota database dan koneksi WebSocket. |
| **Akses Data & Keamanan** | PostgreSQL RPC (Security Definer) | **Semua penulisan wajib melalui RPC**. Seluruh tabel inti tidak memiliki hak INSERT/UPDATE/DELETE langsung untuk role `anon`/`authenticated`. |
| **DNS & Routing** | Cloudflare DNS-Only (Grey Cloud) | Tidak menggunakan proxy CDN oranye di depan Vercel sesuai rekomendasi Vercel Hobby plan. |
| **Bot Protection** | Cloudflare Turnstile | Dipasang pada formulir register Host, anonymous sign-in, dan form join room. |
| **Email Service** | Custom SMTP (Resend / Brevo / sejenisnya) | Wajib disiapkan pada Supabase Auth agar pengiriman email konfirmasi pendaftaran tidak terhambat limit bawaan Supabase (3-4 email/jam). |
| **Penjadwal Otomatis** | `pg_cron` (Database) + GitHub Actions (Keep-Alive) | `pg_cron` membersihkan room kedaluwarsa (> masa tenggang 15 hari) dan attempt lockout lama. GitHub Actions melakukan ping berkala untuk mencegah auto-pause Supabase Free. |

---

## 7. Batasan Kuota (Tier Limits) & Parameter Konfigurasi

Semua angka disimpan di database (`tier_limits` dan `app_config`), sehingga dapat diubah tanpa deploy ulang kode.

### Tabel Kuota Tier (`tier_limits`):
| Parameter | Free Tier (Default) | Premium Tier (Direncanakan) |
|---|---|---|
| **Room Aktif Bersamaan per Host** | 3 room | 10 room |
| **Kapasitas Kursi per Room (`max_guests`)** | 2 s.d. 40 kursi | 2 s.d. 75 kursi |
| **Batas Maksimal Pesan per Room** | 5.000 pesan | 20.000 pesan |
| **Maksimal Room Publik Aktif per Host** | 1 room publik | 3 room publik |

### Tabel Konfigurasi Sistem (`app_config`):
* `message_max_length`: 2.000 karakter per pesan.
* `messages_per_minute`: 20 pesan/menit per anggota.
* `anon_max_active_rooms`: 1 room aktif untuk sesi Guest anonim.
* `login_max_active_rooms`: 5 room aktif untuk akun Guest login.
* `password_length`: 6 karakter (alfabet kriptografis `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`).
* `lockout_fail_threshold`: 5 kali salah password berturut-turut.
* `lockout_duration_minutes`: 15 menit penguncian join.
* `room_active_days`: 7 hari durasi aktif room.
* `room_grace_days`: 15 hari masa tenggang pasca-tutup (read-only Host & export).
* `report_hide_threshold`: 3 laporan unik untuk auto-hide room publik ke status `HIDDEN`.
* `public_rooms_enabled`: Toggle global FYP (default `false` saat awal M1/M2).

---

## 8. Skema Data & Model Privasi

### Struktur Tabel Inti:
1. **`profiles`:** Menyimpan akun Host dan Guest login (`user_id`, `tier`, `handle`, `handle_verified`, `role`, `suspended`).
2. **`rooms`:** Menyimpan konfigurasi dan metadata room (`slug`, `host_id`, `name`, `password_hash`, `visibility`, `approval_required`, `max_guests`, `idle_timeout_minutes`, `listing_status`, waktu siklus hidup).
3. **`room_members`:** Daftar anggota yang terlihat oleh sesama anggota dan Host (`room_id`, `handle`, `handle_verified`, `status`, `joined_at`, `last_active_at`).
4. **`member_identities`:** **Tabel terpisah khusus internal server** (`room_id`, `member_id`, `user_id`). Terkunci tanpa hak akses bagi client untuk memastikan Host tidak pernah bisa mengintip `user_id` Guest anonim.
5. **`messages`:** Riwayat pesan (`room_id`, `sender_handle`, `sender_role`, `content`, `client_msg_id`, `created_at`).
6. **`room_reports`:** Laporan penyalahgunaan room publik (`room_id`, `reporter_user_id`, `reason`, `ip_hash`).
7. **`admin_audit_log`:** Log audit append-only untuk setiap aksi yang diambil oleh Admin Platform.

---

## 9. Kebijakan Siklus Hidup Room (Lifecycle Matrix)

| Fase | Durasi / Pemicu | Status | Perilaku Sistem |
|---|---|---|---|
| **Fase 1: Aktif** | Hari 0 s.d. 7 (atau sampai Host menutup manual) | `ACTIVE` | Peserta dapat bergabung, mengantre di lobby, dan berkirim pesan secara real-time. Hitung mundur waktu tampil di header room. |
| **Fase 2: Ditutup (Masa Tenggang)** | Hari ke-7 atau saat ditutup manual Host | `CLOSED` | **Akses Guest ditutup total.** Input pesan dikunci di tingkat RPC database. Host dapat mengakses arsip dan mengekspor riwayat obrolan ke file `.txt`. |
| **Fase 3: Pembersihan Permanen** | `closed_at` + 15 hari | `DELETED` | Job otomatis `pg_cron` menghapus seluruh baris room, pesan, identitas, dan riwayat terkait dari database secara tuntas (*hard delete*). |

---

## 10. Resolusi Pertanyaan Terbuka (Final Decisions)

Seluruh pertanyaan terbuka dari PRD sebelumnya telah disepakati dan diputuskan sebagai berikut:

1. **Batas Free Tier:** 3 room aktif per Host, kapasitas fleksibel 2–40 Guest per room, batas 5.000 pesan per room, dan auto-kick kursi idle (default 30 menit).
2. **Akses Guest Setelah Room CLOSED:** Guest **kehilangan akses total** setelah status room menjadi `CLOSED`. Hanya Host yang dapat membaca dan mengekspor log chat selama masa tenggang 15 hari.
3. **Proyek Supabase:** Menggunakan **proyek Supabase terpisah secara penuh** dari proyek menfess dan form, guna mencegah bottleneck kuota Realtime dan isolasi penuh data rahasia.
4. **Konfirmasi Email Host:** **Wajib dikonfirmasi** sebelum Host dapat login dan membuat room apa pun. Setup Custom SMTP (seperti Resend) diwajibkan sebagai prasyarat operasional deployment.
5. **Google OAuth untuk Host:** **Diparkir di Backlog / Fase 2**. MVP berkonsentrasi pada email/password dengan perlindungan Turnstile dan TOTP MFA untuk akun Admin.
6. **Mekanisme Pelaporan Penyalahgunaan:** Room privat menggunakan moderasi lokal Host (Kick/Reject). Room publik di FYP dilengkapi tombol **Laporkan** dengan aturan otomatis: ≥ 3 laporan unik menyembunyikan room (`HIDDEN`) hingga diverifikasi Admin Platform.
7. **Nama Produk & Subdomain:** Nama resmi produk adalah **`umpomenfess room`**, berjalan pada subdomain **`room.umpomenfess.com`** (atau `room.<domain-utama>`).
