import type { JoinOutcome } from './joinTypes';
import { getBrowserClient } from '../lib/supabase/browser';

/**
 * Alur masuk Guest (TASK bagian 11): pastikan sesi anonim Supabase,
 * lalu kirim POST /api/rooms/join dengan Bearer access token.
 * Turnstile diperiksa server; token di sini hanya dibawa.
 * Pada UNAUTHORIZED (sesi basi) hapus sesi lama sekali saja — token Turnstile
 * sekali pakai, jadi user mengirim ulang dengan widget baru.
 */
export async function joinRoom(
  slug: string,
  password: string,
  turnstileToken: string,
): Promise<JoinOutcome> {
  const outcome = await attemptJoin(slug, password, turnstileToken);
  if (!outcome.ok && outcome.code === 'UNAUTHORIZED') {
    try {
      await getBrowserClient().auth.signOut();
    } catch {
      // Tidak fatal: signOut sudah bersih (session hilang) atau gagal.
    }
  }
  return outcome;
}

async function attemptJoin(
  slug: string,
  password: string,
  turnstileToken: string,
): Promise<JoinOutcome> {
  const accessToken = await accessTokenFor(turnstileToken);
  if (!accessToken.ok) return accessToken;

  let res: Response;
  try {
    res = await fetch('/api/rooms/join', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${accessToken.token}`,
      },
      body: JSON.stringify({ slug, password, turnstileToken }),
    });
  } catch {
    return { ok: false, code: 'NETWORK' };
  }

  return readResponseBody(res);
}

type AccessToken = { ok: true; token: string } | Extract<JoinOutcome, { ok: false }>;

/** Ambil access token: pakai sesi yang ada, atau buat sesi anonim baru. */
async function accessTokenFor(turnstileToken: string): Promise<AccessToken> {
  const client = getBrowserClient();
  const { data: current } = await client.auth.getSession();
  const existing = current.session;
  if (existing) return { ok: true, token: existing.access_token };

  const { data, error } = await client.auth.signInAnonymously({
    options: { captchaToken: turnstileToken },
  });
  if (error || !data.session) {
    const message = error?.message ?? '';
    return {
      ok: false,
      code: message.includes('Anonymous sign-ins') ? 'ANON_DISABLED' : 'SESSION_INIT',
    };
  }
  return { ok: true, token: data.session.access_token };
}

/** Baca respons API: sukses berbentuk {status, roomId, memberId, displayName}. */
async function readResponseBody(res: Response): Promise<JoinOutcome> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, code: 'SERVER_ERROR' };
  }
  const record = (body ?? {}) as Record<string, unknown>;

  if (!res.ok) {
    return {
      ok: false,
      code: typeof record.error === 'string' ? record.error : 'SERVER_ERROR',
      retryAfter:
        typeof record.retryAfter === 'number' && record.retryAfter > 0
          ? Math.ceil(record.retryAfter)
          : undefined,
    };
  }

  if (
    isJoinStatus(record.status) &&
    typeof record.roomId === 'string' &&
    typeof record.memberId === 'string' &&
    typeof record.displayName === 'string'
  ) {
    return {
      ok: true,
      status: record.status,
      roomId: record.roomId,
      memberId: record.memberId,
      displayName: record.displayName,
    };
  }
  return { ok: false, code: 'SERVER_ERROR' };
}

function isJoinStatus(value: unknown): value is 'APPROVED' | 'PENDING' {
  return value === 'APPROVED' || value === 'PENDING';
}
