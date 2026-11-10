import type {
  PostgresChangeFilter,
  RealtimeChannelLike,
  RealtimeClientLike,
  RpcResult,
} from './types';

type RowCallback = (payload: { new: Record<string, unknown> }) => void;
type BroadcastCallback = (payload: { payload: Record<string, unknown> }) => void;
type PresenceCallback = (payload?: unknown) => void;

/** Channel tiruan: merekam listener dan bisa memicu event secara manual. */
export class FakeChannel implements RealtimeChannelLike {
  readonly handlers: Array<{ filter: PostgresChangeFilter; callback: RowCallback }> = [];
  readonly broadcastHandlers: Array<{ event: string; callback: BroadcastCallback }> = [];
  readonly presenceHandlers: Array<{ event: string; callback: PresenceCallback }> = [];
  readonly sentBroadcasts: Array<{ event: string; payload?: Record<string, unknown> }> = [];
  statusCallback: ((status: string, error?: Error) => void) | null = null;
  unsubscribed = false;
  trackedState: Record<string, unknown> | null = null;
  mockPresenceState: Record<string, unknown[]> = {};

  on(
    event: 'postgres_changes' | 'broadcast' | 'presence',
    filter: PostgresChangeFilter | { event: string },
    callback: any,
  ): RealtimeChannelLike {
    if (event === 'broadcast') {
      this.broadcastHandlers.push({ event: (filter as { event: string }).event, callback });
    } else if (event === 'presence') {
      this.presenceHandlers.push({ event: (filter as { event: string }).event, callback });
    } else {
      this.handlers.push({ filter: filter as PostgresChangeFilter, callback });
    }
    return this;
  }

  send(message: {
    type: 'broadcast';
    event: string;
    payload?: Record<string, unknown>;
  }): Promise<unknown> {
    this.sentBroadcasts.push({ event: message.event, payload: message.payload });
    return Promise.resolve('ok');
  }

  track(state: Record<string, unknown>): Promise<unknown> {
    this.trackedState = state;
    return Promise.resolve('ok');
  }

  untrack(): Promise<unknown> {
    this.trackedState = null;
    return Promise.resolve('ok');
  }

  presenceState<T = Record<string, unknown>>(): Record<string, T[]> {
    return this.mockPresenceState as Record<string, T[]>;
  }

  subscribe(callback: (status: string, error?: Error) => void): RealtimeChannelLike {
    this.statusCallback = callback;
    return this;
  }

  unsubscribe(): Promise<unknown> {
    this.unsubscribed = true;
    return Promise.resolve('ok');
  }

  emitRow(table: string, row: object): void {
    for (const handler of this.handlers) {
      if (handler.filter.table === table) {
        handler.callback({ new: row as Record<string, unknown> });
      }
    }
  }

  emitBroadcast(event: string, payload: Record<string, unknown>): void {
    for (const handler of this.broadcastHandlers) {
      if (handler.event === event) {
        handler.callback({ payload });
      }
    }
  }

  emitPresence(event: 'sync' | 'join' | 'leave', payload: unknown = {}): void {
    for (const handler of this.presenceHandlers) {
      if (handler.event === event) {
        handler.callback(payload);
      }
    }
  }

  emitStatus(status: string): void {
    this.statusCallback?.(status);
  }
}

export type RpcHandler = (name: string, args: Record<string, unknown>) => RpcResult<unknown>;

/** Client tiruan: tidak ada jaringan; RPC dijawab oleh rpcHandler. */
export class FakeClient implements RealtimeClientLike {
  readonly channelNames: string[] = [];
  readonly channels: FakeChannel[] = [];
  readonly rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  readonly removedChannels: FakeChannel[] = [];
  rpcHandler: RpcHandler = () => ({ data: null, error: null });

  channel(name: string): RealtimeChannelLike {
    this.channelNames.push(name);
    const channel = new FakeChannel();
    this.channels.push(channel);
    return channel;
  }

  rpc<T = unknown>(name: string, args: Record<string, unknown>): Promise<RpcResult<T>> {
    this.rpcCalls.push({ name, args });
    return Promise.resolve(this.rpcHandler(name, args) as RpcResult<T>);
  }

  removeChannel(channel: RealtimeChannelLike): Promise<unknown> {
    this.removedChannels.push(channel as FakeChannel);
    return Promise.resolve('ok');
  }
}
