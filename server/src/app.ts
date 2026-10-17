import express from 'express';
import { categoriesRouter } from './routes/categories';
import { productsRouter } from './routes/products';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.use('/api/categories', categoriesRouter);
  app.use('/api/products', productsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
