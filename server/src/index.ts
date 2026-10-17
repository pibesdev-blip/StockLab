import { config } from './config';
import { createApp } from './app';
import { prisma } from './lib/prisma';

const server = createApp().listen(config.port, '0.0.0.0', () => {
  console.log(`StockLab API escuchando en http://0.0.0.0:${config.port}`);
});

async function shutdown() {
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  // Si quedan conexiones abiertas, se fuerza la salida.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
