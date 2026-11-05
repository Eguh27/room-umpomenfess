import type { AuthError, Session } from '@supabase/supabase-js';
import { getBrowserClient } from '../../lib/supabase/browser';
import { emailRedirectTo } from './authMessages';
import { syncSessionCookie } from './sessionCookie';

export type TotpFactor = { id: string; name: string };

export type AuthFailure = { ok: false; error: AuthError | null };
export type SessionResult = { ok: true; session: Session | null } | AuthFailure;
export type TotpEnrollment = { factorId: string; qrCode: string; secret: string };
export type EnrollResult = { ok: true; enrollment: TotpEnrollment } | AuthFailure;
export type VerifyResult = { ok: true } | AuthFailure;
export type Destination =
  { kind: 'redirect'; href: string } | { kind: 'mfa'; factors: TotpFactor[] };

export async function currentSession(): Promise<Session | null> {
  const { data, error } = await getBrowserClient().auth.getSession();
  return error ? null : data.session;
}

export async function signIn(
  email: string,
  password: string,
  captchaToken: string,
): Promise<SessionResult> {
  const { data, error } = await getBrowserClient().auth.signInWithPassword({
    email,
    password,
    options: { captchaToken },
  });
  if (error) return { ok: false, error };
  syncSessionCookie(data.session);
  return { ok: true, session: data.session };
}

export async function signUp(
  email: string,
  password: string,
  captchaToken: string,
  next: string,
): Promise<SessionResult> {
  const { data, error } = await getBrowserClient().auth.signUp({
    email,
    password,
    options: { captchaToken, emailRedirectTo: emailRedirectTo(next) },
  });
  if (error) return { ok: false, error };
  if (data.session) syncSessionCookie(data.session);
  return { ok: true, session: data.session };
}

export async function resendConfirmation(
  email: string,
  captchaToken: string,
  next: string,
): Promise<{ ok: true } | AuthFailure> {
  const { error } = await getBrowserClient().auth.resend({
    type: 'signup',
    email,
    options: { captchaToken, emailRedirectTo: emailRedirectTo(next) },
  });
  return error ? { ok: false, error } : { ok: true };
}

export async function verifiedTotpFactors(): Promise<TotpFactor[]> {
  const { data, error } = await getBrowserClient().auth.mfa.listFactors();
  if (error || !data) return [];
  return data.all
    .filter((factor) => factor.factor_type === 'totp' && factor.status === 'verified')
    .map((factor) => ({
      id: factor.id,
      name: factor.friendly_name || 'Aplikasi autentikator',
    }));
}

/** Profil baru dari T-16; sebelum migration itu ada, role tidak diketahui. */
async function profileRole(): Promise<'admin' | 'user' | null> {
  const client = getBrowserClient();
  const { data: userData } = await client.auth.getUser();
  if (!userData.user) return null;

  const { data, error } = await client
    .from('profiles')
    .select('role')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (error || !data) return null;
  const record = data as Record<string, unknown>;
  return record.role === 'admin' ? 'admin' : 'user';
}

/**
 * Tentukan langkah setelah sesi terbentuk. Admin tanpa AAL2 diarahkan ke
 * halaman pendaftaran MFA; akun dengan faktor terverifikasi diminta kode.
 */
export async function destinationAfterAuth(next: string): Promise<Destination> {
  const client = getBrowserClient();
  const { data } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  const currentLevel = data?.currentLevel ?? null;
  const factors = await verifiedTotpFactors();

  if (data?.nextLevel === 'aal2' && currentLevel !== 'aal2' && factors.length > 0) {
    return { kind: 'mfa', factors };
  }

  if (currentLevel !== 'aal2' && (await profileRole()) === 'admin') {
    return { kind: 'redirect', href: `/admin/mfa?next=${encodeURIComponent(next)}` };
  }

  return { kind: 'redirect', href: next };
}

export async function challengeTotp(factorId: string, code: string): Promise<VerifyResult> {
  const client = getBrowserClient();
  const challenge = await client.auth.mfa.challenge({ factorId });
  if (challenge.error) return { ok: false, error: challenge.error };

  const verify = await client.auth.mfa.verify({
    factorId,
    challengeId: challenge.data.id,
    code,
  });
  if (verify.error) return { ok: false, error: verify.error };

  const { data } = await client.auth.getSession();
  syncSessionCookie(data.session);
  return { ok: true };
}

export async function enrollTotp(): Promise<EnrollResult> {
  const client = getBrowserClient();
  const { data: factors } = await client.auth.mfa.listFactors();

  // Faktor TOTP yang belum terverifikasi bisa menumpuk setelah percobaan
  // pendaftaran yang gagal; bersihkan dulu supaya QR baru tidak konflik.
  for (const factor of factors?.all ?? []) {
    if (factor.factor_type === 'totp' && factor.status === 'unverified') {
      await client.auth.mfa.unenroll({ factorId: factor.id });
    }
  }

  const { data, error } = await client.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: 'Admin TOTP',
  });
  if (error || !data?.totp) return { ok: false, error };

  return {
    ok: true,
    enrollment: {
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
    },
  };
}
