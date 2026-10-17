import { useState, type FormEvent } from 'react';
import type { Category } from '../types';
import { Modal } from './Modal';

interface Props {
  categories: Category[];
  onCreate: (name: string) => Promise<void>;
  onDelete: (category: Category) => Promise<void>;
  onClose: () => void;
}

export function CategoryManager({ categories, onCreate, onDelete, onClose }: Props) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ocurrió un error.');
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError('Ingresá un nombre.');
    if (trimmed.length > 60) return setError('Máximo 60 caracteres.');
    void run(async () => {
      await onCreate(trimmed);
      setName('');
    });
  }

  return (
    <Modal title="Categorías" onClose={onClose} size="sm">
      <form className="inline-form" onSubmit={handleSubmit} noValidate>
        <input
          className="input"
          placeholder="Nueva categoría"
          aria-label="Nombre de la nueva categoría"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn" disabled={busy}>
          Agregar
        </button>
      </form>
      {error && (
        <div className="alert alert--error" role="alert">
          {error}
        </div>
      )}
      <ul className="category-list">
        {categories.map((c) => (
          <li key={c.id}>
            <span>
              {c.name} <small>({c.productCount} productos)</small>
            </span>
            <button
              className="btn btn--ghost btn--sm btn--danger-text"
              disabled={busy || c.productCount > 0}
              title={c.productCount > 0 ? 'Tiene productos asociados' : undefined}
              onClick={() => run(() => onDelete(c))}
              aria-label={`Eliminar categoría ${c.name}`}
            >
              Eliminar
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
