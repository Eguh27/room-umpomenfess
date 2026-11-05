import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Berlangganan Postgres Changes `messages` sebagai user tertentu.
 * Dipakai untuk membuktikan RLS Realtime, bukan untuk menguji UI.
 */
export async function watchRoomMessages({ config, session, roomId, timeoutMs = 10_000 }) {
  const client = createClient(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 20 } },
  });

  const { error: sessionError } = await client.auth.setSession({
    access_token: session.token,
    refresh_token: session.refreshToken,
  });
  if (sessionError) {
    client.realtime.disconnect();
    throw new Error(`gagal setSession Realtime: ${sessionError.message}`);
  }

  const events = [];
  const channel = client.channel(`t61:${roomId}:${randomUUID()}`);
  channel.on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `room_id=eq.${roomId}`,
    },
    (payload) => {
      if (payload?.new) events.push(payload.new);
    },
  );

  const status = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout subscribe Realtime')), timeoutMs);
    channel.subscribe((nextStatus) => {
      if (nextStatus === 'SUBSCRIBED') {
        clearTimeout(timer);
        resolve(nextStatus);
      } else if (nextStatus === 'CHANNEL_ERROR' || nextStatus === 'TIMED_OUT') {
        clearTimeout(timer);
        reject(new Error(`Realtime ${nextStatus}`));
      }
    });
  });

  return {
    status,
    events,
    async close() {
      try {
        await client.removeChannel(channel);
      } catch {
        // cleanup best-effort
      }
      try {
        client.realtime.disconnect();
      } catch {
        // cleanup best-effort
      }
    },
  };
}
