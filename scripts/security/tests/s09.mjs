import { checkRpcSuccess } from '../lib/test.mjs';

export default {
  id: 'S-09',
  title: 'Host melihat member tanpa user_id dan tidak bisa membaca member_identities',
  async run(ctx) {
    const room = await ctx.createRoom(ctx.hosts.a, { name: 'S09 identity separation' });
    try {
      await ctx.joinRoomOrThrow(room, ctx.guests.a);

      const members = await ctx.getMembersAsHost(ctx.hosts.a, room.id);
      ctx.check('Host bisa membaca room_members', members.length === 1, `${members.length} baris`);
      ctx.check(
        'room_members tidak memiliki user_id',
        members.every((row) => !Object.hasOwn(row, 'user_id')),
        members.map((row) => Object.keys(row).join(',')).join(' | '),
      );

      const listed = await ctx.listMembers(ctx.hosts.a, room.id);
      checkRpcSuccess(ctx, listed, 'list_members berhasil');
      const rows = Array.isArray(listed.data) ? listed.data : [];
      ctx.check(
        'list_members tidak memiliki user_id',
        rows.length > 0 && rows.every((row) => !Object.hasOwn(row, 'user_id')),
        rows.length ? Object.keys(rows[0]).join(',') : '0 baris',
      );

      const identities = await ctx.http.rest(
        `member_identities?select=*&room_id=eq.${encodeURIComponent(room.id)}`,
        { token: ctx.hosts.a.token },
      );
      ctx.check(
        'member_identities tidak terbaca Host',
        !identities.ok || (Array.isArray(identities.data) && identities.data.length === 0),
        `status=${identities.status} rows=${Array.isArray(identities.data) ? identities.data.length : 'n/a'}`,
      );
    } finally {
      await ctx.deleteRoom(room.id);
    }
  },
};
