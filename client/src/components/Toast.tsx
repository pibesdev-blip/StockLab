import { useEffect } from 'react';

export interface ToastMessage {
  id: number;
  type: 'success' | 'error';
  text: string;
}

interface Props {
  toast: ToastMessage | null;
  onDismiss: () => void;
}

export function Toast({ toast, onDismiss }: Props) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onDismiss, 3500);
    return () => clearTimeout(timer);
  }, [toast, onDismiss]);

  if (!toast) return null;
  return (
    <div className={`toast toast--${toast.type}`} role="status">
      {toast.text}
    </div>
  );
}
