import { checkRpcError, checkRpcSuccess } from '../lib/test.mjs';

export default {
  id: 'S-14',
  title: 'Kapasitas Guest ke-N+1 dan dua approve bersamaan',
  async run(ctx) {
    const host = ctx.hosts.b;
    const capacityRoom = await ctx.createRoom(host, {
      name: 'S14 capacity',
      maxGuests: 2,
      approvalRequired: false,
    });
    const approvalRoom = await ctx.createRoom(host, {
      name: 'S14 approval race',
      maxGuests: 2,
      approvalRequired: true,
    });

    try {
      // Bagian 1: kursi penuh tanpa approval.
      const capA = await ctx.joinRoomOrThrow(capacityRoom, ctx.guests.a);
      const capB = await ctx.joinRoomOrThrow(capacityRoom, ctx.guests.b);
      ctx.check('Guest A mendapat kursi', capA.status === 'APPROVED', capA.status);
      ctx.check('Guest B mendapat kursi', capB.status === 'APPROVED', capB.status);
      const capC = await ctx.joinRoom(capacityRoom, ctx.guests.c);
      checkRpcError(ctx, capC, 'ROOM_FULL', 'Guest C saat kursi penuh = ROOM_FULL');

      const capMembers = await ctx.listMembers(host, capacityRoom.id);
      checkRpcSuccess(ctx, capMembers, 'Host membaca member room kapasitas');
      const capApproved = (capMembers.data ?? []).filter((row) => row.status === 'APPROVED');
      ctx.check(
        'room kapasitas berisi tepat 2 approved',
        capApproved.length === 2,
        `${capApproved.length} approved`,
      );

      // Bagian 2: dua approve bersamaan untuk satu kursi tersisa.
      const pendingA = await ctx.joinRoomOrThrow(approvalRoom, ctx.guests.a);
      const pendingB = await ctx.joinRoomOrThrow(approvalRoom, ctx.guests.b);
      const pendingC = await ctx.joinRoomOrThrow(approvalRoom, ctx.guests.c);
      const pendingD = await ctx.joinRoomOrThrow(approvalRoom, ctx.guests.d);
      for (const [label, member] of [
        ['A', pendingA],
        ['B', pendingB],
        ['C', pendingC],
        ['D', pendingD],
      ]) {
        ctx.check(`Guest ${label} PENDING`, member.status === 'PENDING', member.status);
      }

      const approvedA = await ctx.http.rpc(
        'decide_member',
        { p_member_id: pendingA.member_id, p_decision: 'APPROVE' },
        { token: host.token },
      );
      checkRpcSuccess(ctx, approvedA, 'approve Guest A berhasil');
      ctx.check(
        'Guest A menjadi APPROVED',
        ctx.firstRow(approvedA.data)?.status === 'APPROVED',
        ctx.firstRow(approvedA.data)?.status,
      );

      const [approveB, approveC] = await Promise.all([
        ctx.http.rpc(
          'decide_member',
          { p_member_id: pendingB.member_id, p_decision: 'APPROVE' },
          { token: host.token },
        ),
        ctx.http.rpc(
          'decide_member',
          { p_member_id: pendingC.member_id, p_decision: 'APPROVE' },
          { token: host.token },
        ),
      ]);

      const approveSuccesses = [approveB, approveC].filter((result) => result.ok && !result.error);
      const approveFull = [approveB, approveC].filter(
        (result) => result.error?.message === 'ROOM_FULL',
      );
      ctx.check(
        'tepat satu approve bersamaan berhasil',
        approveSuccesses.length === 1,
        `${approveSuccesses.length} sukses`,
      );
      ctx.check(
        'tepat satu approve bersamaan = ROOM_FULL',
        approveFull.length === 1,
        `${approveFull.length} ROOM_FULL`,
      );

      const finalMembers = await ctx.listMembers(host, approvalRoom.id);
      checkRpcSuccess(ctx, finalMembers, 'Host membaca member setelah race approve');
      const finalApproved = (finalMembers.data ?? []).filter((row) => row.status === 'APPROVED');
      ctx.check(
        'approved akhir tepat 2',
        finalApproved.length === 2,
        `${finalApproved.length} approved`,
      );
      ctx.check(
        'tidak ada display_name ganda',
        new Set(finalApproved.map((row) => row.display_name)).size === finalApproved.length,
        finalApproved.map((row) => row.display_name).join(','),
      );

      const rawMembers = await ctx.http.rest(
        `room_members?select=member_no,display_name,status&room_id=eq.${encodeURIComponent(approvalRoom.id)}&status=eq.APPROVED`,
        { service: true },
      );
      const rawApproved = Array.isArray(rawMembers.data) ? rawMembers.data : [];
      ctx.check(
        'tidak ada member_no ganda',
        rawApproved.length === 2 &&
          rawApproved.every((row) => row.member_no !== null) &&
          new Set(rawApproved.map((row) => row.member_no)).size === rawApproved.length,
        rawApproved.map((row) => `${row.member_no}:${row.display_name}`).join(','),
      );
    } finally {
      await ctx.deleteRoom(capacityRoom.id);
      await ctx.deleteRoom(approvalRoom.id);
    }
  },
};
