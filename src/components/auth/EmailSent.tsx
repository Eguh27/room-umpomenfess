import TurnstileBox from '../TurnstileBox';

type Props = {
  email: string;
  busy: boolean;
  error: string | null;
  notice: string | null;
  dev: boolean;
  siteKey: string | undefined;
  token: string | null;
  widgetNonce: number;
  onToken: (token: string | null) => void;
  onResend: (turnstileToken: string) => void;
};

export default function EmailSent({
  email,
  busy,
  error,
  notice,
  dev,
  siteKey,
  token,
  widgetNonce,
  onToken,
  onResend,
}: Props) {
  const canResend = !busy && (token !== null || (dev && !siteKey));

  return (
    <section className="glass-card auth__card" aria-labelledby="email-sent-title">
      <span className="badge badge--pending">CEK EMAIL</span>
      <h2 id="email-sent-title">Konfirmasi alamat email</h2>
      <p className="auth__sub">
        Kami mengirim tautan konfirmasi ke <strong>{email}</strong>. Buka tautan itu, lalu masuk
        kembali. Tautan juga bisa kedaluwarsa; kirim ulang bila perlu.
      </p>

      {notice !== null && (
        <div className="auth__notice" role="status">
          {notice}
        </div>
      )}
      {error !== null && (
        <div className="error-note" role="alert">
          {error}
        </div>
      )}

      <TurnstileBox key={widgetNonce} siteKey={siteKey} dev={dev} onToken={onToken} />

      <button
        className="btn btn--ghost btn--block"
        type="button"
        disabled={!canResend}
        aria-busy={busy}
        onClick={() => onResend(token ?? '')}
      >
        {busy ? 'Mengirim…' : 'Kirim ulang email konfirmasi'}
      </button>
      <p className="auth__alt">
        Sudah dikonfirmasi? <a href="/login">Masuk</a> · Salah alamat?{' '}
        <a href="/register">Daftar ulang</a>
      </p>
    </section>
  );
}
