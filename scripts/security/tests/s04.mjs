import { checkRpcSuccess } from '../lib/test.mjs';

export default {
  id: 'S-04',
  title: 'Sender pesan tidak bisa dipalsukan lewat parameter RPC',
  async run(ctx) {
    const room = await ctx.createRoom(ctx.hosts.a, { name: 'S04 sender spoof' });
    try {
      const member = await ctx.joinRoomOrThrow(room, ctx.guests.a);

      const extraSenderName = await ctx.http.rpc(
        'send_message',
        {
          p_room_id: room.id,
          p_content: 'spoof sender_name',
          p_client_msg_id: ctx.newClientMsgId(),
          sender_name: 'Host',
        },
        { token: ctx.guests.a.token },
      );
      ctx.check(
        'parameter sender_name ditolak',
        !extraSenderName.ok,
        `status=${extraSenderName.status} message=${extraSenderName.error?.message ?? 'none'}`,
      );

      const extraSenderType = await ctx.http.rpc(
        'send_message',
        {
          p_room_id: room.id,
          p_content: 'spoof sender_type',
          p_client_msg_id: ctx.newClientMsgId(),
          sender_type: 'HOST',
        },
        { token: ctx.guests.a.token },
      );
      ctx.check(
        'parameter sender_type ditolak',
        !extraSenderType.ok,
        `status=${extraSenderType.status} message=${extraSenderType.error?.message ?? 'none'}`,
      );

      const before = await ctx.getMessages(ctx.guests.a.token, room.id);
      ctx.check(
        'tidak ada pesan dari percobaan parameter palsu',
        before.ok && Array.isArray(before.data) && before.data.length === 0,
        `status=${before.status} rows=${Array.isArray(before.data) ? before.data.length : 'n/a'}`,
      );

      const sent = await ctx.guestSend(ctx.guests.a, room, 'pesan normal S-04');
      checkRpcSuccess(ctx, sent, 'send_message normal berhasil');
      const row = ctx.firstRow(sent.data);
      ctx.check('sender_type dari DB = GUEST', row?.sender_type === 'GUEST', row?.sender_type);
      ctx.check(
        'sender_name dari DB = display_name Guest',
        row?.sender_name === member.display_name && row.sender_name !== 'Host',
        `${row?.sender_name} vs ${member.display_name}`,
      );
      ctx.check('member_id dari DB cocok', row?.member_id === member.member_id, row?.member_id);
    } finally {
      await ctx.deleteRoom(room.id);
    }
  },
};
