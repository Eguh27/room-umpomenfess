import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createRoomRealtime } from './room-realtime';
import type {
  ChatMessage,
  MemberStatus,
  RoomMember,
  RoomRealtimeSnapshot,
  SendResult,
  SenderBadge,
  SenderType,
} from './types';

export interface UseRoomRealtimeOptions {
  client: SupabaseClient;
  roomId: string;
  memberId: string | null;
  senderType: SenderType;
  /** Handle pengirim saat ini, dari respons join/login. */
  handle: string;
  /** Bila belum diketahui, server tetap mengirim lencana final pada baris pesan. */
  senderBadge?: SenderBadge | null;
  initialMessages?: ChatMessage[];
  initialMembers?: RoomMember[];
  initialStatus?: MemberStatus | null;
  typingEffective?: boolean;
  createClientMsgId?: () => string;
}

export interface UseRoomRealtimeResult {
  snapshot: RoomRealtimeSnapshot;
  sendMessage: (content: string) => Promise<SendResult>;
  retryMessage: (clientMsgId: string) => Promise<SendResult>;
  loadOlderMessages: () => Promise<boolean>;
  sendTyping: () => void;
  rejoin: () => Promise<boolean>;
  leave: () => Promise<boolean>;
}

/** Hook tipis untuk React island; logika ada di RoomRealtime (framework-agnostic). */
export function useRoomRealtime(options: UseRoomRealtimeOptions): UseRoomRealtimeResult {
  const {
    client,
    roomId,
    memberId,
    senderType,
    handle,
    senderBadge,
    initialMessages,
    initialMembers,
    initialStatus,
    typingEffective,
    createClientMsgId,
  } = options;

  const realtime = useMemo(
    () =>
      createRoomRealtime({
        client,
        roomId,
        memberId,
        self: { senderType, handle, senderBadge: senderBadge ?? null },
        initialMessages,
        initialMembers,
        initialStatus,
        typingEffective,
        createClientMsgId,
      }),
    // Data awal bersifat snapshot saat room dibuka; perubahan berikutnya datang dari Realtime.
    [client, roomId, memberId, senderType, handle, senderBadge, initialStatus, typingEffective],
  );

  useEffect(() => {
    realtime.start();
    return () => realtime.stop();
  }, [realtime]);

  const snapshot = useSyncExternalStore(
    realtime.subscribe,
    realtime.getSnapshot,
    realtime.getSnapshot,
  );

  return {
    snapshot,
    sendMessage: (content) => realtime.sendMessage(content),
    retryMessage: (clientMsgId) => realtime.retryMessage(clientMsgId),
    loadOlderMessages: () => realtime.loadOlderMessages(),
    sendTyping: () => realtime.sendTyping(),
    rejoin: () => realtime.rejoin(),
    leave: () => realtime.leave(),
  };
}
