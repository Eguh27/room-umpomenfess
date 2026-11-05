export type HandleBadge = 'HOST' | 'VERIFIED';

type Props = {
  /** Handle dari server; selalu dirender sebagai teks biasa. */
  handle: string;
  /** Lencana datang dari server (`sender_badge`/`handle_verified`), bukan dari teks nama. */
  badge?: HandleBadge | null;
  className?: string;
};

/** Nama tampilan tunggal untuk pesan, daftar member, dan ekspor. */
export default function Handle({ handle, badge = null, className }: Props) {
  return (
    <span className={className ? `handle ${className}` : 'handle'}>
      <span className="handle__name">{handle}</span>
      {badge !== null && (
        <span className={`handle__badge handle__badge--${badge.toLowerCase()}`}>{badge}</span>
      )}
    </span>
  );
}
