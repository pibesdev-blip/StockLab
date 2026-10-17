import { useState } from 'react';
import { Modal } from './Modal';

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export function ConfirmDialog({ title, message, confirmLabel = 'Eliminar', onConfirm, onCancel }: Props) {
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={title} onClose={onCancel} size="sm">
      <p className="modal__text">{message}</p>
      <div className="modal__actions">
        <button className="btn btn--ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
        <button className="btn btn--danger" onClick={handleConfirm} disabled={busy}>
          {busy ? 'Eliminando…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
