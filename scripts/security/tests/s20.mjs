import { checkEmptyArray, checkRpcError, checkRpcSuccess } from '../lib/test.mjs';

export default {
  id: 'S-20',
  title: 'Akses room setelah delete_at ditolak RLS/RPC',
  async run(ctx) {
    const host = ctx.hosts.a;
    const room = await ctx.createRoom(host, { name: 'S20 after delete_at' });
    try {
      const member = await ctx.joinRoomOrThrow(room, ctx.guests.a);
      checkRpcSuccess(
        ctx,
        await ctx.hostSend(room, 'pesan sebelum delete_at'),
        'pesan fixture dibuat',
      );
      await ctx.ageRoom(room.id, { deleteAtPast: true });

      const hostRooms = await ctx.http.rest(
        `rooms?select=id,slug,name&id=eq.${encodeURIComponent(room.id)}`,
        { token: host.token },
      );
      checkEmptyArray(ctx, hostRooms, 'Host tidak melihat room setelah delete_at');

      const hostMembers = await ctx.http.rest(
        `room_members?select=*&room_id=eq.${encodeURIComponent(room.id)}`,
        { token: host.token },
      );
      checkEmptyArray(ctx, hostMembers, 'Host tidak melihat room_members setelah delete_at');

      const guestMembers = await ctx.http.rest(
        `room_members?select=*&room_id=eq.${encodeURIComponent(room.id)}`,
        { token: ctx.guests.a.token },
      );
      checkEmptyArray(
        ctx,
        guestMembers,
        'Guest tidak melihat baris member sendiri setelah delete_at',
      );

      checkEmptyArray(
        ctx,
        await ctx.getMessages(host.token, room.id),
        'Host tidak melihat messages setelah delete_at',
      );
      checkEmptyArray(
        ctx,
        await ctx.getMessages(ctx.guests.a.token, room.id),
        'Guest tidak melihat messages setelah delete_at',
      );

      checkRpcError(
        ctx,
        await ctx.listMembers(host, room.id),
        'NOT_FOUND',
        'list_members setelah delete_at = NOT_FOUND',
      );
      checkRpcError(
        ctx,
        await ctx.getPublicRoom(ctx.guests.a, room.slug),
        'NOT_FOUND',
        'get_room_public setelah delete_at = NOT_FOUND',
      );
      checkRpcError(
        ctx,
        await ctx.http.rpc(
          'export_messages',
          { p_room_id: room.id, p_after_id: 0, p_limit: 10 },
          { token: host.token },
        ),
        'NOT_FOUND',
        'export_messages setelah delete_at = NOT_FOUND',
      );

      const touch = await ctx.http.rpc(
        'touch_activity',
        { p_room_id: room.id },
        { token: ctx.guests.a.token },
      );
      ctx.check(
        'touch_activity setelah delete_at ditolak',
        Boolean(touch.error) || touch.data !== 'APPROVED',
        `status=${touch.status} data=${touch.data ?? 'null'} message=${touch.error?.message ?? 'none'}`,
      );
      checkRpcError(
        ctx,
        await ctx.http.rpc('leave_room', { p_room_id: room.id }, { token: ctx.guests.a.token }),
        'NOT_FOUND',
        'leave_room setelah delete_at = NOT_FOUND',
      );
      checkRpcError(
        ctx,
        await ctx.http.rpc('kick_member', { p_member_id: member.member_id }, { token: host.token }),
        'NOT_FOUND',
        'kick_member setelah delete_at = NOT_FOUND',
      );
      checkRpcError(
        ctx,
        await ctx.http.rpc('close_room', { p_room_id: room.id }, { token: host.token }),
        'NOT_FOUND',
        'close_room setelah delete_at = NOT_FOUND',
      );
    } finally {
      await ctx.deleteRoom(room.id);
    }
  },
};
