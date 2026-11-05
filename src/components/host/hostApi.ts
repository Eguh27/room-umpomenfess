/**
 * Lapisan RPC Host untuk dasbor (T-51). Kontrak mengikuti migration 0009/0003
 * — jangan diubah di sini. Semua panggilan memakai browser client; identitas
 * selalu dari sesi (auth.uid() di dalam fungsi), bukan parameter.
 */

import type { PostgrestError } from '@supabase/supabase-js';
import { getBrowserClient } from '../../lib/supabase/browser';

/** Kuota jsonb dari list_hosted_rooms: {used, max}. */
export interface Quota {
  used: number;
  max: number;
}

/** Baris list_hosted_rooms — 22 kolom persis migration 0009. */
export interface HostedRoom {
  id: string;
  slug: string;
  name: string;
  status: string;
  visibility: 'PRIVATE' | 'PUBLIC';
  listing_status: string;
  description: string | null;
  category: string | null;
  listed_at: string | null;
  approval_required: boolean;
  max_guests: number;
  idle_timeout_minutes: number;
  typing_enabled: boolean;
  typing_effective: boolean;
  created_at: string;
  expires_at: string;
  closed_at: string | null;
  delete_at: string | null;
  approved_count: number;
  pending_count: number;
  quota: Quota;
  public_quota: Quota;
}

/** Hasil create_room: OUT room_id, slug, password, expires_at. */
export interface CreatedRoom {
  room_id: string;
  slug: string;
  /** null untuk room PUBLIC — tidak memakai password. */
  password: string | null;
  expires_at: string;
}

type RpcResult<T> = { ok: true; data: T } | { ok: false; error: PostgrestError };

/**
 * Kode error P0001 dari RPC Host (TASK bagian 6) → kalimat Indonesia.
 * Kode mentah tidak pernah ditampilkan; kode tak dikenal memakai teks umum.
 */
export function hostErrorFor(error: PostgrestError | null): string {
  const code = error?.message ?? '';
  switch (code) {
    case 'NOT_HOST':
      return 'Hanya akun Host yang sedang login bisa melakukan ini.';
    case 'INVALID_INPUT':
      return 'Data tidak valid. Periksa isian, lalu coba lagi.';
    case 'USER_SUSPENDED':
      return 'Akunmu sedang ditangguhkan, jadi tidak bisa mengelola room.';
    case 'CAPACITY_EXCEEDS_TIER':
      return 'Kapasitas melebihi batas tier kamu. Turunkan jumlah Guest, lalu coba lagi.';
    case 'QUOTA_REACHED':
      return 'Batas room aktif tercapai. Tutup salah satu room untuk membuat yang baru.';
    case 'PUBLIC_QUOTA_REACHED':
      return 'Kuota room publik penuh. Jadikan privat atau tutup salah satu room publik dulu.';
    case 'FEATURE_DISABLED':
      return 'Daftar room publik sedang dimatikan pengelola. Room privat tetap bisa dibuat.';
    case 'EMAIL_NOT_CONFIRMED':
      return 'Email belum dikonfirmasi. Buka tautan konfirmasi dulu untuk membuat room publik.';
    case 'NOT_FOUND':
      return 'Room tidak ditemukan atau bukan milikmu.';
    case 'ROOM_CLOSED':
      return 'Room ini sudah tutup, aksi tidak bisa dilanjutkan.';
    default:
      return 'Terjadi kendala. Coba lagi sebentar.';
  }
}

async function rpc<T>(fn: string, args?: object): Promise<RpcResult<T>> {
  const { data, error } = await getBrowserClient().rpc(fn, args);
  if (error) return { ok: false, error };
  return { ok: true, data: (data ?? null) as T };
}

export function fetchHostedRooms(): Promise<RpcResult<HostedRoom[]>> {
  return rpc<HostedRoom[]>('list_hosted_rooms');
}

export interface CreateRoomInput {
  name: string;
  maxGuests: number;
  approvalRequired: boolean;
  idleTimeoutMinutes: number;
  typingEnabled: boolean;
  visibility: 'PRIVATE' | 'PUBLIC';
  description: string;
  category: string;
}

/** Kontrak 8-argumen create_room (migration 0009). PostgREST membungkus hasil
 * `returns table` sebagai array satu baris — dibongkar jadi objek tunggal. */
export function createRoom(input: CreateRoomInput): Promise<RpcResult<CreatedRoom>> {
  return rpc<CreatedRoom[]>('create_room', {
    p_name: input.name,
    p_max_guests: input.maxGuests,
    p_approval_required: input.approvalRequired,
    p_idle_timeout_minutes: input.idleTimeoutMinutes,
    p_typing_enabled: input.typingEnabled,
    p_visibility: input.visibility,
    p_description: input.description || null,
    p_category: input.category || null,
  }).then((result) => {
    if (!result.ok) return result;
    return { ok: true, data: result.data[0] };
  });
}

/** Password baru tampil sekali; PUBLIC ditolak INVALID_INPUT oleh server. */
export function regeneratePassword(roomId: string): Promise<RpcResult<string>> {
  return rpc<string>('regenerate_password', { p_room_id: roomId });
}

/** Room publik → privat + password baru; mengembalikan password tampil sekali. */
export function makeRoomPrivate(roomId: string): Promise<RpcResult<string>> {
  return rpc<string>('make_room_private', { p_room_id: roomId });
}

/** Void & idempoten: menyetel closed_at + delete_at = now + grace. */
export function closeRoom(roomId: string): Promise<RpcResult<null>> {
  return rpc<null>('close_room', { p_room_id: roomId });
}

/**
 * Batas kapasitas Guest tier — dicerminkan dari tier_limits lewat
 * `quota.max` (max_active_rooms) karena kontrak RPC tidak menyertakan tier.
 * Server tetap sumber kebenaran (CAPACITY_EXCEEDS_TIER).
 */
export function guestsCapFor(
  quotaMax: number,
  defaults: Record<string, { maxActiveRooms: number; maxGuestsCap: number }>,
): number {
  const tier = Object.values(defaults).find((t) => t.maxActiveRooms === quotaMax);
  return tier?.maxGuestsCap ?? 0;
}
