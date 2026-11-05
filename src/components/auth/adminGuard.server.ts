import type { AstroCookies } from 'astro';
import { getServiceClient, verifyAccessToken } from '../../lib/supabase/server';
import { SESSION_COOKIE } from './sessionCookie';

export type AdminAccess =
  | { kind: 'ok'; userId: string; aal: string }
  | { kind: 'login' }
  | { kind: 'mfa' }
  | { kind: 'forbidden' }
  | { kind: 'unavailable' };

type ProfileRow = { role?: unknown };

/** Baca klaim `aal` dari JWT yang sudah diverifikasi Supabase. */
function readAal(token: string): string | null {
  const encoded = token.split('.')[1];
  if (!encoded) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as {
      aal?: unknown;
    };
    return typeof payload.aal === 'string' ? payload.aal : null;
  } catch {
    return null;
  }
}

async function loadAdmin(
  cookies: AstroCookies,
): Promise<
  { kind: 'ok'; userId: string; aal: string; role: 'admin' } | Exclude<AdminAccess, { kind: 'ok' }>
> {
  const token = cookies.get(SESSION_COOKIE)?.value;
  if (!token) return { kind: 'login' };

  const userId = await verifyAccessToken(token);
  if (!userId) return { kind: 'login' };

  let row: ProfileRow | null;
  try {
    const { data, error } = await getServiceClient()
      .from('profiles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return { kind: 'unavailable' };
    row = data as ProfileRow | null;
  } catch {
    return { kind: 'unavailable' };
  }

  if (row?.role !== 'admin') return { kind: 'forbidden' };
  return { kind: 'ok', userId, aal: readAal(token) ?? 'aal1', role: 'admin' };
}

/** Guard halaman data Admin: role admin + AAL2. */
export async function adminAccess(cookies: AstroCookies): Promise<AdminAccess> {
  const access = await loadAdmin(cookies);
  if (access.kind !== 'ok') return access;
  if (access.aal !== 'aal2') return { kind: 'mfa' };
  return access;
}

/** Halaman pendaftaran MFA: role admin boleh masuk pada AAL1. */
export async function adminEnrollmentAccess(cookies: AstroCookies): Promise<AdminAccess> {
  return loadAdmin(cookies);
}

export type AdminPageAccess = AdminAccess | { kind: 'preview' };

/** Guard halaman kerangka `/admin/*` (T-32): sama dengan adminAccess, plus pratinjau
 *  kerangka mock lewat `?state=preview` yang HANYA hidup di dev (konstanta DEV dihapus
 *  saat build produksi) — menampilkan kerangka tanpa nyentuh data, untuk QA layout
 *  sebelum akun admin ber-MFA tersedia. Produksi selalu guard murni. */
export async function adminPageAccess(
  cookies: AstroCookies,
  url: URL,
): Promise<AdminPageAccess> {
  if (import.meta.env.DEV && url.searchParams.get('state') === 'preview') {
    return { kind: 'preview' };
  }
  return adminAccess(cookies);
}
