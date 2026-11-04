import type { APIRoute } from 'astro';
import { reportRequestSchema } from '../../../lib/schemas';
import { mapReportError } from '../../../lib/server/join-errors';
import {
  enforceTurnstile,
  getBearerToken,
  json,
  readJsonBody,
} from '../../../lib/server/api';
import { getUserClient, verifyAccessTokenUser } from '../../../lib/supabase/server';

export const prerender = false;

/**
 * POST /api/rooms/report — kontrak TASK.md bagian 7.
 * Identitas pelapor diambil dari JWT (auth.uid() di dalam report_room);
 * request tidak pernah memakai service_role. Alasan laporan sudah dibatasi
 * zod, dan isi pesan/password tidak pernah masuk log.
 */
export const POST: APIRoute = async ({ request, clientAddress }) => {
  const payload = await readJsonBody(request);
  if (payload === null) {
    return json({ error: 'INVALID_INPUT' }, 400);
  }

  const parsed = reportRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return json({ error: 'INVALID_INPUT' }, 400);
  }

  const { roomId, reason, turnstileToken } = parsed.data;

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

  let verified: boolean;
  try {
    verified = (await verifyAccessTokenUser(accessToken)) !== null;
  } catch {
    return json({ error: 'SERVER_ERROR' }, 500);
  }
  if (!verified) {
    return json({ error: 'UNAUTHORIZED' }, 401);
  }

  let rpcError: string | null;
  try {
    // report_room mengenali pelapor dari auth.uid() pada JWT yang dikirim.
    const { error } = await getUserClient(accessToken).rpc('report_room', {
      p_room_id: roomId,
      p_reason: reason,
    });
    rpcError = error?.message ?? null;
  } catch {
    return json({ error: 'SERVER_ERROR' }, 500);
  }

  if (rpcError) {
    const mapped = mapReportError(rpcError);
    return json(mapped.body, mapped.status);
  }

  return json({ ok: true });
};
