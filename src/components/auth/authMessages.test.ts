import { AuthError } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { authErrorFor, emailNotConfirmed, passwordProblem, safeNext } from './authMessages';

describe('safeNext', () => {
  it('menerima path internal', () => {
    expect(safeNext('/dashboard')).toBe('/dashboard');
    expect(safeNext('/admin/mfa?next=/admin')).toBe('/admin/mfa?next=/admin');
  });

  it('menolak URL luar dan path kosong', () => {
    expect(safeNext(null)).toBe('/dashboard');
    expect(safeNext('')).toBe('/dashboard');
    expect(safeNext('https://evil.example')).toBe('/dashboard');
    expect(safeNext('//evil.example')).toBe('/dashboard');
    expect(safeNext('/\\evil.example')).toBe('/dashboard');
  });

  it('memakai fallback khusus bila diberikan', () => {
    expect(safeNext(null, '/login')).toBe('/login');
  });
});

describe('emailNotConfirmed', () => {
  it('mengenali kode dan pesan Supabase', () => {
    expect(
      emailNotConfirmed(new AuthError('Email not confirmed', 400, 'email_not_confirmed')),
    ).toBe(true);
    expect(emailNotConfirmed(new AuthError('Email not confirmed', 400))).toBe(true);
    expect(
      emailNotConfirmed(new AuthError('Invalid credentials', 400, 'invalid_credentials')),
    ).toBe(false);
    expect(emailNotConfirmed(null)).toBe(false);
  });
});

describe('authErrorFor', () => {
  it('memetakan kode penting tanpa membocorkan email terdaftar', () => {
    expect(authErrorFor(new AuthError('x', 400, 'invalid_credentials'))).toContain(
      'Email atau password tidak cocok',
    );
    expect(authErrorFor(new AuthError('x', 400, 'captcha_failed'))).toContain(
      'Pengecekan manusia gagal',
    );
    expect(authErrorFor(new AuthError('x', 400, 'mfa_verification_failed'))).toContain(
      'Kode TOTP salah',
    );
    expect(authErrorFor(new AuthError('x', 400, 'mfa_totp_enroll_not_enabled'))).toContain(
      'MFA TOTP belum diaktifkan',
    );
  });

  it('memberi pesan jaringan saat status 0', () => {
    expect(authErrorFor(new AuthError('fetch failed', 0))).toContain('Tidak bisa menghubungi');
  });
});

describe('passwordProblem', () => {
  it('mewajibkan minimal 8 karakter', () => {
    expect(passwordProblem('1234567')).toBe('Password minimal 8 karakter.');
    expect(passwordProblem('12345678')).toBeNull();
  });
});
