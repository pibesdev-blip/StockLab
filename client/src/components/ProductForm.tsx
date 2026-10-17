import { useState, type ChangeEvent, type FormEvent } from 'react';
import { ApiError } from '../api/client';
import type { Category, Product, ProductInput } from '../types';
import {
  toProductInput,
  validateProduct,
  type ProductFormErrors,
  type ProductFormValues,
} from '../utils/validateProduct';
import { Modal } from './Modal';

interface Props {
  product: Product | null;
  categories: Category[];
  onSubmit: (input: ProductInput) => Promise<void>;
  onClose: () => void;
}

function initialValues(product: Product | null): ProductFormValues {
  return {
    name: product?.name ?? '',
    sku: product?.sku ?? '',
    description: product?.description ?? '',
    price: product ? String(product.price) : '',
    quantity: product ? String(product.quantity) : '0',
    minStock: product ? String(product.minStock) : '5',
    categoryId: product ? String(product.categoryId) : '',
  };
}

export function ProductForm({ product, categories, onSubmit, onClose }: Props) {
  const [values, setValues] = useState<ProductFormValues>(() => initialValues(product));
  const [errors, setErrors] = useState<ProductFormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function handleChange(e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const name = e.target.name as keyof ProductFormValues;
    setValues((prev) => ({ ...prev, [name]: e.target.value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const found = validateProduct(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setSaving(true);
    setServerError(null);
    try {
      await onSubmit(toProductInput(values));
    } catch (err) {
      if (err instanceof ApiError && Array.isArray(err.details)) {
        const fieldErrors: ProductFormErrors = {};
        for (const d of err.details) fieldErrors[d.field as keyof ProductFormValues] = d.message;
        setErrors(fieldErrors);
      }
      setServerError(err instanceof Error ? err.message : 'No se pudo guardar el producto.');
    } finally {
      setSaving(false);
    }
  }

  const field = (name: keyof ProductFormValues) => ({
    id: `pf-${name}`,
    name,
    value: values[name],
    onChange: handleChange,
    className: 'input',
    'aria-invalid': Boolean(errors[name]),
  });

  const error = (name: keyof ProductFormValues) =>
    errors[name] ? <span className="field__error">{errors[name]}</span> : null;

  return (
    <Modal title={product ? 'Editar producto' : 'Nuevo producto'} onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate className="form">
        {serverError && (
          <div className="alert alert--error" role="alert">
            {serverError}
          </div>
        )}
        <div className="form__grid">
          <div className="field field--wide">
            <label htmlFor="pf-name">Nombre</label>
            <input {...field('name')} autoFocus />
            {error('name')}
          </div>
          <div className="field">
            <label htmlFor="pf-sku">SKU</label>
            <input {...field('sku')} placeholder="ELE-010" />
            {error('sku')}
          </div>
          <div className="field">
            <label htmlFor="pf-categoryId">Categoría</label>
            <select {...field('categoryId')}>
              <option value="">Seleccioná…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {error('categoryId')}
          </div>
          <div className="field">
            <label htmlFor="pf-price">Precio</label>
            <input {...field('price')} inputMode="decimal" placeholder="0.00" />
            {error('price')}
          </div>
          <div className="field">
            <label htmlFor="pf-quantity">Cantidad</label>
            <input {...field('quantity')} inputMode="numeric" />
            {error('quantity')}
          </div>
          <div className="field">
            <label htmlFor="pf-minStock">Stock mínimo</label>
            <input {...field('minStock')} inputMode="numeric" />
            {error('minStock')}
          </div>
          <div className="field field--wide">
            <label htmlFor="pf-description">Descripción (opcional)</label>
            <textarea {...field('description')} rows={3} />
            {error('description')}
          </div>
        </div>
        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="btn" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
