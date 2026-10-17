import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const categories = ['Electrónica', 'Oficina', 'Herramientas', 'Limpieza'];

// [nombre, sku, categoría, precio, cantidad, stock mínimo]
const products: [string, string, string, number, number, number][] = [
  ['Mouse inalámbrico', 'ELE-001', 'Electrónica', 12500, 34, 10],
  ['Teclado mecánico', 'ELE-002', 'Electrónica', 58900, 8, 5],
  ['Monitor 24"', 'ELE-003', 'Electrónica', 215000, 3, 4],
  ['Auriculares USB', 'ELE-004', 'Electrónica', 18700, 0, 5],
  ['Cable HDMI 2 m', 'ELE-005', 'Electrónica', 4500, 60, 15],
  ['Resma A4 500 hojas', 'OFI-001', 'Oficina', 7800, 120, 30],
  ['Bolígrafos x10', 'OFI-002', 'Oficina', 2300, 15, 20],
  ['Abrochadora', 'OFI-003', 'Oficina', 6400, 9, 3],
  ['Cuaderno universitario', 'OFI-004', 'Oficina', 3100, 45, 10],
  ['Destornillador set', 'HER-001', 'Herramientas', 15200, 12, 4],
  ['Taladro percutor', 'HER-002', 'Herramientas', 89900, 2, 2],
  ['Cinta métrica 5 m', 'HER-003', 'Herramientas', 5600, 25, 5],
  ['Detergente 750 ml', 'LIM-001', 'Limpieza', 1900, 80, 20],
  ['Lavandina 2 L', 'LIM-002', 'Limpieza', 1500, 4, 10],
  ['Paños de microfibra x3', 'LIM-003', 'Limpieza', 3200, 18, 6],
];

async function main() {
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();

  const categoryIds = new Map<string, number>();
  for (const name of categories) {
    const category = await prisma.category.create({ data: { name } });
    categoryIds.set(name, category.id);
  }

  for (const [name, sku, category, price, quantity, minStock] of products) {
    await prisma.product.create({
      data: { name, sku, price, quantity, minStock, categoryId: categoryIds.get(category)! },
    });
  }

  console.log(`Seed completa: ${categories.length} categorías y ${products.length} productos.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
