import type { ProductInput } from '../types';

export interface ProductFormValues {
  name: string;
  sku: string;
  description: string;
  price: string;
  quantity: string;
  minStock: string;
  categoryId: string;
}

export type ProductFormErrors = Partial<Record<keyof ProductFormValues, string>>;

const SKU_RE = /^[A-Za-z0-9-]+$/;
const PRICE_RE = /^\d+(\.\d{1,2})?$/;
const INT_RE = /^\d+$/;

export function validateProduct(values: ProductFormValues): ProductFormErrors {
  const errors: ProductFormErrors = {};
  const name = values.name.trim();
  const sku = values.sku.trim();
  const price = values.price.trim().replace(',', '.');

  if (!name) errors.name = 'El nombre es obligatorio.';
  else if (name.length > 120) errors.name = 'Máximo 120 caracteres.';

  if (!sku) errors.sku = 'El SKU es obligatorio.';
  else if (!SKU_RE.test(sku)) errors.sku = 'Solo letras, números y guiones.';
  else if (sku.length > 40) errors.sku = 'Máximo 40 caracteres.';

  if (values.description.trim().length > 500) errors.description = 'Máximo 500 caracteres.';

  if (!price) errors.price = 'El precio es obligatorio.';
  else if (!PRICE_RE.test(price)) errors.price = 'Precio inválido (hasta 2 decimales, sin negativos).';

  if (!values.quantity.trim()) errors.quantity = 'La cantidad es obligatoria.';
  else if (!INT_RE.test(values.quantity.trim())) errors.quantity = 'Debe ser un entero mayor o igual a 0.';

  if (!values.minStock.trim()) errors.minStock = 'El stock mínimo es obligatorio.';
  else if (!INT_RE.test(values.minStock.trim())) errors.minStock = 'Debe ser un entero mayor o igual a 0.';

  if (!values.categoryId) errors.categoryId = 'Elegí una categoría.';

  return errors;
}

export function toProductInput(values: ProductFormValues): ProductInput {
  return {
    name: values.name.trim(),
    sku: values.sku.trim().toUpperCase(),
    description: values.description.trim() || null,
    price: Number(values.price.trim().replace(',', '.')),
    quantity: Number(values.quantity),
    minStock: Number(values.minStock),
    categoryId: Number(values.categoryId),
  };
}
