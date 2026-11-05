import { checkDenied } from '../lib/test.mjs';

export default {
  id: 'S-01',
  title: 'Host tidak bisa PATCH rooms langsung',
  async run(ctx) {
    const room = await ctx.createRoom(ctx.hosts.a, { name: 'S01 direct patch' });
    try {
      const before = await ctx.getRoomHost(ctx.hosts.a, room.id);
      const result = await ctx.http.rest(`rooms?id=eq.${encodeURIComponent(room.id)}`, {
        method: 'PATCH',
        token: ctx.hosts.a.token,
        body: {
          max_guests: before.max_guests + 1,
          expires_at: new Date(Date.now() + 86_400_000).toISOString(),
          closed_at: new Date().toISOString(),
        },
        prefer: 'return=representation',
      });
      checkDenied(ctx, result, 'PATCH /rest/v1/rooms ditolak');
      const after = await ctx.getRoomHost(ctx.hosts.a, room.id);
      ctx.check(
        'max_guests tidak berubah',
        after.max_guests === before.max_guests,
        `${before.max_guests} -> ${after.max_guests}`,
      );
      ctx.check(
        'expires_at tidak berubah',
        after.expires_at === before.expires_at,
        `${before.expires_at} -> ${after.expires_at}`,
      );
      ctx.check(
        'closed_at tidak berubah',
        after.closed_at === before.closed_at,
        `${before.closed_at} -> ${after.closed_at}`,
      );
    } finally {
      await ctx.deleteRoom(room.id);
    }
  },
};
