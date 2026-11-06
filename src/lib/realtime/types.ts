export type SenderType = 'HOST' | 'GUEST';

/** Lencana server: HOST untuk Host, VERIFIED untuk handle buatan Admin. */
export type SenderBadge = 'HOST' | 'VERIFIED';

export type MemberStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'KICKED' | 'IDLE' | 'LEFT';

/** Baris public.messages. Pesan optimistis memakai id negatif sementara. */
export interface ChatMessage {
  id: number;
  room_id: string;
  sender_type: SenderType;
  member_id: string | null;
  /** Snapshot handle saat pesan dikirim; rename tidak mengubah pesan lama. */
  sender_name: string;
  /** Lencana dari server; null untuk Guest tanpa handle terverifikasi. */
  sender_badge: SenderBadge | null;
  content: string;
  client_msg_id: string;
  created_at: string;
  optimistic?: boolean;
  sendStatus?: 'sending' | 'failed';
  errorCode?: string;
}

/** Baris public.room_members; list_members hanya mengirim subset kolom. */
export interface RoomMember {
  id: string;
  room_id?: string;
  /** Handle per room (anonim) atau handle profil (login). */
  handle: string;
  handle_verified: boolean;
  status: MemberStatus;
  password_version?: number;
  created_at?: string;
  status_changed_at?: string;
}

export type RealtimeConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error' | 'closed';

export interface RealtimeError {
  code: string;
  at: string;
}

export interface RoomRealtimeSnapshot {
  status: RealtimeConnectionStatus;
  messages: ChatMessage[];
  members: RoomMember[];
  selfStatus: MemberStatus | null;
  historyLoaded: boolean;
  hasMoreHistory: boolean;
  isLoadingOlder: boolean;
  typingCount: number;
  lastError: RealtimeError | null;
}

export type SendResult = { ok: true; message: ChatMessage } | { ok: false; error: string };

export interface PostgresChangeFilter {
  event: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  schema: string;
  table: string;
  filter?: string;
}

export interface RpcError {
  message: string;
  details?: string | null;
}

export interface RpcResult<T> {
  data: T | null;
  error: RpcError | null;
}

/** Subset struktural dari RealtimeChannel supabase-js agar mudah dites. */
export interface RealtimeChannelLike {
  on(
    event: 'postgres_changes',
    filter: PostgresChangeFilter,
    callback: (payload: { new: Record<string, unknown> }) => void,
  ): RealtimeChannelLike;
  on(
    event: 'broadcast',
    filter: { event: string },
    callback: (payload: { payload: Record<string, unknown> }) => void,
  ): RealtimeChannelLike;
  send?(message: {
    type: 'broadcast';
    event: string;
    payload?: Record<string, unknown>;
  }): Promise<unknown> | unknown;
  subscribe(callback: (status: string, error?: Error) => void): RealtimeChannelLike;
  unsubscribe(): Promise<unknown> | unknown;
}

/** Subset struktural dari SupabaseClient yang dipakai modul realtime. */
export interface RealtimeClientLike {
  channel(name: string, options?: { config?: { private?: boolean } }): RealtimeChannelLike;
  rpc<T = unknown>(name: string, args: Record<string, unknown>): PromiseLike<RpcResult<T>>;
  removeChannel?(channel: RealtimeChannelLike): Promise<unknown> | unknown;
}
