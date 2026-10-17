import { prisma } from '../lib/prisma';
import { conflict, notFound } from '../lib/httpError';
import type { CategoryInput } from '../validators/schemas';

export async function listCategories() {
  const categories = await prisma.category.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { products: true } } },
  });
  return categories.map(({ _count, ...category }) => ({ ...category, productCount: _count.products }));
}

export async function createCategory(input: CategoryInput) {
  const category = await prisma.category.create({ data: input });
  return { ...category, productCount: 0 };
}

export async function deleteCategory(id: number) {
  const category = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { products: true } } },
  });
  if (!category) throw notFound('Categoría no encontrada');
  if (category._count.products > 0) {
    throw conflict('No se puede eliminar una categoría que tiene productos');
  }
  await prisma.category.delete({ where: { id } });
}
