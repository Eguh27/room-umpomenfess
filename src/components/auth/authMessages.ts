import type { AuthError } from '@supabase/supabase-js';

const DEFAULT_NEXT = '/dashboard';

/**
 * Hanya izinkan tujuan internal. `//evil.example` dan `/\evil.example`
 * diperlakukan sebagai URL luar supaya tidak menjadi open redirect.
 */
export function safeNext(value: string | null | undefined, fallback = DEFAULT_NEXT): string {
  if (!value || !value.startsWith('/')) return fallback;
  if (value.startsWith('//') || value.includes('\\')) return fallback;
  return value;
}

export function emailNotConfirmed(error: AuthError | null): boolean {
  if (error?.code === 'email_not_confirmed') return true;
  return /email not confirmed/i.test(error?.message ?? '');
}

/** Alamat balik setelah email konfirmasi dibuka. */
export function emailRedirectTo(next: string): string {
  const base = `${window.location.origin}/auth/callback`;
  return `${base}?next=${encodeURIComponent(safeNext(next))}`;
}

/**
 * Terjemahkan kode Supabase Auth ke kalimat yang tidak membocorkan apakah
 * sebuah alamat email terdaftar. Kode mentah tidak pernah ditampilkan.
 */
export function authErrorFor(error: AuthError | null): string {
  const code = error?.code ?? '';
  switch (code) {
    case 'invalid_credentials':
      return 'Email atau password tidak cocok. Periksa lagi, lalu coba masuk.';
    case 'email_not_confirmed':
      return 'Email ini belum dikonfirmasi. Buka tautan di kotak masuk, lalu masuk lagi.';
    case 'captcha_failed':
      return 'Pengecekan manusia gagal. Selesaikan verifikasi di bawah, lalu coba lagi.';
    case 'over_request_rate_limit':
      return 'Terlalu banyak percobaan dalam waktu singkat. Tunggu sebentar, lalu coba lagi.';
    case 'weak_password':
      return 'Password terlalu lemah. Gunakan minimal 8 karakter.';
    case 'user_banned':
      return 'Akun ini sedang ditangguhkan. Hubungi pengelola bila kamu merasa ini keliru.';
    case 'mfa_verification_failed':
      return 'Kode TOTP salah atau sudah kedaluwarsa. Masukkan kode terbaru dari aplikasi autentikator.';
    case 'mfa_challenge_expired':
      return 'Kesempatan verifikasi sudah kedaluwarsa. Kirim kode sekali lagi.';
    case 'mfa_factor_name_conflict':
    case 'too_many_enrolled_mfa_factors':
      return 'Faktor MFA tidak bisa didaftarkan. Muat ulang halaman, lalu coba lagi.';
    case 'mfa_totp_enroll_not_enabled':
    case 'mfa_totp_verify_not_enabled':
      return 'MFA TOTP belum diaktifkan di server. Hubungi pengelola sebelum memakai akun Admin.';
    case 'mfa_factor_not_found':
      return 'Faktor MFA tidak ditemukan. Muat ulang halaman, lalu coba lagi.';
    case 'insufficient_aal':
      return 'Sesi ini belum mencapai AAL2. Selesaikan verifikasi MFA terlebih dahulu.';
    default:
      if (error?.status === 0) {
        return 'Tidak bisa menghubungi layanan otentikasi. Periksa koneksi, lalu coba lagi.';
      }
      return 'Otentikasi gagal. Coba lagi sebentar lagi.';
  }
}

/** Validasi lokal sebelum memanggil Supabase. */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'Password minimal 8 karakter.';
  return null;
}
