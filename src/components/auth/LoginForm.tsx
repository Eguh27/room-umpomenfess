import { useState, type SyntheticEvent } from 'react';
import TurnstileBox from '../TurnstileBox';

type Props = {
  busy: boolean;
  error: string | null;
  dev: boolean;
  siteKey: string | undefined;
  token: string | null;
  widgetNonce: number;
  onToken: (token: string | null) => void;
  onSubmit: (email: string, password: string, turnstileToken: string) => void;
};

export default function LoginForm({
  busy,
  error,
  dev,
  siteKey,
  token,
  widgetNonce,
  onToken,
  onSubmit,
}: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setLocalError('Isi email dan password dulu.');
      return;
    }
    setLocalError(null);
    onSubmit(trimmedEmail, password, token ?? '');
  };

  const shownError = localError ?? error;
  const canSubmit = !busy && (token !== null || (dev && !siteKey));

  return (
    <form className="glass-card auth__card" noValidate onSubmit={submit}>
      <div className="field">
        <label htmlFor="login-email">Email</label>
        <input
          className="input"
          type="email"
          id="login-email"
          name="email"
          autoComplete="email"
          value={email}
          onInput={(event) => setEmail(event.currentTarget.value)}
          disabled={busy}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="login-password">Password</label>
        <input
          className="input"
          type="password"
          id="login-password"
          name="password"
          autoComplete="current-password"
          value={password}
          onInput={(event) => setPassword(event.currentTarget.value)}
          disabled={busy}
          required
        />
        <p className="help">Bukan password room — password room dibagikan Host lewat link.</p>
      </div>

      {shownError !== null && (
        <div className="error-note" role="alert">
          {shownError}
        </div>
      )}

      <TurnstileBox key={widgetNonce} siteKey={siteKey} dev={dev} onToken={onToken} />

      <button
        className="btn btn--primary btn--block"
        type="submit"
        disabled={!canSubmit}
        aria-busy={busy}
      >
        {busy ? 'Memeriksa…' : 'Masuk'}
      </button>
      <p className="help">
        {token === null && !(dev && !siteKey)
          ? 'Selesaikan verifikasi manusia untuk mengaktifkan tombol.'
          : 'Akun ini untuk Host dan Guest login. Guest tanpa akun cukup membuka link room.'}
      </p>
    </form>
  );
}
