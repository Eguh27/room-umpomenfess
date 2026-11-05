import { randomBytes } from 'node:crypto';
import { loadConfig } from './lib/env.mjs';
import { createHttp, responseError } from './lib/http.mjs';
import { createGuest, createHost, deleteUser } from './lib/auth.mjs';
import {
  ageRoom,
  countActiveRooms,
  createRoom,
  deleteRoom,
  deleteRoomsByHost,
  firstRow,
  getMembersAsHost,
  getMessages,
  getProfile,
  getPublicRoom,
  getRoomHost,
  getRoomService,
  guestSend,
  hostSend,
  joinRoom,
  joinRoomOrThrow,
  listMembers,
  newClientMsgId,
  newIpHash,
  patchMember,
  recordFailure,
  sendMessage,
} from './lib/fixtures.mjs';
import { runTest } from './lib/test.mjs';
import tests from './tests/index.mjs';

const allowOpen = process.argv.includes('--allow-open');
const onlyArg = process.argv.find((arg) => arg.startsWith('--only='));
const only = onlyArg ? onlyArg.slice('--only='.length) : null;

const config = loadConfig();
const http = createHttp(config);
const runId = `${Date.now().toString(36)}${randomBytes(3).toString('hex')}`;
const createdUsers = [];
const hosts = {};
const guests = {};

function makeContext() {
  return {
    http,
    config,
    runId,
    hosts,
    guests,
    createRoom: (host, options) => createRoom(http, host, options),
    deleteRoom: (roomId) => deleteRoom(http, roomId),
    deleteRoomsByHost: (hostId) => deleteRoomsByHost(http, hostId),
    joinRoom: (room, guest, options) => joinRoom(http, room, guest, options),
    joinRoomOrThrow: (room, guest, options) => joinRoomOrThrow(http, room, guest, options),
    recordFailure: (room, ipHash) => recordFailure(http, room, ipHash),
    ageRoom: (roomId, options) => ageRoom(http, roomId, options),
    patchMember: (memberId, body) => patchMember(http, memberId, body),
    getRoomHost: (host, roomId) => getRoomHost(http, host, roomId),
    getRoomService: (slugOrId, by) => getRoomService(http, slugOrId, by),
    getMembersAsHost: (host, roomId) => getMembersAsHost(http, host, roomId),
    getMessages: (token, roomId) => getMessages(http, token, roomId),
    listMembers: (host, roomId) => listMembers(http, host, roomId),
    getProfile: (host) => getProfile(http, host),
    getPublicRoom: (guest, slug) => getPublicRoom(http, guest, slug),
    sendMessage: (token, roomId, content, clientMsgId) =>
      sendMessage(http, token, roomId, content, clientMsgId),
    hostSend: (room, content, clientMsgId) => hostSend(http, room, content, clientMsgId),
    guestSend: (guest, room, content, clientMsgId) =>
      guestSend(http, guest, room, content, clientMsgId),
    countActiveRooms: (hostId) => countActiveRooms(http, hostId),
    firstRow,
    newClientMsgId,
    newIpHash,
    responseError,
  };
}

async function setup() {
  console.log(`Setup fixture keamanan di ${config.url}`);
  hosts.a = await createHost(http, 'a', runId);
  createdUsers.push(hosts.a);
  hosts.b = await createHost(http, 'b', runId);
  createdUsers.push(hosts.b);
  hosts.quota = await createHost(http, 'quota', runId);
  createdUsers.push(hosts.quota);

  for (const name of ['a', 'b', 'c', 'd']) {
    guests[name] = await createGuest(http);
    createdUsers.push(guests[name]);
  }
}

async function cleanup() {
  // Hapus room lebih dulu agar tidak bergantung pada cascade saat user dihapus.
  for (const host of Object.values(hosts)) {
    try {
      await deleteRoomsByHost(http, host.id);
    } catch {
      // cleanup best-effort
    }
  }
  for (const user of createdUsers.reverse()) {
    try {
      const ok = await deleteUser(http, user.id);
      if (!ok) console.error(`Peringatan: gagal menghapus user fixture ${user.id}`);
    } catch {
      console.error(`Peringatan: error saat menghapus user fixture ${user.id}`);
    }
  }
}

let exitCode;
try {
  await setup();
  const selected = only ? tests.filter((test) => test.id === only) : tests;
  if (selected.length === 0) throw new Error(`Tidak ada tes dengan ID ${only}`);

  const results = [];
  for (const test of selected) {
    results.push(await runTest(test, makeContext()));
  }

  const failed = results.filter((result) => !result.pass);
  const passed = results.length - failed.length;
  console.log(`\nRingkasan: ${passed}/${results.length} LULUS, ${failed.length} GAGAL`);
  if (failed.length > 0) {
    console.log(`GAGAL: ${failed.map((result) => result.id).join(', ')}`);
    if (allowOpen) {
      console.log('Mode --allow-open: kegagalan dianggap temuan terbuka, exit 0.');
    }
  }
  exitCode = failed.length > 0 && !allowOpen ? 1 : 0;
} catch (error) {
  console.error(`GAGAL setup/runner: ${error instanceof Error ? error.message : error}`);
  exitCode = 1;
} finally {
  await cleanup();
}

process.exit(exitCode);
