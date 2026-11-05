import { sleep, watchRoomMessages } from '../lib/realtime.mjs';
import { checkEmptyArray, checkRpcError, checkRpcSuccess } from '../lib/test.mjs';

export default {
  id: 'S-06',
  title: 'Guest KICKED/IDLE/LEFT tidak bisa kirim atau menerima pesan',
  async run(ctx) {
    const room = await ctx.createRoom(ctx.hosts.a, { name: 'S06 terminal status', maxGuests: 3 });
    const watchers = [];
    try {
      const memberA = await ctx.joinRoomOrThrow(room, ctx.guests.a);
      const memberB = await ctx.joinRoomOrThrow(room, ctx.guests.b);
      await ctx.joinRoomOrThrow(room, ctx.guests.c);

      for (const guest of [ctx.guests.a, ctx.guests.b, ctx.guests.c]) {
        watchers.push(
          await watchRoomMessages({ config: ctx.config, session: guest, roomId: room.id }),
        );
      }

      checkRpcSuccess(
        ctx,
        await ctx.http.rpc(
          'kick_member',
          { p_member_id: memberA.member_id },
          { token: ctx.hosts.a.token },
        ),
        'Guest A di-kick',
      );
      await ctx.patchMember(memberB.member_id, { status: 'IDLE' });
      checkRpcSuccess(
        ctx,
        await ctx.http.rpc('leave_room', { p_room_id: room.id }, { token: ctx.guests.c.token }),
        'Guest C leave_room',
      );

      checkRpcSuccess(
        ctx,
        await ctx.hostSend(room, 'pesan setelah Guest terminal'),
        'Host mengirim pesan setelah status terminal',
      );
      await sleep(1_800);

      const labels = ['A (KICKED)', 'B (IDLE)', 'C (LEFT)'];
      for (let i = 0; i < watchers.length; i += 1) {
        ctx.check(
          `Realtime ${labels[i]} tidak menerima event`,
          watchers[i].events.length === 0,
          `${watchers[i].events.length} event`,
        );
      }

      for (const [label, guest] of [
        ['A', ctx.guests.a],
        ['B', ctx.guests.b],
        ['C', ctx.guests.c],
      ]) {
        const read = await ctx.getMessages(guest.token, room.id);
        checkEmptyArray(ctx, read, `REST messages kosong untuk Guest ${label}`);
        const send = await ctx.http.rpc(
          'send_message',
          {
            p_room_id: room.id,
            p_content: `pesan dari Guest ${label}`,
            p_client_msg_id: ctx.newClientMsgId(),
          },
          { token: guest.token },
        );
        checkRpcError(ctx, send, 'NOT_MEMBER', `send_message Guest ${label} ditolak`);
      }
    } finally {
      for (const watcher of watchers) await watcher.close();
      await ctx.deleteRoom(room.id);
    }
  },
};
