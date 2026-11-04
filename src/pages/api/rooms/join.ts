import type { APIRoute } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';
import { IP_HASH_SALT } from 'astro:env/server';
import { hashIp } from '../../../lib/ip';
import { joinRequestSchema } from '../../../lib/schemas';
import { mapJoinError } from '../../../lib/server/join-errors';
import {
  enforceTurnstile,
  getBearerToken,
  json,
  readJsonBody,
} from '../../../lib/server/api';
import {
  getServiceClient,
  verifyAccessTokenUser,
  type JoinRoomRow,
  type VerifiedUser,
} from '../../../lib/supabase/server';

export const prerender = false;

/**
 * Catat kegagalan password di statement terpisah. join_room melakukan
 * RAISE EXCEPTION sehingga tulisannya sendiri di-rollback.
 */
async function recordJoinFailure(
  service: SupabaseClient,
  slug: string,
  ipHash: string,
): Promise<void> {
  try {
    const { error } = await service.rpc('record_join_failure', {
      p_slug: slug,
      p_ip_hash: ipHash,
    });
    if (error) console.error('record_join_failure failed', error.code);
  } catch {
    // Jangan pernah mencatat password/IP mentah. Kegagalan pencatatan
    // tidak boleh mengubah respons 401 ke client.
    console.error('record_join_failure failed');
  }
}

/**
 * POST /api/rooms/join — kontrak TASK.md bagian 7.
 * Turnstile hanya dilewati di development bila secret belum diisi;
 * build produksi selalu mewajibkan TURNSTILE_SECRET_KEY.
 */
export const POST: APIRoute = async ({ request, clientAddress }) => {
  const payload = await readJsonBody(request);
  if (payload === null) {
    return json({ error: 'INVALID_INPUT' }, 400);
  }

  const parsed = joinRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return json({ error: 'INVALID_INPUT' }, 400);
  }

  const { slug, password, turnstileToken } = parsed.data;

  if (!clientAddress) {
    return json({ error: 'SERVER_ERROR' }, 500);
  }

  const turnstileFail = await enforceTurnstile(turnstileToken, clientAddress);
  if (turnstileFail) {
    return turnstileFail;
  }

  const accessToken = getBearerToken(request);
  if (!accessToken) {
    return json({ error: 'UNAUTHORIZED' }, 401);
  }

  let verified: VerifiedUser | null;
  try {
    verified = await verifyAccessTokenUser(accessToken);
  } catch {
    return json({ error: 'SERVER_ERROR' }, 500);
  }
  if (!verified) {
    return json({ error: 'UNAUTHORIZED' }, 401);
  }

  let ipHash: string;
  try {
    ipHash = hashIp(clientAddress, IP_HASH_SALT ?? '');
  } catch {
    return json({ error: 'SERVER_ERROR' }, 500);
  }

  let service: SupabaseClient;
  try {
    service = getServiceClient();
  } catch {
    return json({ error: 'SERVER_ERROR' }, 500);
  }

  let rows: JoinRoomRow[] | null;
  let rpcError: { message: string; details: string | null } | null;
  try {
    const result = await service.rpc('join_room', {
      p_user_id: verified.userId,
      // Kontrak bagian 7: is_anonymous dari token yang diverifikasi, bukan body.
      p_is_anonymous: verified.isAnonymous,
      p_slug: slug,
      p_password: password,
      p_ip_hash: ipHash,
    });
    // RPC SETOF selalu mengembalikan array; validasi bentuk sebelum dipakai.
    rows = Array.isArray(result.data) ? (result.data as JoinRoomRow[]) : null;
    rpcError = result.error;
  } catch {
    return json({ error: 'SERVER_ERROR' }, 500);
  }

  if (rpcError) {
    if (rpcError.message === 'WRONG_PASSWORD') {
      await recordJoinFailure(service, slug, ipHash);
    }
    const mapped = mapJoinError(rpcError.message, rpcError.details);
    return json(mapped.body, mapped.status, mapped.headers);
  }

  const row = rows?.[0];
  if (!row) {
    return json({ error: 'SERVER_ERROR' }, 500);
  }

  return json({
    status: row.status,
    roomId: row.room_id,
    memberId: row.member_id,
    handle: row.handle,
  });
};
