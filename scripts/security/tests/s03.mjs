import { checkDenied } from '../lib/test.mjs';

export default {
  id: 'S-03',
  title: 'Host tidak bisa mengubah tier sendiri',
  async run(ctx) {
    const before = await ctx.getProfile(ctx.hosts.a);
    ctx.check(
      'profil Host tersedia',
      Boolean(before),
      before ? `tier=${before.tier}` : 'tidak ada baris',
    );
    if (!before) return;

    const desired = before.tier === 'premium' ? 'free' : 'premium';
    const result = await ctx.http.rest(
      `profiles?user_id=eq.${encodeURIComponent(ctx.hosts.a.id)}`,
      {
        method: 'PATCH',
        token: ctx.hosts.a.token,
        body: { tier: desired },
        prefer: 'return=representation',
      },
    );
    checkDenied(ctx, result, 'PATCH /rest/v1/profiles ditolak');

    const after = await ctx.getProfile(ctx.hosts.a);
    ctx.check(
      'tier tidak berubah',
      after?.tier === before.tier,
      `${before.tier} -> ${after?.tier}`,
    );
  },
};
