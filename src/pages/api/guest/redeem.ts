import type { APIRoute } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { guestTransferRedeemSchema } from '../../../lib/schemas';
import {
  enforceTurnstile,
  getBearerToken,
  json,
  readJsonBody,
} from '../../../lib/server/api';
import { mapTransferError } from '../../../lib/server/transfer-errors';
import {
  getServiceClient,
  verifyAccessTokenUser,
  type AdoptGuestRow,
  type VerifiedUser,
} from '../../../lib/supabase/server';

export const prerender = false;

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

/**
 * POST /api/guest/redeem — tukar kode lanjut di perangkat baru.
 * Device baru sudah punya sesi anonim sendiri; kode hanya memindahkan
 * keanggotaan, bukan token sesi.
 */
export const POST: APIRoute = async ({ request, clientAddress }) => {
  const payload = await readJsonBody(request);
  if (payload === null) {
    return json({ error: 'INVALID_INPUT' }, 400);
  }

  const parsed = guestTransferRedeemSchema.safeParse(payload);
  if (!parsed.success) {
    return json({ error: 'INVALID_INPUT' }, 400);
  }

  const { code, turnstileToken } = parsed.data;

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
  if (!verified.isAnonymous) {
    return json({ error: 'NOT_ANONYMOUS' }, 403);
  }

  let service: SupabaseClient;
  try {
    service = getServiceClient();
  } catch {
    return json({ error: 'SERVER_ERROR' }, 500);
  }

  let rows: AdoptGuestRow[] | null;
  let rpcError: { message: string; details: string | null } | null;
  try {
    const result = await service.rpc('adopt_guest_identity', {
      p_code_hash: hashCode(code),
      p_new_user_id: verified.userId,
    });
    rows = Array.isArray(result.data) ? (result.data as AdoptGuestRow[]) : null;
    rpcError = result.error;
  } catch {
    return json({ error: 'SERVER_ERROR' }, 500);
  }

  if (rpcError) {
    const mapped = mapTransferError(rpcError.message);
    return json(mapped.body, mapped.status, mapped.headers);
  }

  if (!rows || rows.length === 0) {
    return json({ error: 'SERVER_ERROR' }, 500);
  }

  // Bersihkan identitas lama supaya sesinya tidak bisa dipakai lagi.
  // Kegagalan di sini tidak boleh membatalkan adopsi yang sudah commit.
  try {
    const { error } = await service.auth.admin.deleteUser(rows[0].old_user_id);
    if (error) console.error('deleteUser(guest transfer) failed', error.status);
  } catch {
    console.error('deleteUser(guest transfer) failed');
  }

  return json({
    rooms: rows.map((row) => ({
      slug: row.slug,
      handle: row.handle,
      status: row.status,
    })),
  });
};
