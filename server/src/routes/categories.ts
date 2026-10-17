import { Router } from 'express';
import * as categoryService from '../services/categoryService';
import { categoryInputSchema, idParamSchema } from '../validators/schemas';

export const categoriesRouter = Router();

categoriesRouter.get('/', async (_req, res) => {
  res.json(await categoryService.listCategories());
});

categoriesRouter.post('/', async (req, res) => {
  const input = categoryInputSchema.parse(req.body);
  res.status(201).json(await categoryService.createCategory(input));
});

categoriesRouter.delete('/:id', async (req, res) => {
  await categoryService.deleteCategory(idParamSchema.parse(req.params.id));
  res.status(204).end();
});
