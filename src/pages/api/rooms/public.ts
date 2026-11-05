import type { APIRoute } from 'astro';
import { publicRoomsQuerySchema } from '../../../lib/schemas';
import { mapPublicRoomsError } from '../../../lib/server/join-errors';
import { json } from '../../../lib/server/api';
import { getAnonClient } from '../../../lib/supabase/server';

export const prerender = false;

/**
 * GET /api/rooms/public — FYP (kontrak TASK.md bagian 7).
 * Hanya metadata room publik dari `list_public_rooms` (whitelist kolom RPC);
 * isi chat tidak pernah lewat sini. Tanpa JWT; client anonim cukup karena
 * RPC ini di-grant ke anon+authenticated. Cache singkat di CDN Vercel.
 */
export const GET: APIRoute = async ({ url }) => {
  const params = Object.fromEntries(url.searchParams.entries());
  const parsed = publicRoomsQuerySchema.safeParse(params);
  if (!parsed.success) {
    return json({ error: 'INVALID_INPUT' }, 400);
  }

  const { sort, category, q, cursor, limit } = parsed.data;

  let data: unknown;
  let rpcError: string | null;
  try {
    const result = await getAnonClient().rpc('list_public_rooms', {
      p_sort: sort,
      p_category: category,
      p_q: q,
      p_cursor: cursor,
      p_limit: limit,
    });
    data = result.data;
    rpcError = result.error?.message ?? null;
  } catch {
    return json({ error: 'SERVER_ERROR' }, 500);
  }

  if (rpcError) {
    const mapped = mapPublicRoomsError(rpcError);
    return json(mapped.body, mapped.status);
  }

  // RPC SETOF selalu array; bentuk kolom sudah dijamin whitelist RPC.
  const rooms = Array.isArray(data) ? data : [];
  // Halaman penuh → kirim kursor untuk halaman berikutnya; habis → null.
  const nextCursor = rooms.length === limit ? rooms[rooms.length - 1].slug : null;

  return json(
    { rooms, nextCursor },
    200,
    { 'cache-control': 'public, s-maxage=30, stale-while-revalidate=60' },
  );
};
