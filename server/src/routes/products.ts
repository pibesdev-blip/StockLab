import { Router } from 'express';
import * as productService from '../services/productService';
import { idParamSchema, productCreateSchema, productQuerySchema, productUpdateSchema } from '../validators/schemas';

export const productsRouter = Router();

productsRouter.get('/', async (req, res) => {
  const query = productQuerySchema.parse(req.query);
  res.json(await productService.listProducts(query));
});

// Debe declararse antes de '/:id' para no ser interpretada como un id.
productsRouter.get('/stats', async (_req, res) => {
  res.json(await productService.getStats());
});

productsRouter.get('/:id', async (req, res) => {
  res.json(await productService.getProduct(idParamSchema.parse(req.params.id)));
});

productsRouter.post('/', async (req, res) => {
  const input = productCreateSchema.parse(req.body);
  res.status(201).json(await productService.createProduct(input));
});

productsRouter.put('/:id', async (req, res) => {
  const id = idParamSchema.parse(req.params.id);
  const input = productUpdateSchema.parse(req.body);
  res.json(await productService.updateProduct(id, input));
});

productsRouter.delete('/:id', async (req, res) => {
  await productService.deleteProduct(idParamSchema.parse(req.params.id));
  res.status(204).end();
});
