import { checkRpcError } from '../lib/test.mjs';

export default {
  id: 'S-07',
  title: 'JWT anonim ditolak semua RPC Host',
  async run(ctx) {
    const room = await ctx.createRoom(ctx.hosts.a, { name: 'S07 anon host rpc' });
    try {
      const calls = [
        [
          'create_room',
          {
            p_name: 'S07 anon',
            p_max_guests: 2,
            p_approval_required: false,
            p_idle_timeout_minutes: 30,
            p_typing_enabled: false,
          },
        ],
        ['regenerate_password', { p_room_id: room.id }],
        ['update_room_settings', { p_room_id: room.id }],
        ['close_room', { p_room_id: room.id }],
        ['decide_member', { p_member_id: ctx.newClientMsgId(), p_decision: 'APPROVE' }],
        ['kick_member', { p_member_id: ctx.newClientMsgId() }],
        ['list_members', { p_room_id: room.id }],
        ['list_hosted_rooms', {}],
        ['export_messages', { p_room_id: room.id, p_after_id: 0, p_limit: 10 }],
      ];

      for (const [name, args] of calls) {
        const result = await ctx.http.rpc(name, args, { token: ctx.guests.a.token });
        checkRpcError(ctx, result, 'NOT_HOST', `${name} menolak JWT anonim`);
      }
    } finally {
      await ctx.deleteRoom(room.id);
    }
  },
};
