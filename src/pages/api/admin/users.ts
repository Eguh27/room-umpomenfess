import type { APIRoute } from 'astro';
import { adminCreateUserSchema } from '../../../lib/schemas';
import { mapAdminError } from '../../../lib/server/join-errors';
import { getBearerToken, json, readJsonBody } from '../../../lib/server/api';
import {
  decodeJwtClaims,
  getServiceClient,
  getUserClient,
  verifyAccessTokenUser,
} from '../../../lib/supabase/server';

export const prerender = false;

/**
 * POST /api/admin/users — buat akun organisasi (kontrak TASK.md bagian 7).
 * Urutan wajib: verifikasi pemanggil (JWT valid → klaim `aal` = aal2 →
 * profiles.role = 'admin' via JWT-nya sendiri) SEBELUM menyentuh
 * service_role untuk inviteUserByEmail. admin_rename_handle dipanggil
 * dengan JWT admin (bukan service_role) dan menulis admin_audit_log.
 * Audit tidak pernah memuat email/password.
 */
export const POST: APIRoute = async ({ request }) => {
  const payload = await readJsonBody(request);
  if (payload === null) {
    return json({ error: 'INVALID_INPUT' }, 400);
  }

  const parsed = adminCreateUserSchema.safeParse(payload);
  if (!parsed.success) {
    return json({ error: 'INVALID_INPUT' }, 400);
  }

  const { email, handle } = parsed.data;

  const accessToken = getBearerToken(request);
  if (!accessToken) {
    return json({ error: 'UNAUTHORIZED' }, 401);
  }

  let verified: Awaited<ReturnType<typeof verifyAccessTokenUser>>;
  let claims: Record<string, unknown> | null;
  try {
    verified = await verifyAccessTokenUser(accessToken);
    claims = verified ? decodeJwtClaims(accessToken) : null;
  } catch {
    return json({ error: 'SERVER_ERROR' }, 500);
  }
  if (!verified) {
    return json({ error: 'UNAUTHORIZED' }, 401);
  }
  // Admin wajib AAL2 (klaim JWT) dan bukan sesi anonim.
  if (verified.isAnonymous || claims?.aal !== 'aal2') {
    return json({ error: 'MFA_REQUIRED' }, 403);
  }

  // Role admin dibaca dari profiles dengan JWT pemanggil sendiri (policy
  // profiles_select_self) — service_role baru boleh dipakai setelah lolos.
  let isAdmin = false;
  try {
    const { data } = await getUserClient(accessToken)
      .schema('public')
      .from('profiles')
      .select('role')
      .eq('user_id', verified.userId)
      .maybeSingle();
    isAdmin = data?.role === 'admin';
  } catch {
    return json({ error: 'SERVER_ERROR' }, 500);
  }
  if (!isAdmin) {
    return json({ error: 'NOT_ADMIN' }, 403);
  }

  // 1. Buat akun via Supabase Admin API (service_role, sudah terverifikasi admin AAL2).
  let invitedId: string;
  try {
    const { data, error } = await getServiceClient().auth.admin.inviteUserByEmail(email);
    if (error || !data.user) {
      // 422 = email sudah terdaftar (kondisi yang bisa diperbaiki client).
      return json({ error: error?.status === 422 ? 'EMAIL_TAKEN' : 'SERVER_ERROR' }, error?.status === 422 ? 409 : 500);
    }
    invitedId = data.user.id;
  } catch {
    return json({ error: 'SERVER_ERROR' }, 500);
  }

  // 2. Set handle terverifikasi via RPC Admin (JWT admin; audit otomatis di RPC).
  let rpcError: string | null;
  try {
    const { error } = await getUserClient(accessToken).rpc('admin_rename_handle', {
      p_user_id: invitedId,
      p_new_handle: handle,
      p_verified: true,
    });
    rpcError = error?.message ?? null;
  } catch {
    return json({ error: 'SERVER_ERROR' }, 500);
  }
  if (rpcError) {
    const mapped = mapAdminError(rpcError);
    return json(mapped.body, mapped.status);
  }

  return json({ ok: true, userId: invitedId, handle });
};
