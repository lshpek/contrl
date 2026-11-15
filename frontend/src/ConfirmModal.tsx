import { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

export type ConfirmDialogState = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
};

export default function ConfirmModal({
  dialog,
  busy,
  onClose,
}: {
  dialog: ConfirmDialogState | null;
  busy?: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dialog, busy, onClose]);

  if (!dialog) return null;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="modal-panel" style={{ maxWidth: 420 }}>
        <div className="modal-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: dialog.danger ? 'var(--danger-soft)' : 'var(--accent-soft)',
                color: dialog.danger ? 'var(--danger)' : 'var(--accent)',
                flexShrink: 0,
              }}
            >
              <AlertTriangle size={18} />
            </span>
            <h3 style={{ margin: 0 }}>{dialog.title}</h3>
          </div>
          <button className="icon-button" onClick={onClose} disabled={busy} aria-label="Закрыть">
            <X size={16} />
          </button>
        </div>

        <p style={{ margin: '10px 0 18px', color: 'var(--text-secondary)', fontSize: 13.5, lineHeight: 1.55 }}>
          {dialog.message}
        </p>

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>
            {dialog.cancelLabel ?? 'Отмена'}
          </button>
          <button
            type="button"
            className={dialog.danger ? 'danger-button' : 'primary-button'}
            disabled={busy}
            onClick={() => void dialog.onConfirm()}
          >
            {busy ? 'Выполнение…' : (dialog.confirmLabel ?? 'Подтвердить')}
          </button>
        </div>
      </div>
    </div>
  );
}
