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
      <div className="modal-panel confirm-modal-panel">
        <div className="confirm-modal-head">
          <div className="confirm-modal-title">
            <span className={`confirm-modal-icon ${dialog.danger ? 'is-danger' : ''}`}>
              <AlertTriangle size={18} />
            </span>
            <h3>{dialog.title}</h3>
          </div>
          <button type="button" className="icon-button" onClick={onClose} disabled={busy} aria-label="Закрыть">
            <X size={16} />
          </button>
        </div>

        <p className="confirm-modal-text">{dialog.message}</p>

        <div className="confirm-modal-actions">
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
