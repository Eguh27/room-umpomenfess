import { checkRpcError, checkRpcSuccess } from '../lib/test.mjs';

export default {
  id: 'S-11',
  title: 'Enam percobaan password salah dari satu ip_hash terkunci',
  async run(ctx) {
    const room = await ctx.createRoom(ctx.hosts.a, { name: 'S11 lockout' });
    const ipHash = ctx.newIpHash();
    try {
      for (let i = 1; i <= 5; i += 1) {
        const attempt = await ctx.joinRoom(room, ctx.guests.a, {
          password: `SALAH-${i}`,
          ipHash,
        });
        checkRpcError(ctx, attempt, 'WRONG_PASSWORD', `percobaan ${i} = WRONG_PASSWORD`);
        checkRpcSuccess(
          ctx,
          await ctx.recordFailure(room, ipHash),
          `record_join_failure percobaan ${i}`,
        );
      }

      const sixth = await ctx.joinRoom(room, ctx.guests.a, {
        password: 'SALAH-6',
        ipHash,
      });
      checkRpcError(ctx, sixth, 'LOCKED', 'percobaan ke-6 = LOCKED');

      // S-60-08: pencatatan gagal terpisah. Enam request paralel dapat
      // semuanya melihat hitungan lama sebelum satu pun kegagalan tercatat.
      const parallelRoom = await ctx.createRoom(ctx.hosts.a, { name: 'S11 parallel lockout' });
      const parallelIpHash = ctx.newIpHash();
      try {
        const parallel = await Promise.all(
          Array.from({ length: 6 }, (_, index) =>
            ctx.joinRoom(parallelRoom, ctx.guests.a, {
              password: `PARALEL-${index + 1}`,
              ipHash: parallelIpHash,
            }),
          ),
        );
        const wrong = parallel.filter((result) => result.error?.message === 'WRONG_PASSWORD');
        const locked = parallel.filter((result) => result.error?.message === 'LOCKED');
        ctx.check(
          'tidak lebih dari 5 percobaan paralel mendapat WRONG_PASSWORD',
          wrong.length <= 5,
          `${wrong.length} WRONG_PASSWORD, ${locked.length} LOCKED`,
        );

        for (let index = 0; index < wrong.length; index += 1) {
          checkRpcSuccess(
            ctx,
            await ctx.recordFailure(parallelRoom, parallelIpHash),
            'record_join_failure untuk percobaan paralel',
          );
        }
        const seventh = await ctx.joinRoom(parallelRoom, ctx.guests.a, {
          password: 'PARALEL-7',
          ipHash: parallelIpHash,
        });
        checkRpcError(ctx, seventh, 'LOCKED', 'percobaan ke-7 setelah burst paralel = LOCKED');
      } finally {
        await ctx.deleteRoom(parallelRoom.id);
      }
    } finally {
      await ctx.deleteRoom(room.id);
    }
  },
};
