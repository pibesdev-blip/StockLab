import { useEffect, type ReactNode } from 'react';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: 'sm' | 'md';
}

export function Modal({ title, onClose, children, size = 'md' }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal modal--${size}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <header className="modal__header">
          <h2 id="modal-title">{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
