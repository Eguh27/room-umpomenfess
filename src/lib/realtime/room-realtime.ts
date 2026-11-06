import type { SupabaseClient } from '@supabase/supabase-js';
import { APP_DEFAULTS } from '../config';
import { MessageStore } from './message-store';
import type {
  ChatMessage,
  MemberStatus,
  RealtimeChannelLike,
  RealtimeClientLike,
  RealtimeConnectionStatus,
  RealtimeError,
  RoomMember,
  RoomRealtimeSnapshot,
  SendResult,
  SenderBadge,
} from './types';

const CHANNEL_PREFIX = 'room:';
const INITIAL_PAGE_SIZE = APP_DEFAULTS.historyPageSize;
const BACKFILL_PAGE_SIZE = 100;
/** Batas aman backfill: 50 halaman x 100 pesan = 5000 pesan (kapasitas maksimum room). */
const MAX_BACKFILL_PAGES = 50;

const MEMBER_STATUSES: ReadonlySet<MemberStatus> = new Set([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'KICKED',
  'IDLE',
  'LEFT',
]);

export interface RoomRealtimeOptions {
  client: RealtimeClientLike;
  roomId: string;
  memberId: string | null;
  self: { senderType: 'HOST' | 'GUEST'; handle: string; senderBadge?: SenderBadge | null };
  initialMessages?: ChatMessage[];
  initialMembers?: RoomMember[];
  initialStatus?: MemberStatus | null;
  pageSize?: number;
  typingEffective?: boolean;
  createClientMsgId?: () => string;
  now?: () => Date;
}

export type CreateRoomRealtimeOptions = Omit<RoomRealtimeOptions, 'client'> & {
  client: SupabaseClient;
};

/**
 * Satu instance = satu room yang sedang dibuka.
 * - Pesan: Postgres Changes INSERT + backfill `list_messages(p_after_id)` setiap SUBSCRIBED.
 * - Paginasi riwayat: `loadOlderMessages()` memuat riwayat sebelum id terkecil.
 * - Status member: Postgres Changes pada room_members (Guest hanya menerima barisnya sendiri).
 * - Indikator mengetik: Realtime Broadcast agregat tanpa identitas di channel `typing:<room_id>`.
 * - Heartbeat: memanggil `touch_activity` secara berkala untuk mencegah auto-kick idle.
 * - Kirim optimistis: id sementara negatif, diganti baris server dengan client_msg_id yang sama.
 */
export class RoomRealtime {
  private readonly client: RealtimeClientLike;
  private readonly roomId: string;
  private readonly memberId: string | null;
  private readonly self: RoomRealtimeOptions['self'];
  private readonly pageSize: number;
  private readonly typingEffective: boolean;
  private readonly createClientMsgId: () => string;
  private readonly now: () => Date;
  private readonly store = new MessageStore();
  private readonly members = new Map<string, RoomMember>();
  private readonly listeners = new Set<() => void>();
  private channel: RealtimeChannelLike | null = null;
  private typingChannel: RealtimeChannelLike | null = null;
  private status: RealtimeConnectionStatus = 'idle';
  private selfStatus: MemberStatus | null = null;
  private historyLoaded = false;
  private hasMoreHistory = true;
  private isLoadingOlder = false;
  private lastError: RealtimeError | null = null;
  private snapshot: RoomRealtimeSnapshot;
  private backfillPromise: Promise<void> | null = null;
  private stopped = false;

  // Typing state
  private readonly activeTypers = new Map<string, number>();
  private typingTimer: ReturnType<typeof setInterval> | null = null;
  private lastTypingSentAt = 0;

  // Heartbeat state
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: RoomRealtimeOptions) {
    this.client = options.client;
    this.roomId = options.roomId;
    this.memberId = options.memberId;
    this.self = options.self;
    this.pageSize = Math.min(Math.max(options.pageSize ?? BACKFILL_PAGE_SIZE, 1), 100);
    this.typingEffective = Boolean(options.typingEffective);
    this.createClientMsgId = options.createClientMsgId ?? (() => crypto.randomUUID());
    this.now = options.now ?? (() => new Date());
    this.store.addServerMany(options.initialMessages ?? []);
    this.historyLoaded = options.initialMessages !== undefined;
    this.selfStatus = options.initialStatus ?? null;
    for (const member of options.initialMembers ?? []) {
      this.members.set(member.id, member);
      if (member.id === this.memberId) this.selfStatus = member.status;
    }
    this.snapshot = this.buildSnapshot();
  }

  start(): void {
    if (this.channel || this.stopped) return;
    this.setStatus('connecting');

    const channel = this.client.channel(`${CHANNEL_PREFIX}${this.roomId}`);
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `room_id=eq.${this.roomId}`,
      },
      (payload) => this.handleMessage(payload.new),
    );
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'room_members',
        filter: `room_id=eq.${this.roomId}`,
      },
      (payload) => this.handleMember(payload.new),
    );
    this.channel = channel;
    channel.subscribe((status) => this.handleSubscribeStatus(status));

    // Typing broadcast channel (hanya jika fitur aktif)
    if (this.typingEffective) {
      const typingChannel = this.client.channel(`typing:${this.roomId}`, {
        config: { private: true },
      });
      typingChannel.on(
        'broadcast',
        { event: 'typing' },
        (msg: { payload?: Record<string, unknown> }) => {
          const sender = (msg.payload?.senderId as string) || (msg.payload?.handle as string);
          if (sender && sender !== this.memberId && sender !== this.self.handle) {
            this.activeTypers.set(sender, Date.now() + 6000);
            this.updateTypingCount();
          }
        },
      );
      this.typingChannel = typingChannel;
      typingChannel.subscribe(() => undefined);
      this.typingTimer = setInterval(() => this.updateTypingCount(), 1000);
    }

    // Heartbeat untuk anggota terdaftar
    this.startHeartbeat();
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;

    if (this.typingTimer) {
      clearInterval(this.typingTimer);
      this.typingTimer = null;
    }
    this.stopHeartbeat();

    if (this.typingChannel) {
      const tc = this.typingChannel;
      this.typingChannel = null;
      try {
        if (this.client.removeChannel) {
          void Promise.resolve(this.client.removeChannel(tc)).catch(() => undefined);
        } else {
          void Promise.resolve(tc.unsubscribe()).catch(() => undefined);
        }
      } catch {
        // Channel mungkin sudah tertutup
      }
    }

    const channel = this.channel;
    this.channel = null;
    this.setStatus('closed');
    if (!channel) return;

    try {
      if (this.client.removeChannel) {
        void Promise.resolve(this.client.removeChannel(channel)).catch(() => undefined);
      } else {
        void Promise.resolve(channel.unsubscribe()).catch(() => undefined);
      }
    } catch {
      // Channel mungkin sudah tertutup
    }
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): RoomRealtimeSnapshot => this.snapshot;

  getLastServerId(): number {
    return this.store.getLastServerId();
  }

  /** Backfill manual; juga dipanggil otomatis setiap SUBSCRIBED. */
  refresh(): Promise<void> {
    if (this.backfillPromise) return this.backfillPromise;
    this.backfillPromise = this.runBackfill().finally(() => {
      this.backfillPromise = null;
    });
    return this.backfillPromise;
  }

  async sendMessage(content: string): Promise<SendResult> {
    if (this.stopped) return { ok: false, error: 'REALTIME_CLOSED' };

    const trimmed = content.trim();
    if (trimmed.length === 0) return { ok: false, error: 'INVALID_INPUT' };
    if (trimmed.length > APP_DEFAULTS.messageMaxLength) {
      return { ok: false, error: 'MESSAGE_TOO_LONG' };
    }

    const clientMsgId = this.createClientMsgId();
    const optimistic = this.store.addOptimistic({
      roomId: this.roomId,
      memberId: this.memberId,
      senderType: this.self.senderType,
      handle: this.self.handle,
      senderBadge: this.self.senderBadge ?? null,
      content: trimmed,
      clientMsgId,
      createdAt: this.now().toISOString(),
    });
    this.emit();

    try {
      const { data, error } = await this.client.rpc<ChatMessage[] | ChatMessage>('send_message', {
        p_room_id: this.roomId,
        p_content: trimmed,
        p_client_msg_id: clientMsgId,
      });

      if (error) {
        this.setError(error.message);
        this.store.markFailed(clientMsgId, error.message);
        this.emit();
        return { ok: false, error: error.message };
      }

      const rows = toArray(data);
      const server = rows.find((r) => r.client_msg_id === clientMsgId) ?? rows[0];
      if (server) {
        this.store.addServer(server);
        this.emit();
        return { ok: true, message: server };
      }
      return { ok: true, message: optimistic };
    } catch {
      this.setError('SERVER_ERROR');
      this.store.markFailed(clientMsgId, 'SERVER_ERROR');
      this.emit();
      return { ok: false, error: 'SERVER_ERROR' };
    }
  }

  async retryMessage(clientMsgId: string): Promise<SendResult> {
    if (this.stopped) return { ok: false, error: 'REALTIME_CLOSED' };
    const pending = this.store.getByClientId(clientMsgId);
    if (!pending || !pending.optimistic) return { ok: false, error: 'NOT_FOUND' };

    this.store.markSending(clientMsgId);
    this.emit();

    try {
      const { data, error } = await this.client.rpc<ChatMessage[] | ChatMessage>('send_message', {
        p_room_id: this.roomId,
        p_content: pending.content,
        p_client_msg_id: clientMsgId,
      });

      if (error) {
        this.setError(error.message);
        this.store.markFailed(clientMsgId, error.message);
        this.emit();
        return { ok: false, error: error.message };
      }

      const rows = toArray(data);
      const server = rows.find((r) => r.client_msg_id === clientMsgId) ?? rows[0];
      if (server) {
        this.store.addServer(server);
        this.emit();
        return { ok: true, message: server };
      }
      return { ok: true, message: pending };
    } catch {
      this.setError('SERVER_ERROR');
      this.store.markFailed(clientMsgId, 'SERVER_ERROR');
      this.emit();
      return { ok: false, error: 'SERVER_ERROR' };
    }
  }

  /** Paginasi memuat riwayat pesan yang lebih lama (T-41). */
  async loadOlderMessages(): Promise<boolean> {
    if (this.stopped || this.isLoadingOlder || !this.hasMoreHistory) return false;
    const firstId = this.store.getFirstServerId();
    if (firstId === null || firstId <= 1) {
      this.hasMoreHistory = false;
      this.emit();
      return false;
    }

    this.isLoadingOlder = true;
    this.emit();

    try {
      const { data, error } = await this.client.rpc<ChatMessage[] | ChatMessage>('list_messages', {
        p_room_id: this.roomId,
        p_before_id: firstId,
        p_limit: this.pageSize,
      });

      if (this.stopped) return false;
      if (error) {
        this.isLoadingOlder = false;
        this.emit();
        return false;
      }

      const rows = toArray(data);
      if (rows.length < this.pageSize) {
        this.hasMoreHistory = false;
      }
      this.store.addServerMany(rows);
      this.isLoadingOlder = false;
      this.emit();
      return true;
    } catch {
      this.isLoadingOlder = false;
      this.emit();
      return false;
    }
  }

  /** Memicu siaran mengetik (T-43) dengan throttle 5 detik. */
  sendTyping(): void {
    if (this.stopped || !this.typingEffective || !this.typingChannel) return;
    const now = Date.now();
    if (now - this.lastTypingSentAt < 5000) return;
    this.lastTypingSentAt = now;
    if (typeof this.typingChannel.send === 'function') {
      void Promise.resolve(
        this.typingChannel.send({
          type: 'broadcast',
          event: 'typing',
          payload: { senderId: this.memberId ?? this.self.handle },
        }),
      ).catch(() => undefined);
    }
  }

  private updateTypingCount(): void {
    const now = Date.now();
    let changed = false;
    for (const [id, expiresAt] of this.activeTypers.entries()) {
      if (expiresAt <= now) {
        this.activeTypers.delete(id);
        changed = true;
      }
    }
    if (changed || this.snapshot.typingCount !== this.activeTypers.size) {
      this.emit();
    }
  }

  /** Heartbeat sentuhan aktivitas agar tidak dikeluarkan idle (T-42). */
  private startHeartbeat(): void {
    if (typeof window === 'undefined' || this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      this.touchActivity();
    }, 4 * 60 * 1000);

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
  }

  private handleVisibilityChange = (): void => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      this.touchActivity();
    }
  };

  touchActivity(): void {
    if (this.stopped || !this.memberId) return;
    void Promise.resolve(
      this.client.rpc('touch_activity', { p_room_id: this.roomId }),
    ).catch(() => undefined);
  }

  /** Masuk kembali bila terkena IDLE (T-42). */
  async rejoin(): Promise<boolean> {
    if (this.stopped) return false;
    try {
      const { error } = await this.client.rpc('rejoin_room', { p_room_id: this.roomId });
      if (error) return false;
      this.selfStatus = 'APPROVED';
      await this.refresh();
      return true;
    } catch {
      return false;
    }
  }

  /** Keluar sukarela dari room (T-42). */
  async leave(): Promise<boolean> {
    if (this.stopped) return false;
    try {
      const { error } = await this.client.rpc('leave_room', { p_room_id: this.roomId });
      if (error) return false;
      this.selfStatus = 'LEFT';
      this.emit();
      return true;
    } catch {
      return false;
    }
  }

  private handleSubscribeStatus(status: string): void {
    if (this.stopped) return;

    if (status === 'SUBSCRIBED') {
      this.lastError = null;
      this.setStatus('connected');
      void this.refresh();
      return;
    }
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      this.setStatus('error');
      this.setError('REALTIME_ERROR');
      return;
    }
    if (status === 'CLOSED') this.setStatus('closed');
  }

  private async runBackfill(): Promise<void> {
    try {
      if (this.store.getLastServerId() <= 0) {
        // Riwayat awal: 50 pesan terakhir. Pesan yang lebih lama dimuat oleh
        // paginasi riwayat (T-41), bukan oleh backfill realtime.
        const { data, error } = await this.client.rpc<ChatMessage[] | ChatMessage>(
          'list_messages',
          {
            p_room_id: this.roomId,
            p_after_id: null,
            p_limit: INITIAL_PAGE_SIZE,
          },
        );

        if (this.stopped) return;
        if (error) {
          this.setError(error.message);
          return;
        }

        const rows = toArray(data);
        if (rows.length < INITIAL_PAGE_SIZE) {
          this.hasMoreHistory = false;
        }
        this.store.addServerMany(rows);
        this.historyLoaded = true;
        this.lastError = null;
        this.emit();
        return;
      }

      let cursor = this.store.getLastServerId();
      for (let page = 0; page < MAX_BACKFILL_PAGES; page += 1) {
        const { data, error } = await this.client.rpc<ChatMessage[] | ChatMessage>(
          'list_messages',
          {
            p_room_id: this.roomId,
            p_after_id: cursor,
            p_limit: this.pageSize,
          },
        );

        if (this.stopped) return;
        if (error) {
          this.setError(error.message);
          return;
        }

        const rows = toArray(data);
        if (rows.length === 0) break;
        this.store.addServerMany(rows);

        const next = this.store.getLastServerId();
        if (next <= cursor) break;
        cursor = next;
        if (rows.length < this.pageSize) break;
      }

      this.historyLoaded = true;
      this.lastError = null;
      this.emit();
    } catch {
      this.setError('REALTIME_ERROR');
    }
  }

  private handleMessage(raw: Record<string, unknown>): void {
    if (!isChatMessage(raw) || raw.room_id !== this.roomId) return;
    this.store.addServer(raw);
    this.emit();
  }

  private handleMember(raw: Record<string, unknown>): void {
    if (!isRoomMember(raw)) return;
    if (raw.room_id && raw.room_id !== this.roomId) return;
    this.members.set(raw.id, raw);
    if (raw.id === this.memberId) this.selfStatus = raw.status;
    this.emit();
  }

  private setStatus(status: RealtimeConnectionStatus): void {
    this.status = status;
    this.emit();
  }

  private setError(code: string): void {
    this.lastError = { code, at: this.now().toISOString() };
    this.emit();
  }

  private emit(): void {
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener();
  }

  private buildSnapshot(): RoomRealtimeSnapshot {
    return {
      status: this.status,
      messages: this.store.getMessages(),
      members: [...this.members.values()].sort(compareMembers),
      selfStatus: this.selfStatus,
      historyLoaded: this.historyLoaded,
      hasMoreHistory: this.hasMoreHistory,
      isLoadingOlder: this.isLoadingOlder,
      typingCount: this.activeTypers.size,
      lastError: this.lastError,
    };
  }
}

/** Boundary aman: SupabaseClient asli dipetakan ke subset struktural yang dites. */
export function createRoomRealtime(options: CreateRoomRealtimeOptions): RoomRealtime {
  return new RoomRealtime({
    ...options,
    client: options.client as unknown as RealtimeClientLike,
  });
}

function toArray<T>(data: T[] | T | null): T[] {
  if (data === null) return [];
  return Array.isArray(data) ? data : [data];
}

function compareMembers(a: RoomMember, b: RoomMember): number {
  const byCreated = (a.created_at ?? '').localeCompare(b.created_at ?? '');
  if (byCreated !== 0) return byCreated;
  return a.id.localeCompare(b.id);
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === 'number' &&
    typeof row.room_id === 'string' &&
    (row.sender_type === 'HOST' || row.sender_type === 'GUEST') &&
    (row.member_id === null || typeof row.member_id === 'string') &&
    typeof row.sender_name === 'string' &&
    (row.sender_badge === null || row.sender_badge === 'HOST' || row.sender_badge === 'VERIFIED') &&
    typeof row.content === 'string' &&
    typeof row.client_msg_id === 'string' &&
    typeof row.created_at === 'string'
  );
}

function isRoomMember(value: unknown): value is RoomMember {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === 'string' &&
    typeof row.handle === 'string' &&
    typeof row.handle_verified === 'boolean' &&
    typeof row.status === 'string' &&
    MEMBER_STATUSES.has(row.status as MemberStatus) &&
    (row.room_id === undefined || typeof row.room_id === 'string')
  );
}
