export default {
  id: 'S-10',
  title: 'Host tidak bisa membaca password_hash',
  async run(ctx) {
    const room = await ctx.createRoom(ctx.hosts.a, { name: 'S10 password hash' });
    try {
      const direct = await ctx.http.rest(
        `rooms?select=password_hash&id=eq.${encodeURIComponent(room.id)}`,
        { token: ctx.hosts.a.token },
      );
      ctx.check(
        'SELECT password_hash ditolak',
        !direct.ok && (direct.status === 401 || direct.status === 403),
        `status=${direct.status} message=${direct.error?.message ?? 'none'}`,
      );

      const allowed = await ctx.getRoomHost(ctx.hosts.a, room.id);
      ctx.check(
        'baris room yang diizinkan tidak berisi password_hash',
        allowed && !Object.hasOwn(allowed, 'password_hash'),
        allowed ? Object.keys(allowed).join(',') : 'tidak ada baris',
      );
    } finally {
      await ctx.deleteRoom(room.id);
    }
  },
};
