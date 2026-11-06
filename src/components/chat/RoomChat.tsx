import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getBrowserClient } from '../../lib/supabase/browser';
import { useRoomRealtime } from '../../lib/realtime/use-room-realtime';
import { downloadExportTxt, formatExportTxt } from '../../lib/realtime/message-export';
import type { RoomMember } from '../../lib/realtime/types';
import Handle from '../Handle';
import MessageItem from './MessageItem';
import HostMemberPanel from './HostMemberPanel';
import ReportModal from '../ReportModal';
import {
  fetchFullExportMessages,
  fetchPublicRoom,
  fetchRoomMembers,
  formatRemainingTime,
  type RoomMetadata,
} from './chatApi';

export interface RoomChatProps {
  roomId?: string;
  slug?: string;
  mode: 'HOST' | 'GUEST';
  dev?: boolean;
}

export default function RoomChat({ roomId: initialRoomId, slug: initialSlug, mode }: RoomChatProps) {
  const client = useMemo(() => getBrowserClient(), []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomMetadata | null>(null);

  // Identity state
  const [selfHandle, setSelfHandle] = useState<string>('anon');
  const [selfBadge, setSelfBadge] = useState<'HOST' | 'VERIFIED' | null>(mode === 'HOST' ? 'HOST' : null);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [initialMembers, setInitialMembers] = useState<RoomMember[]>([]);

  // Composer state
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);

  // UI state
  const [exporting, setExporting] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const chatLogRef = useRef<HTMLDivElement | null>(null);
  const isAutoScrollEnabled = useRef(true);

  // 1. Initial Load: metadata & identity
  useEffect(() => {
    let alive = true;

    async function init() {
      try {
        setLoading(true);
        setError(null);

        if (mode === 'HOST') {
          if (!initialRoomId) {
            setError('ID room tidak ditemukan.');
            setLoading(false);
            return;
          }

          // Dapatkan profil Host login
          const { data: authData } = await client.auth.getUser();
          if (authData.user) {
            const { data: profile } = await client
              .from('profiles')
              .select('handle, role')
              .eq('user_id', authData.user.id)
              .maybeSingle();

            if (profile && alive) {
              setSelfHandle(profile.handle);
              setSelfBadge('HOST');
            }
          }

          // Dapatkan detail room Host dari DB
          const { data: roomRow, error: roomErr } = await client
            .from('rooms')
            .select('id, slug, name, status, visibility, typing_enabled, max_guests, expires_at, closed_at')
            .eq('id', initialRoomId)
            .maybeSingle();

          if (roomErr || !roomRow) {
            if (alive) setError('Room tidak ditemukan atau kamu bukan pemiliknya.');
            setLoading(false);
            return;
          }

          if (alive) {
            setRoom({
              id: roomRow.id,
              slug: roomRow.slug,
              name: roomRow.name,
              status: roomRow.status === 'ACTIVE' ? 'ACTIVE' : 'CLOSED',
              visibility: roomRow.visibility,
              typingEffective: Boolean(roomRow.typing_enabled),
              maxGuests: roomRow.max_guests,
              expiresAt: roomRow.expires_at,
              closedAt: roomRow.closed_at,
            });
          }

          // Dapatkan daftar member awal untuk Host
          const membersRes = await fetchRoomMembers(roomRow.id);
          if (membersRes.ok && alive) {
            setInitialMembers(membersRes.data);
          }
        } else {
          // GUEST MODE
          if (!initialSlug) {
            setError('Slug room tidak ditemukan.');
            setLoading(false);
            return;
          }

          const publicRes = await fetchPublicRoom(initialSlug);
          if (!publicRes.ok || !publicRes.data) {
            if (alive) setError('Room tidak ditemukan atau sudah kedaluwarsa.');
            setLoading(false);
            return;
          }

          if (alive) {
            setRoom(publicRes.data);
          }

          // Baca konteks join Guest dari sessionStorage
          let storedContext: { memberId?: string; handle?: string } | null = null;
          try {
            const raw = sessionStorage.getItem(`roomJoin:${publicRes.data.id}`);
            if (raw) storedContext = JSON.parse(raw);
          } catch {
            // mode privat
          }

          if (storedContext?.handle && alive) {
            setSelfHandle(storedContext.handle);
          }
          if (storedContext?.memberId && alive) {
            setMemberId(storedContext.memberId);
          }
        }

        if (alive) setLoading(false);
      } catch (err: any) {
        if (alive) {
          setError(err?.message ?? 'Gagal memuat ruang percakapan.');
          setLoading(false);
        }
      }
    }

    void init();
    return () => {
      alive = false;
    };
  }, [client, initialRoomId, initialSlug, mode]);

  // 2. Realtime hook connection
  const realtimeOptions = useMemo(
    () => ({
      client,
      roomId: room?.id ?? '',
      memberId,
      senderType: mode,
      handle: selfHandle,
      senderBadge: selfBadge,
      initialMembers: mode === 'HOST' ? initialMembers : undefined,
      typingEffective: room?.typingEffective,
    }),
    [client, room?.id, room?.typingEffective, memberId, mode, selfHandle, selfBadge, initialMembers],
  );

  const {
    snapshot,
    sendMessage,
    retryMessage,
    loadOlderMessages,
    sendTyping,
    rejoin,
    leave,
  } = useRoomRealtime(realtimeOptions);

  // Auto-scroll saat pesan baru masuk
  useEffect(() => {
    if (!chatLogRef.current || !isAutoScrollEnabled.current) return;
    chatLogRef.current.scrollTop = chatLogRef.current.scrollHeight;
  }, [snapshot.messages]);

  const handleScroll = useCallback(() => {
    if (!chatLogRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatLogRef.current;
    // Jika posisi scroll berada dekat bagian bawah, biarkan auto-scroll aktif
    isAutoScrollEnabled.current = scrollHeight - scrollTop - clientHeight < 60;
  }, []);

  // Handler kirim pesan
  const handleSend = async (e?: React.SyntheticEvent) => {
    if (e) e.preventDefault();
    const text = inputText.trim();
    if (!text || sending) return;

    setSending(true);
    setInputText('');
    isAutoScrollEnabled.current = true;
    await sendMessage(text);
    setSending(false);
  };

  // Handler input teks (memicu typing broadcast)
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    sendTyping();
  };

  // Handler ekspor teks .txt (Host)
  const handleExport = async () => {
    if (!room || exporting) return;
    setExporting(true);

    let messagesToExport = snapshot.messages;
    // Jika pesan lokal belum tentu lengkap, panggil RPC export_messages
    const rpcRes = await fetchFullExportMessages(room.id);
    if (rpcRes.ok && rpcRes.data.length > 0) {
      messagesToExport = rpcRes.data;
    }

    const txtContent = formatExportTxt(room.name, messagesToExport);
    const filename = `chat-${room.slug}-${new Date().toISOString().slice(0, 10)}`;
    downloadExportTxt(filename, txtContent);
    setExporting(false);
  };

  // Handler keluar room (Guest)
  const handleLeave = async () => {
    if (!window.confirm('Kamu yakin ingin keluar dari room ini?')) return;
    await leave();
    if (room) sessionStorage.removeItem(`roomJoin:${room.id}`);
    window.location.assign('/');
  };

  if (loading) {
    return (
      <div className="glass-card" style={{ padding: '32px', textAlign: 'center' }}>
        <p className="help">Menghubungkan ke ruang percakapan…</p>
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="glass-card auth-card" style={{ padding: '24px', textAlign: 'center' }}>
        <h2 style={{ color: 'var(--red-deep, #c53030)' }}>Tidak dapat masuk</h2>
        <p style={{ margin: '12px 0' }}>{error ?? 'Room tidak ditemukan.'}</p>
        <a className="btn btn--primary" href={mode === 'HOST' ? '/dashboard' : '/'}>
          {mode === 'HOST' ? 'Kembali ke Dasbor' : 'Kembali ke Beranda'}
        </a>
      </div>
    );
  }

  const isClosed = room.status === 'CLOSED';
  const isGuestIdle = mode === 'GUEST' && snapshot.selfStatus === 'IDLE';
  const isGuestKicked = mode === 'GUEST' && snapshot.selfStatus === 'KICKED';
  const isGuestLeft = mode === 'GUEST' && snapshot.selfStatus === 'LEFT';
  const isGuestPending = mode === 'GUEST' && snapshot.selfStatus === 'PENDING';

  return (
    <>
      {/* Top status bar */}
      <div className="roombar row row--between">
        <a className="roombar__back" href={mode === 'HOST' ? '/dashboard' : '/rooms'}>
          ← {mode === 'HOST' ? 'Dasbor' : 'Ruang saya'}
        </a>
        <div className="row roombar__chips" aria-label="Status room">
          <span className={`badge ${isClosed ? 'badge--muted' : 'badge--active'}`}>
            {isClosed ? 'TUTUP' : 'AKTIF'}
          </span>
          <span className={`badge ${room.visibility === 'PUBLIC' ? 'badge--pending' : 'badge--muted'}`}>
            {room.visibility === 'PUBLIC' ? 'PUBLIK' : 'PRIVAT'}
          </span>
          <span className="pill">
            kamu: <Handle handle={selfHandle} badge={selfBadge} />
          </span>
          {room.expiresAt && (
            <span className="pill">{formatRemainingTime(room.expiresAt, room.closedAt)}</span>
          )}
          {mode === 'HOST' && room.maxGuests && (
            <span className="pill">
              {snapshot.members.filter((m) => m.status === 'APPROVED').length}/{room.maxGuests} Guest
            </span>
          )}
        </div>
      </div>

      <div className={`grid ${mode === 'HOST' ? 'room-grid' : 'chat-only'}`}>
        {/* Kolom Percakapan Utama */}
        <section className="glass-card chat-panel" aria-label={`Percakapan di ${room.name}`}>
          <div className="chat-head">
            <div>
              <h1 className="chat-head__name">{room.name}</h1>
              <span className="pill">/r/{room.slug}</span>
            </div>
            <div className="row" style={{ gap: '8px' }}>
              {mode === 'HOST' ? (
                <button
                  type="button"
                  className="btn btn--sm btn--ghost"
                  onClick={handleExport}
                  disabled={exporting}
                >
                  {exporting ? 'Mengekspor…' : 'Ekspor .txt'}
                </button>
              ) : (
                <>
                  {room.visibility === 'PUBLIC' && (
                    <button
                      type="button"
                      className="btn btn--sm btn--ghost"
                      onClick={() => setShowReportModal(true)}
                    >
                      Laporkan
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn--sm btn--ghost"
                    onClick={handleLeave}
                    style={{ color: 'var(--red-deep, #c53030)' }}
                  >
                    Keluar
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Alert Status Khusus Guest */}
          {isGuestIdle && (
            <div className="card warn" style={{ padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>Kamu dikeluarkan karena tidak aktif.</strong>
                <p style={{ margin: 0, fontSize: '0.85rem' }}>Kursi kamu telah dilepas.</p>
              </div>
              <button type="button" className="btn btn--sm btn--brand" onClick={() => rejoin()}>
                Masuk Kembali
              </button>
            </div>
          )}

          {isGuestKicked && (
            <div className="card warn" style={{ padding: '12px' }}>
              <strong>Kamu telah dikeluarkan oleh Host dari room ini.</strong>
              <p style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
                Kamu tidak dapat lagi membaca atau mengirim pesan.
              </p>
            </div>
          )}

          {isGuestLeft && (
            <div className="card" style={{ padding: '12px' }}>
              <strong>Kamu telah keluar dari room ini.</strong>
              <a href="/" style={{ display: 'inline-block', marginTop: 4 }}>Kembali ke Beranda</a>
            </div>
          )}

          {isGuestPending && (
            <div className="card warn" style={{ padding: '12px' }}>
              <strong>Menunggu Persetujuan Host.</strong>
              <p style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
                Permintaan bergabungmu sedang ditinjau oleh Host di lobi.
              </p>
            </div>
          )}

          {/* Log Pesan */}
          <div className="chat-log" ref={chatLogRef} onScroll={handleScroll}>
            {snapshot.hasMoreHistory && (
              <div style={{ textAlign: 'center', margin: '8px 0' }}>
                <button
                  type="button"
                  className="btn btn--sm btn--ghost"
                  onClick={() => loadOlderMessages()}
                  disabled={snapshot.isLoadingOlder}
                >
                  {snapshot.isLoadingOlder ? 'Memuat riwayat…' : 'Muat pesan sebelumnya'}
                </button>
              </div>
            )}

            <p className="dy-divider">Riwayat Percakapan</p>

            {snapshot.messages.length === 0 ? (
              <p className="help" style={{ textAlign: 'center', margin: 'auto' }}>
                Belum ada pesan. Mulai obrolan sekarang!
              </p>
            ) : (
              snapshot.messages.map((m) => (
                <MessageItem key={m.client_msg_id || m.id} message={m} onRetry={retryMessage} />
              ))
            )}

            {/* Indikator Mengetik Agregat */}
            {snapshot.typingCount > 0 && (
              <p className="typing">
                <span className="typing__dots">
                  <i />
                  <i />
                  <i />
                </span>
                {snapshot.typingCount === 1
                  ? 'Ada yang sedang mengetik…'
                  : `${snapshot.typingCount} orang sedang mengetik…`}
              </p>
            )}
          </div>

          {/* Composer Input Box */}
          <form className="composer" onSubmit={handleSend}>
            <input
              className="input"
              type="text"
              placeholder={
                isClosed
                  ? 'Room sudah ditutup (read-only)'
                  : isGuestIdle
                  ? 'Klik "Masuk Kembali" untuk mengirim pesan…'
                  : isGuestKicked || isGuestLeft
                  ? 'Tidak dapat mengirim pesan'
                  : `Tulis pesan sebagai ${selfHandle}…`
              }
              value={inputText}
              onChange={handleInputChange}
              maxLength={2000}
              disabled={isClosed || isGuestIdle || isGuestKicked || isGuestLeft || isGuestPending || sending}
              aria-label="Tulis pesan"
            />
            <button
              className="btn btn--primary"
              type="submit"
              disabled={isClosed || isGuestIdle || isGuestKicked || isGuestLeft || isGuestPending || sending || !inputText.trim()}
            >
              {sending ? '…' : 'Kirim'}
            </button>
          </form>

          {room.visibility === 'PUBLIC' && (
            <p className="help chat-note">
              Room publik: isi chat dapat dibaca dan disalin siapa pun yang join.
            </p>
          )}
        </section>

        {/* Panel Samping Khusus Host */}
        {mode === 'HOST' && <HostMemberPanel members={snapshot.members} />}
      </div>

      {/* Modal Lapor untuk Guest di Room Publik */}
      {showReportModal && (
        <ReportModal
          roomName={room.name}
          onClose={() => setShowReportModal(false)}
          onSubmit={async (reason) => {
            setShowReportModal(false);
            try {
              await fetch('/api/rooms/report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomId: room.id, reason }),
              });
              alert('Laporan berhasil dikirim. Terima kasih telah membantu menjaga keamanan.');
            } catch {
              alert('Gagal mengirim laporan.');
            }
          }}
        />
      )}
    </>
  );
}
