import { z } from 'zod';
import { config } from '../config';

const trimmed = (max: number, label: string) =>
  z
    .string({ required_error: `${label} es obligatorio`, invalid_type_error: `${label} debe ser texto` })
    .trim()
    .min(1, `${label} es obligatorio`)
    .max(max, `${label} admite hasta ${max} caracteres`);

/** Máximo de una columna INTEGER de PostgreSQL. */
const INT_MAX = 2_147_483_647;

/**
 * Número que acepta valores numéricos o strings numéricos (query params, formularios).
 * A diferencia de z.coerce, rechaza null, booleanos, arrays y strings vacíos.
 */
const numeric = (label: string, invalidMessage: string) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() !== '' ? Number(v) : v),
    z.number({ required_error: `${label} es obligatorio`, invalid_type_error: invalidMessage }),
  );

const integer = (label: string, invalidMessage: string) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() !== '' ? Number(v) : v),
    z
      .number({ required_error: `${label} es obligatorio`, invalid_type_error: invalidMessage })
      .int(`${label} debe ser un entero`)
      .max(INT_MAX, `${label} es demasiado grande`),
  );

export const idParamSchema = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() !== '' ? Number(v) : v),
  z
    .number({ required_error: 'El id es obligatorio', invalid_type_error: 'El id debe ser numérico' })
    .int('El id debe ser un entero')
    .positive('El id debe ser positivo')
    .max(INT_MAX, 'El id es demasiado grande'),
);

export const categoryInputSchema = z.object({
  name: trimmed(60, 'El nombre'),
});

const productBase = z.object({
  name: trimmed(120, 'El nombre'),
  sku: trimmed(40, 'El SKU')
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9-]+$/, 'El SKU solo admite letras, números y guiones')),
  description: z
    .string()
    .trim()
    .max(500, 'La descripción admite hasta 500 caracteres')
    .nullish()
    .transform((v) => (v ? v : null)),
  price: numeric('El precio', 'El precio debe ser numérico').pipe(
    z
      .number()
      .nonnegative('El precio no puede ser negativo')
      .max(99_999_999.99, 'El precio es demasiado alto')
      .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, 'El precio admite hasta 2 decimales'),
  ),
  quantity: integer('La cantidad', 'La cantidad debe ser numérica').pipe(
    z.number().nonnegative('La cantidad no puede ser negativa'),
  ),
  minStock: integer('El stock mínimo', 'El stock mínimo debe ser numérico')
    .pipe(z.number().nonnegative('El stock mínimo no puede ser negativo'))
    .default(config.defaultMinStock),
  categoryId: idParamSchema,
});

export const productCreateSchema = productBase;
export const productUpdateSchema = productBase;

export const productQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  categoryId: idParamSchema.optional(),
  lowStock: z
    .enum(['true', 'false'], { errorMap: () => ({ message: 'lowStock debe ser true o false' }) })
    .optional()
    .transform((v) => v === 'true'),
});

export type CategoryInput = z.infer<typeof categoryInputSchema>;
export type ProductInput = z.infer<typeof productCreateSchema>;
export type ProductQuery = z.infer<typeof productQuerySchema>;
