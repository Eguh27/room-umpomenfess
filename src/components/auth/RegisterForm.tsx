import { useState, type SyntheticEvent } from 'react';
import TurnstileBox from '../TurnstileBox';
import { passwordProblem } from './authMessages';

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

export default function RegisterForm({
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
  const [confirm, setConfirm] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setLocalError('Isi alamat email dulu.');
      return;
    }
    const problem = passwordProblem(password);
    if (problem !== null) {
      setLocalError(problem);
      return;
    }
    if (password !== confirm) {
      setLocalError('Dua isian password belum sama.');
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
        <label htmlFor="register-email">Email</label>
        <input
          className="input"
          type="email"
          id="register-email"
          name="email"
          autoComplete="email"
          value={email}
          onInput={(event) => setEmail(event.currentTarget.value)}
          disabled={busy}
          required
        />
        <p className="help">Tidak ditampilkan ke Guest. Dipakai untuk konfirmasi akun.</p>
      </div>
      <div className="field">
        <label htmlFor="register-password">Password</label>
        <input
          className="input"
          type="password"
          id="register-password"
          name="password"
          autoComplete="new-password"
          minLength={8}
          value={password}
          onInput={(event) => setPassword(event.currentTarget.value)}
          disabled={busy}
          required
        />
        <p className="help">
          <strong>Minimal 8 karakter.</strong> Ini password akun, berbeda dari password room.
        </p>
      </div>
      <div className="field">
        <label htmlFor="register-confirm">Ulangi password</label>
        <input
          className="input"
          type="password"
          id="register-confirm"
          name="confirm"
          autoComplete="new-password"
          minLength={8}
          value={confirm}
          onInput={(event) => setConfirm(event.currentTarget.value)}
          disabled={busy}
          required
        />
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
        {busy ? 'Mendaftarkan…' : 'Daftar'}
      </button>
      <p className="help">
        Setelah daftar, kami kirim email konfirmasi. Email terkonfirmasi wajib untuk membuat room
        publik.
      </p>
    </form>
  );
}
