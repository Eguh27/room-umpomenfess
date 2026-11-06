import type { ChatMessage } from '../../lib/realtime/types';
import Handle from '../Handle';

interface Props {
  message: ChatMessage;
  onRetry?: (clientMsgId: string) => void;
}

function formatWibTime(dateInput: string): string {
  try {
    const date = new Date(dateInput);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  } catch {
    return '';
  }
}

export default function MessageItem({ message, onRetry }: Props) {
  const isHost = message.sender_type === 'HOST';
  const time = formatWibTime(message.created_at);

  return (
    <article className={`msg ${isHost ? 'msg--host' : ''}`}>
      <span className="msg__meta">
        <Handle handle={message.sender_name} badge={message.sender_badge} />
        {time ? ` · ${time} WIB` : ''}
        {message.sendStatus === 'sending' && (
          <span style={{ marginLeft: 6, fontStyle: 'italic', opacity: 0.7 }}>
            (mengirim…)
          </span>
        )}
      </span>
      <p className="msg__bubble">{message.content}</p>
      {message.sendStatus === 'failed' && (
        <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: 'var(--red-deep, #c53030)' }}>
          <span>Gagal terkirim</span>
          {onRetry && (
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              style={{ padding: '2px 8px', fontSize: '0.75rem' }}
              onClick={() => onRetry(message.client_msg_id)}
            >
              Coba lagi
            </button>
          )}
        </div>
      )}
    </article>
  );
}

