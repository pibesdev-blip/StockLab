import { Prisma, type Category, type Product } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError, notFound } from '../lib/httpError';
import type { ProductInput, ProductQuery } from '../validators/schemas';

type ProductWithCategory = Product & { category: Pick<Category, 'id' | 'name'> };

const include = { category: { select: { id: true, name: true } } } as const;

export function toProductDto(product: ProductWithCategory) {
  return {
    ...product,
    price: product.price.toNumber(),
    lowStock: product.quantity <= product.minStock,
  };
}

async function ensureCategoryExists(categoryId: number) {
  const exists = await prisma.category.findUnique({ where: { id: categoryId }, select: { id: true } });
  if (!exists) {
    throw new HttpError(400, 'La categoría indicada no existe', [
      { field: 'categoryId', message: 'La categoría indicada no existe' },
    ]);
  }
}

export async function listProducts(query: ProductQuery) {
  const where: Prisma.ProductWhereInput = {};
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { sku: { contains: query.search, mode: 'insensitive' } },
    ];
  }
  if (query.categoryId) where.categoryId = query.categoryId;
  if (query.lowStock) where.quantity = { lte: prisma.product.fields.minStock };

  const products = await prisma.product.findMany({ where, include, orderBy: { name: 'asc' } });
  return products.map(toProductDto);
}

export async function getProduct(id: number) {
  const product = await prisma.product.findUnique({ where: { id }, include });
  if (!product) throw notFound('Producto no encontrado');
  return toProductDto(product);
}

export async function createProduct(input: ProductInput) {
  await ensureCategoryExists(input.categoryId);
  const product = await prisma.product.create({ data: input, include });
  return toProductDto(product);
}

export async function updateProduct(id: number, input: ProductInput) {
  await getProduct(id);
  await ensureCategoryExists(input.categoryId);
  const product = await prisma.product.update({ where: { id }, data: input, include });
  return toProductDto(product);
}

export async function deleteProduct(id: number) {
  await getProduct(id);
  await prisma.product.delete({ where: { id } });
}

export async function getStats() {
  const products = await prisma.product.findMany({ select: { price: true, quantity: true, minStock: true } });
  // Se acumula con Decimal para no perder precisión en importes.
  const inventoryValue = products.reduce((sum, p) => sum.plus(p.price.times(p.quantity)), new Prisma.Decimal(0));
  return {
    totalProducts: products.length,
    totalUnits: products.reduce((sum, p) => sum + p.quantity, 0),
    lowStockCount: products.filter((p) => p.quantity <= p.minStock).length,
    inventoryValue: inventoryValue.toDecimalPlaces(2).toNumber(),
  };
}
