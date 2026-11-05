import { checkRpcError, checkRpcSuccess } from '../lib/test.mjs';

export default {
  id: 'S-12',
  title: 'Dua IPv6 dalam satu /64 dihitung satu klien',
  async run(ctx) {
    if (!ctx.config.ipHashSalt) throw new Error('IP_HASH_SALT kosong; S-12 tidak bisa diuji');
    const { hashIp } = await import(new URL('../../../src/lib/ip.ts', import.meta.url));
    const ip1 = '2001:db8:1:2::1';
    const ip2 = '2001:db8:1:2:ffff::9';
    const hash1 = hashIp(ip1, ctx.config.ipHashSalt);
    const hash2 = hashIp(ip2, ctx.config.ipHashSalt);
    ctx.check('hash IPv6 /64 sama', hash1 === hash2, hash1 === hash2 ? 'sama' : 'berbeda');

    // S-60-19: bentuk IPv4-mapped hex dan IPv4-compatible harus mengikuti IPv4.
    const plainIpv4 = hashIp('203.0.113.7', ctx.config.ipHashSalt);
    const mappedHex = hashIp('::ffff:cb00:7107', ctx.config.ipHashSalt);
    ctx.check(
      'IPv4-mapped hex dinormalisasi ke IPv4',
      mappedHex === plainIpv4,
      mappedHex === plainIpv4 ? 'sama' : 'berbeda',
    );
    const compatibleIpv4 = hashIp('192.0.2.1', ctx.config.ipHashSalt);
    const compatibleIpv6 = hashIp('::192.0.2.1', ctx.config.ipHashSalt);
    ctx.check(
      'IPv4-compatible IPv6 dinormalisasi ke IPv4',
      compatibleIpv6 === compatibleIpv4,
      compatibleIpv6 === compatibleIpv4 ? 'sama' : 'berbeda',
    );

    const room = await ctx.createRoom(ctx.hosts.a, { name: 'S12 ipv6 lockout' });
    try {
      for (let i = 1; i <= 5; i += 1) {
        const attempt = await ctx.joinRoom(room, ctx.guests.a, {
          password: `SALAH-IP-${i}`,
          ipHash: hash1,
        });
        checkRpcError(ctx, attempt, 'WRONG_PASSWORD', `percobaan ${i} dari /64 pertama`);
        checkRpcSuccess(
          ctx,
          await ctx.recordFailure(room, hash1),
          `record_join_failure ${i} dari /64 pertama`,
        );
      }

      const sixth = await ctx.joinRoom(room, ctx.guests.a, {
        password: 'SALAH-IP-6',
        ipHash: hash2,
      });
      checkRpcError(
        ctx,
        sixth,
        'LOCKED',
        'percobaan ke-6 dari alamat lain di /64 yang sama = LOCKED',
      );
    } finally {
      await ctx.deleteRoom(room.id);
    }
  },
};
