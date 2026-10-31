/**
 * Modal laporan room (T-32; D-20). Island ringan: pilih alasan → kirim.
 * Pengiriman nyata ke `POST /api/rooms/report` menyusul (T-25); sampai
 * kontrak hidup, parent memutuskan aksi onSubmit (pratinjau UI).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { reportReasons, type ReportReason } from './reportTypes';

interface Props {
  roomName: string;
  onClose: () => void;
  /** Dipanggil dengan alasan yang dipilih setelah tombol kirim ditekan. */
  onSubmit?: (reason: ReportReason) => void;
}

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), [href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function ReportModal({ roomName, onClose, onSubmit }: Props) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const dialog = dialogRef.current;
      if (!dialog) return;
      const nodes = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (node) => node.getClientRects().length > 0,
      );
      if (nodes.length === 0) return;

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, [onClose]);

  const chosen = useMemo(() => reportReasons.find((r) => r.code === reason), [reason]);

  return (
    <div
      className="report-overlay"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="report-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-modal-title"
        aria-describedby="report-modal-desc"
      >
        <h2 id="report-modal-title">Laporkan room</h2>
        <p id="report-modal-desc" className="help">
          Laporan untuk <strong>{roomName}</strong> masuk antrean tinjauan Admin. Identitasmu tidak
          ditampilkan ke Host atau Admin; server menyimpan penanda unik agar satu pelapor dihitung
          sekali untuk room yang sama.
        </p>
        <p className="help report-dialog__preview">
          Mode pratinjau: laporan belum dikirim ke server. Pengiriman nyata menyusul saat T-25.
        </p>

        <div className="report-list">
          {reportReasons.map((item) => (
            <label key={item.code} className="report-list__choice">
              <input
                type="radio"
                name="report-reason"
                value={item.code}
                checked={reason === item.code}
                onChange={() => setReason(item.code)}
              />
              <span>
                <span className="report-list__label">{item.label}</span>
                <span className="help">{item.detail}</span>
              </span>
            </label>
          ))}
        </div>

        <div className="report-dialog__row">
          <button ref={closeRef} type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
            Tutup
          </button>
          <button
            type="button"
            className="btn btn--ghost-danger btn--sm"
            disabled={reason === null}
            onClick={() => {
              if (reason) onSubmit?.(reason);
            }}
          >
            Kirim laporan
          </button>
        </div>
        {chosen && <p className="help report-dialog__hint">Dipilih: {chosen.label}.</p>}
      </section>
    </div>
  );
}
