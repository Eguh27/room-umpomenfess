import { TURNSTILE_SECRET_KEY } from 'astro:env/server';
import { verifyTurnstile } from './turnstile';

/** Respons JSON dengan header default endpoint API (no-store). */
export function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

/** Ambil access token dari header `Authorization: Bearer <token>`. */
export function getBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token || null;
}

/**
 * Wajibkan Turnstile untuk endpoint yang menulis ke database.
 * Kembalikan `null` bila lolos, atau Response siap kirim bila gagal.
 * Secret kosong hanya ditoleransi di development (build produksi selalu 500).
 */
export async function enforceTurnstile(
  token: string,
  clientAddress: string,
): Promise<Response | null> {
  if (TURNSTILE_SECRET_KEY) {
    let ok = false;
    try {
      ok = await verifyTurnstile(token, clientAddress);
    } catch {
      ok = false;
    }
    return ok ? null : json({ error: 'TURNSTILE_FAILED' }, 403);
  }
  // Jangan pernah membuka endpoint tanpa Turnstile di production.
  return import.meta.env.DEV ? null : json({ error: 'SERVER_ERROR' }, 500);
}

/** Baca body JSON; kembalikan `null` bila bukan JSON valid. */
export async function readJsonBody(request: Request): Promise<unknown | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
