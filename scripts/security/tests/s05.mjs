import { sleep, watchRoomMessages } from '../lib/realtime.mjs';
import { checkEmptyArray, checkRpcError, checkRpcSuccess } from '../lib/test.mjs';

export default {
  id: 'S-05',
  title: 'Guest room A tidak bisa membaca pesan room B (REST + Realtime)',
  async run(ctx) {
    const roomA = await ctx.createRoom(ctx.hosts.a, { name: 'S05 room A' });
    const roomB = await ctx.createRoom(ctx.hosts.b, { name: 'S05 room B' });
    let watcher = null;
    try {
      await ctx.joinRoomOrThrow(roomA, ctx.guests.a);
      checkRpcSuccess(
        ctx,
        await ctx.hostSend(roomB, 'pesan room B sebelum serangan'),
        'Host B mengirim pesan ke room B',
      );

      const restRead = await ctx.getMessages(ctx.guests.a.token, roomB.id);
      checkEmptyArray(ctx, restRead, 'REST messages room B kosong untuk Guest room A');

      const rpcRead = await ctx.http.rpc(
        'list_messages',
        { p_room_id: roomB.id },
        { token: ctx.guests.a.token },
      );
      checkRpcError(ctx, rpcRead, 'NOT_MEMBER', 'list_messages room B ditolak');

      watcher = await watchRoomMessages({
        config: ctx.config,
        session: ctx.guests.a,
        roomId: roomB.id,
      });
      checkRpcSuccess(
        ctx,
        await ctx.hostSend(roomB, 'pesan room B saat Realtime aktif'),
        'Host B mengirim pesan kedua',
      );
      await sleep(1_800);
      ctx.check(
        'Realtime room B tidak mengirim event ke Guest room A',
        watcher.events.length === 0,
        `${watcher.events.length} event diterima`,
      );
    } finally {
      if (watcher) await watcher.close();
      await ctx.deleteRoom(roomA.id);
      await ctx.deleteRoom(roomB.id);
    }
  },
};
