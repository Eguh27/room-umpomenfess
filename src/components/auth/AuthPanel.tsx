import { useCallback, useEffect, useRef, useState } from 'react';
import {
  challengeTotp,
  currentSession,
  destinationAfterAuth,
  resendConfirmation,
  signIn,
  signUp,
  type TotpFactor,
} from './authApi';
import { authErrorFor, emailNotConfirmed } from './authMessages';
import { syncSessionCookie } from './sessionCookie';
import EmailSent from './EmailSent';
import LoginForm from './LoginForm';
import MfaChallengeForm from './MfaChallengeForm';
import RegisterForm from './RegisterForm';

type Props = {
  mode: 'login' | 'register';
  next: string;
  dev: boolean;
  siteKey: string | undefined;
};

type View = 'form' | 'email-sent' | 'mfa';

export default function AuthPanel({ mode, next, dev, siteKey }: Props) {
  const [view, setView] = useState<View>('form');
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [factors, setFactors] = useState<TotpFactor[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [widgetNonce, setWidgetNonce] = useState(0);
  const redirecting = useRef(false);

  const go = useCallback((href: string) => {
    if (redirecting.current) return;
    redirecting.current = true;
    window.location.assign(href);
  }, []);

  const finish = useCallback(async () => {
    const destination = await destinationAfterAuth(next);
    if (destination.kind === 'mfa') {
      setFactors(destination.factors);
      setView('mfa');
      return;
    }
    go(destination.href);
  }, [go, next]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const session = await currentSession();
      if (!alive) return;
      if (!session) {
        setChecking(false);
        return;
      }
      syncSessionCookie(session);
      await finish();
      if (alive) setChecking(false);
    })();
    return () => {
      alive = false;
    };
  }, [finish]);

  const resetWidget = useCallback(() => {
    setToken(null);
    setWidgetNonce((value) => value + 1);
  }, []);

  const handleLogin = useCallback(
    async (value: string, password: string, turnstileToken: string) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      const result = await signIn(value, password, turnstileToken);
      setBusy(false);
      if (!result.ok) {
        setError(authErrorFor(result.error));
        resetWidget();
        if (emailNotConfirmed(result.error)) {
          setEmail(value);
          setNotice(null);
          setView('email-sent');
        }
        return;
      }
      setEmail(value);
      await finish();
    },
    [busy, finish, resetWidget],
  );

  const handleRegister = useCallback(
    async (value: string, password: string, turnstileToken: string) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      const result = await signUp(value, password, turnstileToken, next);
      setBusy(false);
      if (!result.ok) {
        setError(authErrorFor(result.error));
        resetWidget();
        return;
      }
      setEmail(value);
      if (result.session === null) {
        setNotice(null);
        setView('email-sent');
        return;
      }
      await finish();
    },
    [busy, finish, next, resetWidget],
  );

  const handleResend = useCallback(
    async (turnstileToken: string) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      setNotice(null);
      const result = await resendConfirmation(email, turnstileToken, next);
      setBusy(false);
      if (!result.ok) {
        setError(authErrorFor(result.error));
        resetWidget();
        return;
      }
      setNotice('Email konfirmasi baru sudah dikirim. Periksa kotak masuk dan folder spam.');
      resetWidget();
    },
    [busy, email, next, resetWidget],
  );

  const handleMfa = useCallback(
    async (code: string) => {
      const factorId = factors[0]?.id;
      if (!factorId || busy) return;
      setBusy(true);
      setError(null);
      const result = await challengeTotp(factorId, code);
      setBusy(false);
      if (!result.ok) {
        setError(authErrorFor(result.error));
        return;
      }
      await finish();
    },
    [busy, factors, finish],
  );

  if (checking) {
    return (
      <div className="glass-card auth__card" role="status">
        Memeriksa sesi…
      </div>
    );
  }

  if (view === 'email-sent') {
    return (
      <EmailSent
        email={email}
        busy={busy}
        error={error}
        notice={notice}
        dev={dev}
        siteKey={siteKey}
        token={token}
        widgetNonce={widgetNonce}
        onToken={setToken}
        onResend={(turnstileToken) => void handleResend(turnstileToken)}
      />
    );
  }

  if (view === 'mfa') {
    return (
      <MfaChallengeForm
        factorName={factors[0]?.name ?? 'Aplikasi autentikator'}
        busy={busy}
        error={error}
        onSubmit={(code) => void handleMfa(code)}
      />
    );
  }

  if (mode === 'login') {
    return (
      <LoginForm
        busy={busy}
        error={error}
        dev={dev}
        siteKey={siteKey}
        token={token}
        widgetNonce={widgetNonce}
        onToken={setToken}
        onSubmit={(value, password, turnstileToken) =>
          void handleLogin(value, password, turnstileToken)
        }
      />
    );
  }

  return (
    <RegisterForm
      busy={busy}
      error={error}
      dev={dev}
      siteKey={siteKey}
      token={token}
      widgetNonce={widgetNonce}
      onToken={setToken}
      onSubmit={(value, password, turnstileToken) =>
        void handleRegister(value, password, turnstileToken)
      }
    />
  );
}
