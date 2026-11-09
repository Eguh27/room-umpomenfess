import { getBrowserClient } from '../../lib/supabase/browser';
import type { ChatMessage, RoomMember } from '../../lib/realtime/types';

export interface RoomMetadata {
  id: string;
  slug: string;
  name: string;
  status: 'ACTIVE' | 'CLOSED';
  visibility: 'PRIVATE' | 'PUBLIC';
  typingEffective: boolean;
  maxGuests?: number;
  expiresAt?: string;
  closedAt?: string | null;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Mengambil metadata publik room untuk tampilan Guest. */
export async function fetchPublicRoom(slug: string): Promise<ApiResult<RoomMetadata>> {
  const client = getBrowserClient();
  const { data, error } = await client.rpc('get_room_public', { p_slug: slug });

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'NOT_FOUND' };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { ok: false, error: 'NOT_FOUND' };

  return {
    ok: true,
    data: {
      id: row.room_id,
      slug,
      name: row.name,
      status: row.status === 'ACTIVE' ? 'ACTIVE' : 'CLOSED',
      visibility: row.visibility,
      typingEffective: Boolean(row.typing_effective),
    },
  };
}

/** Mengambil metadata room milik Host via RPC list_hosted_rooms. */
export async function fetchHostRoom(roomId: string): Promise<ApiResult<RoomMetadata>> {
  const client = getBrowserClient();
  const { data, error } = await client.rpc('list_hosted_rooms');

  if (error) {
    return { ok: false, error: error.message };
  }

  const rows = (data as any[]) ?? [];
  const target = rows.find((r) => r.id === roomId);
  if (!target) {
    return { ok: false, error: 'Room tidak ditemukan atau kamu bukan pemiliknya.' };
  }

  return {
    ok: true,
    data: {
      id: target.id,
      slug: target.slug,
      name: target.name,
      status: target.status === 'ACTIVE' ? 'ACTIVE' : 'CLOSED',
      visibility: target.visibility,
      typingEffective: Boolean(target.typing_effective),
      maxGuests: target.max_guests,
      expiresAt: target.expires_at,
      closedAt: target.closed_at,
    },
  };
}

/** Mengambil daftar anggota room untuk Host (panggilan awal sebelum Realtime). */
export async function fetchRoomMembers(roomId: string): Promise<ApiResult<RoomMember[]>> {
  const client = getBrowserClient();
  const { data, error } = await client.rpc('list_members', { p_room_id: roomId });

  if (error) {
    return { ok: false, error: error.message };
  }

  const rows = Array.isArray(data) ? data : data ? [data] : [];
  const members: RoomMember[] = rows.map((r: any) => ({
    id: r.id,
    room_id: roomId,
    handle: r.handle,
    handle_verified: Boolean(r.handle_verified),
    status: r.status,
    created_at: r.joined_at ?? r.created_at,
    status_changed_at: r.status_changed_at,
  }));

  return { ok: true, data: members };
}

/** Menyetujui atau menolak member di antrean lobi (Host only). */
export async function decideMember(
  memberId: string,
  decision: 'APPROVE' | 'REJECT',
): Promise<ApiResult<void>> {
  const client = getBrowserClient();
  const { error } = await client.rpc('decide_member', {
    p_member_id: memberId,
    p_decision: decision,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, data: undefined };
}

/** Mengeluarkan member yang sedang aktif (Host only). */
export async function kickMember(memberId: string): Promise<ApiResult<void>> {
  const client = getBrowserClient();
  const { error } = await client.rpc('kick_member', {
    p_member_id: memberId,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, data: undefined };
}

/** Menutup room secara manual (Host only). */
export async function closeRoom(roomId: string): Promise<ApiResult<void>> {
  const client = getBrowserClient();
  const { error } = await client.rpc('close_room', {
    p_room_id: roomId,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, data: undefined };
}

/** Mengambil seluruh pesan room secara tuntas untuk ekspor .txt (Host only). */
export async function fetchFullExportMessages(roomId: string): Promise<ApiResult<ChatMessage[]>> {
  const client = getBrowserClient();
  const allMessages: ChatMessage[] = [];
  let afterId = 0;

  try {
    while (true) {
      const { data, error } = await client.rpc('export_messages', {
        p_room_id: roomId,
        p_after_id: afterId,
        p_limit: 1000,
      });

      if (error) {
        return { ok: false, error: error.message };
      }

      const rows: any[] = Array.isArray(data) ? data : data ? [data] : [];
      if (rows.length === 0) break;

      for (const r of rows) {
        allMessages.push({
          id: r.id,
          room_id: r.room_id,
          sender_type: r.sender_type,
          member_id: r.member_id,
          sender_name: r.sender_name,
          sender_badge: r.sender_badge,
          content: r.content,
          client_msg_id: r.client_msg_id,
          created_at: r.created_at,
        });
      }

      const last = rows[rows.length - 1];
      if (!last || last.id <= afterId) break;
      afterId = last.id;

      if (rows.length < 1000) break;
    }

    return { ok: true, data: allMessages };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'SERVER_ERROR' };
  }
}

/** Format hitung mundur sisa waktu room aktif. */
export function formatRemainingTime(expiresAt?: string | null, closedAt?: string | null): string {
  if (closedAt) return 'Sudah ditutup';
  if (!expiresAt) return '';

  const now = Date.now();
  const target = new Date(expiresAt).getTime();
  const diff = target - now;

  if (diff <= 0) return 'Kedaluwarsa';

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (days > 0) {
    return `sisa ${days} hari ${hours} jam`;
  }
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) {
    return `sisa ${hours} jam ${minutes} menit`;
  }
  return `sisa ${Math.max(1, minutes)} menit`;
}
