import { useCallback, useEffect, useRef, useState } from 'react';
import { joinRoom } from './joinApi';
import { feedbackFor, formErrorFor, type JoinFeedback, type JoinSuccess } from './joinTypes';
import { ApprovedStage, BlockedStage, DisclaimerStage, PendingStage } from './JoinScreens';
import JoinForm from './JoinForm';
import { PUBLIC_TURNSTILE_SITE_KEY } from 'astro:env/client';

type View = 'disclaimer' | 'form' | 'approved' | 'pending' | 'blocked';

type Props = { slug: string; dev: boolean };

/** Konteks keikutsertaan untuk halaman chat (dipakai T-53). */
function saveJoinContext(success: JoinSuccess): void {
  try {
    sessionStorage.setItem(
      `roomJoin:${success.roomId}`,
      JSON.stringify({
        memberId: success.memberId,
        displayName: success.displayName,
        status: success.status,
      }),
    );
  } catch {
    // Storage bisa penuh atau ditutup (mode privat) — bukan alasan gagal masuk.
  }
}

export default function JoinRoom({ slug, dev }: Props) {
  const siteKey = PUBLIC_TURNSTILE_SITE_KEY || undefined;
  const [view, setView] = useState<View>('disclaimer');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [widgetNonce, setWidgetNonce] = useState(0);
  const [token, setToken] = useState<string | null>(null);
  const [success, setSuccess] = useState<JoinSuccess | null>(null);
  const [feedback, setFeedback] = useState<{
    item: JoinFeedback;
    countdownUntil: number | null;
  } | null>(null);

  const lastPasswordRef = useRef<string | null>(null);
  const autoRetryRef = useRef(false);

  const resetWidget = useCallback(() => {
    setToken(null);
    setWidgetNonce((n) => n + 1);
    setFormError(null);
    setView('form');
  }, []);

  const submit = useCallback(
    async (password: string, turnstileToken: string) => {
      if (busy) return;
      setBusy(true);
      setFormError(null);
      lastPasswordRef.current = password;

      const outcome = await joinRoom(slug, password, turnstileToken);

      setBusy(false);
      if (outcome.ok) {
        setToken(null);
        saveJoinContext(outcome);
        setSuccess(outcome);
        setView(outcome.status === 'APPROVED' ? 'approved' : 'pending');
        return;
      }

      const inline = formErrorFor(outcome.code);
      if (inline !== null) {
        resetWidget();
        setFormError(inline);
        return;
      }
      const item = feedbackFor(outcome.code);
      if (item !== null) {
        setToken(null);
        setFeedback({
          item,
          countdownUntil:
            outcome.retryAfter !== undefined ? Date.now() + outcome.retryAfter * 1000 : null,
        });
        setView('blocked');
        return;
      }
      resetWidget();
    },
    [busy, slug, resetWidget],
  );

  /** Pending: segarkan status → widget baru, lalu kirim ulang otomatis. */
  const autoRefreshPending = useCallback(() => {
    autoRetryRef.current = true;
    resetWidget();
  }, [resetWidget]);

  useEffect(() => {
    if (!autoRetryRef.current || token === null || view !== 'form' || busy) return;
    autoRetryRef.current = false;
    const pw = lastPasswordRef.current;
    if (pw !== null) void submit(pw, token);
  }, [token, view, busy, submit]);

  return (
    <div className="auth-stage">
      <div className="stage-head">
        <span className="st-tag">↖ masuk room</span>
        <span className="pill">/r/{slug}</span>
      </div>

      {view === 'disclaimer' && <DisclaimerStage slug={slug} onContinue={resetWidget} />}

      {view === 'form' && (
        <JoinForm
          dev={dev}
          siteKey={siteKey}
          busy={busy}
          formError={formError}
          onSubmit={(password, turnstileToken) => void submit(password, turnstileToken)}
          widgetNonce={widgetNonce}
          onWidgetTokenChange={setToken}
        />
      )}

      {view === 'approved' && success !== null && <ApprovedStage success={success} slug={slug} />}

      {view === 'pending' && success !== null && (
        <PendingStage success={success} busy={busy} onRefresh={autoRefreshPending} />
      )}

      {view === 'blocked' && feedback !== null && (
        <BlockedStage
          feedback={feedback.item}
          countdownUntil={feedback.countdownUntil}
          onRetry={resetWidget}
        />
      )}
    </div>
  );
}
