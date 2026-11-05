import type { APIRoute } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'node:crypto';
import { getBearerToken, json } from '../../../lib/server/api';
import { mapTransferError } from '../../../lib/server/transfer-errors';
import {
  getServiceClient,
  verifyAccessTokenUser,
  type VerifiedUser,
} from '../../../lib/supabase/server';

export const prerender = false;

/** 32 byte acak -> base64url (43 karakter). Server yang memegang kode mentah. */
const CODE_BYTES = 32;
const CODE_TTL_SECONDS = 24 * 60 * 60;

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

/**
 * POST /api/guest/transfer — terbitkan kode lanjut untuk Guest anonim.
 * Hanya setelah join APPROVED; kode lama otomatis dicabut.
 */
export const POST: APIRoute = async ({ request }) => {
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

  const code = randomBytes(CODE_BYTES).toString('base64url');
  const codeHash = hashCode(code);

  let data: unknown;
  let rpcError: { message: string; details: string | null } | null;
  try {
    const result = await service.rpc('issue_guest_transfer_code', {
      p_user_id: verified.userId,
      p_code_hash: codeHash,
      p_ttl_seconds: CODE_TTL_SECONDS,
    });
    data = result.data;
    rpcError = result.error;
  } catch {
    return json({ error: 'SERVER_ERROR' }, 500);
  }

  if (rpcError) {
    const mapped = mapTransferError(rpcError.message);
    return json(mapped.body, mapped.status, mapped.headers);
  }

  if (typeof data !== 'string' || data.length === 0) {
    return json({ error: 'SERVER_ERROR' }, 500);
  }

  // Kode mentah hanya muncul di respons ini; tidak pernah dicatat.
  return json({ code, expiresAt: data });
};
