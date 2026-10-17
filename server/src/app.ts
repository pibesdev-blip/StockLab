import express from 'express';
import { categoriesRouter } from './routes/categories';
import { productsRouter } from './routes/products';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { prisma } from './lib/prisma';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // Solo se confía en el proxy indicado (gateway de la red de la app en el servidor).
  if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY);
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'error', message: 'Base de datos no disponible' });
    }
  });
  app.use('/api/categories', categoriesRouter);
  app.use('/api/products', productsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
