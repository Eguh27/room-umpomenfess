import { checkDenied } from '../lib/test.mjs';

export default {
  id: 'S-02',
  title: 'Host tidak bisa INSERT rooms langsung',
  async run(ctx) {
    const slug = `t61s02${ctx.newIpHash().slice(0, 10)}`;
    let created = null;
    try {
      const result = await ctx.http.rest('rooms', {
        method: 'POST',
        token: ctx.hosts.a.token,
        body: {
          slug,
          host_id: ctx.hosts.a.id,
          name: 'S02 direct insert',
          password_hash: 'not-a-real-hash',
          approval_required: false,
          max_guests: 2,
          idle_timeout_minutes: 30,
          typing_enabled: false,
          expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
          delete_at: new Date(Date.now() + 22 * 86_400_000).toISOString(),
        },
        prefer: 'return=representation',
      });
      checkDenied(ctx, result, 'POST /rest/v1/rooms ditolak');
      created = await ctx.getRoomService(slug);
      ctx.check(
        'tidak ada room baru',
        created === null,
        created ? `room ${created.id} dibuat` : '0 baris',
      );
    } finally {
      if (created?.id) await ctx.deleteRoom(created.id);
    }
  },
};
