import { prisma } from '../src/lib/prisma';

/** Vacía las tablas de la base de pruebas. */
export async function resetDb() {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE products, categories RESTART IDENTITY CASCADE');
}

export { prisma };
