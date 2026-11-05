export default {
  id: 'S-08',
  title: 'authenticated/anon tidak bisa memanggil join_room',
  async run(ctx) {
    const room = await ctx.createRoom(ctx.hosts.a, { name: 'S08 join_room grant' });
    try {
      const args = {
        p_user_id: ctx.guests.a.id,
        p_slug: room.slug,
        p_password: room.password,
        p_ip_hash: ctx.newIpHash(),
      };

      const asGuest = await ctx.http.rpc('join_room', args, { token: ctx.guests.a.token });
      ctx.check(
        'JWT authenticated ditolak',
        asGuest.status === 403 &&
          asGuest.error?.code === '42501' &&
          /permission denied/i.test(asGuest.error?.message ?? ''),
        `status=${asGuest.status} code=${asGuest.error?.code ?? 'none'}`,
      );

      const asAnon = await ctx.http.rpc('join_room', args);
      ctx.check(
        'anon key tanpa JWT ditolak',
        (asAnon.status === 401 || asAnon.status === 403) &&
          asAnon.error?.code === '42501' &&
          /permission denied/i.test(asAnon.error?.message ?? ''),
        `status=${asAnon.status} code=${asAnon.error?.code ?? 'none'}`,
      );
    } finally {
      await ctx.deleteRoom(room.id);
    }
  },
};
