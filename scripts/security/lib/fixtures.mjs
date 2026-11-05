import { randomBytes, randomUUID } from 'node:crypto';
import { responseError } from './http.mjs';

const ROOM_COLUMNS = [
  'id',
  'slug',
  'name',
  'approval_required',
  'max_guests',
  'idle_timeout_minutes',
  'typing_enabled',
  'created_at',
  'expires_at',
  'closed_at',
  'delete_at',
  'password_version',
].join(',');

const MESSAGE_COLUMNS = [
  'id',
  'room_id',
  'sender_type',
  'member_id',
  'sender_name',
  'content',
  'client_msg_id',
  'created_at',
].join(',');

const DAY_MS = 24 * 60 * 60 * 1000;

export function firstRow(data) {
  return Array.isArray(data) ? (data[0] ?? null) : (data ?? null);
}

export function newClientMsgId() {
  return randomUUID();
}

export function newIpHash() {
  return randomBytes(32).toString('hex');
}

export async function createRoom(http, host, options = {}) {
  const args = {
    p_name: options.name ?? `T61 ${randomUUID().slice(0, 8)}`,
    p_max_guests: options.maxGuests ?? 3,
    p_approval_required: options.approvalRequired ?? false,
    p_idle_timeout_minutes: options.idleTimeoutMinutes ?? 30,
    p_typing_enabled: options.typingEnabled ?? false,
  };
  const result = await http.rpc('create_room', args, { token: host.token });
  if (result.error) {
    throw new Error(`create_room gagal: ${responseError(result)}`);
  }
  const row = firstRow(result.data);
  if (!row?.room_id || !row?.slug || !row?.password) {
    throw new Error('create_room tidak mengembalikan room_id/slug/password');
  }
  return {
    id: row.room_id,
    slug: row.slug,
    password: row.password,
    expiresAt: row.expires_at,
    host,
  };
}

export async function deleteRoom(http, roomId) {
  if (!roomId) return true;
  const result = await http.rest(`rooms?id=eq.${encodeURIComponent(roomId)}`, {
    method: 'DELETE',
    service: true,
    prefer: 'return=minimal',
  });
  return result.ok || result.status === 404;
}

export async function deleteRoomsByHost(http, hostId) {
  if (!hostId) return true;
  const result = await http.rest(`rooms?host_id=eq.${encodeURIComponent(hostId)}`, {
    method: 'DELETE',
    service: true,
    prefer: 'return=minimal',
  });
  return result.ok || result.status === 404;
}

export function joinRoom(http, room, guest, options = {}) {
  return http.rpc(
    'join_room',
    {
      p_user_id: guest.id,
      p_slug: room.slug,
      p_password: options.password ?? room.password,
      p_ip_hash: options.ipHash ?? newIpHash(),
    },
    { service: true },
  );
}

export async function joinRoomOrThrow(http, room, guest, options = {}) {
  const result = await joinRoom(http, room, guest, options);
  if (result.error) {
    throw new Error(`join_room gagal: ${responseError(result)}`);
  }
  const row = firstRow(result.data);
  if (!row?.member_id) throw new Error('join_room tidak mengembalikan member_id');
  return row;
}

export function recordFailure(http, room, ipHash) {
  return http.rpc(
    'record_join_failure',
    { p_slug: room.slug, p_ip_hash: ipHash },
    { service: true },
  );
}

export async function patchRoom(http, roomId, body) {
  const result = await http.rest(`rooms?id=eq.${encodeURIComponent(roomId)}`, {
    method: 'PATCH',
    service: true,
    body,
    prefer: 'return=minimal',
  });
  if (!result.ok) throw new Error(`patchRoom gagal: ${responseError(result)}`);
  return result;
}

/** Fixture khusus S-19/S-20: umur room dibuat mundur agar expires/delete sudah lewat. */
export async function ageRoom(http, roomId, { deleteAtPast }) {
  const now = Date.now();
  const createdAt = new Date(now - 3 * DAY_MS).toISOString();
  const expiresAt = new Date(now - 2 * DAY_MS).toISOString();
  const deleteAt = new Date(now + (deleteAtPast ? -1 : 1) * DAY_MS).toISOString();
  await patchRoom(http, roomId, {
    created_at: createdAt,
    expires_at: expiresAt,
    delete_at: deleteAt,
  });
}

export async function patchMember(http, memberId, body) {
  const result = await http.rest(`room_members?id=eq.${encodeURIComponent(memberId)}`, {
    method: 'PATCH',
    service: true,
    body,
    prefer: 'return=minimal',
  });
  if (!result.ok) throw new Error(`patchMember gagal: ${responseError(result)}`);
  return result;
}

export async function getRoomHost(http, host, roomId) {
  const result = await http.rest(
    `rooms?select=${ROOM_COLUMNS}&id=eq.${encodeURIComponent(roomId)}`,
    { token: host.token },
  );
  if (!result.ok) throw new Error(`baca room Host gagal: ${responseError(result)}`);
  return firstRow(result.data);
}

export async function getRoomService(http, slugOrId, by = 'slug') {
  const key = by === 'id' ? 'id' : 'slug';
  const result = await http.rest(
    `rooms?select=${ROOM_COLUMNS}&${key}=eq.${encodeURIComponent(slugOrId)}`,
    { service: true },
  );
  if (!result.ok) throw new Error(`baca room service gagal: ${responseError(result)}`);
  return firstRow(result.data);
}

export async function getMembersAsHost(http, host, roomId) {
  const result = await http.rest(
    `room_members?select=*&room_id=eq.${encodeURIComponent(roomId)}&order=member_no.asc`,
    { token: host.token },
  );
  if (!result.ok) throw new Error(`baca room_members Host gagal: ${responseError(result)}`);
  return Array.isArray(result.data) ? result.data : [];
}

export async function getMessages(http, token, roomId) {
  const result = await http.rest(
    `messages?select=${MESSAGE_COLUMNS}&room_id=eq.${encodeURIComponent(roomId)}&order=id.asc`,
    { token },
  );
  return result;
}

export function listMembers(http, host, roomId) {
  return http.rpc('list_members', { p_room_id: roomId }, { token: host.token });
}

export async function getProfile(http, host) {
  const result = await http.rest(
    `profiles?select=user_id,tier&user_id=eq.${encodeURIComponent(host.id)}`,
    { token: host.token },
  );
  if (!result.ok) throw new Error(`baca profil Host gagal: ${responseError(result)}`);
  return firstRow(result.data);
}

export function getPublicRoom(http, guest, slug) {
  return http.rpc('get_room_public', { p_slug: slug }, { token: guest.token });
}

export function sendMessage(http, token, roomId, content, clientMsgId = newClientMsgId()) {
  return http.rpc(
    'send_message',
    {
      p_room_id: roomId,
      p_content: content,
      p_client_msg_id: clientMsgId,
    },
    { token },
  );
}

export function hostSend(http, room, content, clientMsgId) {
  return sendMessage(http, room.host.token, room.id, content, clientMsgId);
}

export function guestSend(http, guest, room, content, clientMsgId) {
  return sendMessage(http, guest.token, room.id, content, clientMsgId);
}

export async function countActiveRooms(http, hostId) {
  const now = encodeURIComponent(new Date().toISOString());
  const result = await http.rest(
    `rooms?select=id&host_id=eq.${encodeURIComponent(hostId)}&closed_at=is.null&expires_at=gt.${now}`,
    { service: true },
  );
  if (!result.ok) throw new Error(`hitung room aktif gagal: ${responseError(result)}`);
  return Array.isArray(result.data) ? result.data.length : 0;
}
