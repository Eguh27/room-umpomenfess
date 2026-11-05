export default {
  id: 'S-13',
  title: 'Dua tab Host bersamaan saat kuota 2/3: tepat satu room ke-3 berhasil',
  async run(ctx) {
    const host = ctx.hosts.quota;
    try {
      await ctx.createRoom(host, { name: 'S13 baseline 1' });
      await ctx.createRoom(host, { name: 'S13 baseline 2' });

      const makeArgs = (name) => ({
        p_name: name,
        p_max_guests: 2,
        p_approval_required: false,
        p_idle_timeout_minutes: 30,
        p_typing_enabled: false,
      });
      const [first, second] = await Promise.all([
        ctx.http.rpc('create_room', makeArgs('S13 concurrent A'), { token: host.token }),
        ctx.http.rpc('create_room', makeArgs('S13 concurrent B'), { token: host.token }),
      ]);

      const successes = [first, second].filter((result) => !result.error && result.ok);
      const quotaErrors = [first, second].filter(
        (result) => result.error?.message === 'QUOTA_REACHED',
      );
      ctx.check(
        'tepat satu create_room berhasil',
        successes.length === 1,
        `${successes.length} sukses`,
      );
      ctx.check(
        'tepat satu create_room kena QUOTA_REACHED',
        quotaErrors.length === 1,
        `${quotaErrors.length} QUOTA_REACHED`,
      );

      const active = await ctx.countActiveRooms(host.id);
      ctx.check('jumlah room aktif tetap 3', active === 3, `${active} room aktif`);
    } finally {
      await ctx.deleteRoomsByHost(host.id);
    }
  },
};
