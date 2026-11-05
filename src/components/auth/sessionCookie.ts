import type { Session } from '@supabase/supabase-js';

/**
 * Cermin access token untuk guard server-side di /admin/*.
 *
 * Supabase browser client menyimpan sesi di localStorage, yang tidak bisa
 * dibaca Astro SSR. Cookie ini bukan sumber kebenaran: server tetap memanggil
 * `getUser(token)` sebelum mempercayainya. Isinya sengaja hanya access token
 * (bukan refresh token) dan tidak pernah dicetak ke log.
 */
export const SESSION_COOKIE = 'uf_room_session';

function secureSuffix(): string {
  return window.location.protocol === 'https:' ? '; Secure' : '';
}

export function syncSessionCookie(session: Session | null): void {
  if (typeof document === 'undefined') return;

  if (!session) {
    document.cookie = `${SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secureSuffix()}`;
    return;
  }

  const maxAge = Math.max(60, Math.min(session.expires_in || 3600, 3600));
  document.cookie = `${SESSION_COOKIE}=${encodeURIComponent(
    session.access_token,
  )}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secureSuffix()}`;
}

export function clearSessionCookie(): void {
  syncSessionCookie(null);
}
