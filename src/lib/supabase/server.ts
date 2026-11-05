import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from 'astro:env/client';
import { SUPABASE_SERVICE_ROLE_KEY } from 'astro:env/server';

/** Hasil RPC join_room (signature 5 argumen, TASK.md bagian 6). */
export type JoinRoomRow = {
  status: 'PENDING' | 'APPROVED';
  room_id: string;
  member_id: string;
  handle: string;
};

/** Hasil RPC adopt_guest_identity (migrasi 0013). */
export type AdoptGuestRow = {
  room_id: string;
  slug: string;
  handle: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'KICKED' | 'IDLE' | 'LEFT';
  old_user_id: string;
};

function requireEnv(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} belum diset`);
  return value;
}

/** HANYA untuk kode server (API route). Memakai service_role: melewati RLS. */
export function getServiceClient(): SupabaseClient {
  const url = requireEnv(PUBLIC_SUPABASE_URL, 'PUBLIC_SUPABASE_URL');
  const key = requireEnv(SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Client dengan kunci publik; dipakai server hanya untuk memverifikasi access token. */
export function getAnonClient(): SupabaseClient {
  const url = requireEnv(PUBLIC_SUPABASE_URL, 'PUBLIC_SUPABASE_URL');
  const key = requireEnv(PUBLIC_SUPABASE_ANON_KEY, 'PUBLIC_SUPABASE_ANON_KEY');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Client kunci publik yang selalu mengirim JWT user. RPC yang identitasnya
 * dari `auth.uid()` (mis. report_room) wajib lewat client ini, BUKAN
 * service_role (yang tidak punya identitas user).
 */
export function getUserClient(token: string): SupabaseClient {
  const url = requireEnv(PUBLIC_SUPABASE_URL, 'PUBLIC_SUPABASE_URL');
  const key = requireEnv(PUBLIC_SUPABASE_ANON_KEY, 'PUBLIC_SUPABASE_ANON_KEY');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

/**
 * Dekode payload JWT TANPA verifikasi signature. Hanya untuk klaim non-
 * keamanan (mis. `aal`); validitas token tetap WAJIB diverifikasi lebih
 * dulu lewat `verifyAccessTokenUser()` (getUser).
 */
export function decodeJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replaceAll('-', '+').replaceAll('_', '/');
    const parsed: unknown = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export type VerifiedUser = {
  userId: string;
  isAnonymous: boolean;
};

/**
 * Memverifikasi access token milik pemanggil dan mengembalikan identitas
 * yang dibutuhkan RPC 5-argumen: `is_anonymous` WAJIB diambil dari hasil
 * `getUser(token)`, bukan dari body request (TASK.md bagian 7).
 */
export async function verifyAccessTokenUser(
  token: string,
): Promise<VerifiedUser | null> {
  if (!token) return null;
  const { data, error } = await getAnonClient().auth.getUser(token);
  if (error || !data.user) return null;
  return {
    userId: data.user.id,
    isAnonymous: data.user.is_anonymous === true,
  };
}

/** Memverifikasi access token; mengembalikan user id atau null. */
export async function verifyAccessToken(token: string): Promise<string | null> {
  const user = await verifyAccessTokenUser(token);
  return user?.userId ?? null;
}
