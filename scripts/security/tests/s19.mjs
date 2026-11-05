import { checkRpcError, checkRpcSuccess } from '../lib/test.mjs';

export default {
  id: 'S-19',
  title: 'Pesan setelah closed_at/expires_at = ROOM_CLOSED',
  async run(ctx) {
    const host = ctx.hosts.a;
    const closedRoom = await ctx.createRoom(host, { name: 'S19 closed' });
    const expiredRoom = await ctx.createRoom(host, { name: 'S19 expired' });

    try {
      await ctx.joinRoomOrThrow(closedRoom, ctx.guests.a);
      checkRpcSuccess(
        ctx,
        await ctx.http.rpc('close_room', { p_room_id: closedRoom.id }, { token: host.token }),
        'Host menutup room',
      );

      checkRpcError(
        ctx,
        await ctx.guestSend(ctx.guests.a, closedRoom, 'pesan setelah closed'),
        'ROOM_CLOSED',
        'Guest send_message di room closed = ROOM_CLOSED',
      );
      checkRpcError(
        ctx,
        await ctx.http.rpc(
          'list_messages',
          { p_room_id: closedRoom.id },
          { token: ctx.guests.a.token },
        ),
        'ROOM_CLOSED',
        'Guest list_messages di room closed = ROOM_CLOSED',
      );
      checkRpcError(
        ctx,
        await ctx.hostSend(closedRoom, 'Host setelah closed'),
        'ROOM_CLOSED',
        'Host send_message di room closed = ROOM_CLOSED',
      );

      await ctx.joinRoomOrThrow(expiredRoom, ctx.guests.a);
      await ctx.ageRoom(expiredRoom.id, { deleteAtPast: false });

      checkRpcError(
        ctx,
        await ctx.guestSend(ctx.guests.a, expiredRoom, 'pesan setelah expired'),
        'ROOM_CLOSED',
        'Guest send_message di room expired = ROOM_CLOSED',
      );
      checkRpcError(
        ctx,
        await ctx.http.rpc(
          'list_messages',
          { p_room_id: expiredRoom.id },
          { token: ctx.guests.a.token },
        ),
        'ROOM_CLOSED',
        'Guest list_messages di room expired = ROOM_CLOSED',
      );
      checkRpcError(
        ctx,
        await ctx.hostSend(expiredRoom, 'Host setelah expired'),
        'ROOM_CLOSED',
        'Host send_message di room expired = ROOM_CLOSED',
      );
    } finally {
      await ctx.deleteRoom(closedRoom.id);
      await ctx.deleteRoom(expiredRoom.id);
    }
  },
};
