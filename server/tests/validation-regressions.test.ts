import request from 'supertest';
import { createApp } from '../src/app';
import { prisma, resetDb } from './helpers';

const app = createApp();
let categoryId: number;

const validProduct = () => ({ name: 'Mouse', sku: 'REG-1', price: 10, quantity: 3, categoryId });

beforeEach(async () => {
  await resetDb();
  categoryId = (await prisma.category.create({ data: { name: 'General' } })).id;
});

describe('validación estricta de números', () => {
  it.each([
    ['price', null],
    ['price', false],
    ['price', ''],
    ['quantity', []],
    ['quantity', null],
    ['categoryId', true],
  ])('rechaza %s = %j en lugar de convertirlo a 0', async (field, value) => {
    const res = await request(app)
      .post('/api/products')
      .send({ ...validProduct(), [field]: value });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d: { field: string }) => d.field)).toContain(field);
  });

  it('acepta números enviados como string', async () => {
    const res = await request(app)
      .post('/api/products')
      .send({ ...validProduct(), price: '12.50', quantity: '7', categoryId: String(categoryId) });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ price: 12.5, quantity: 7 });
  });

  it('un PUT con precio null no borra el precio existente', async () => {
    const created = await request(app).post('/api/products').send(validProduct()).expect(201);
    await request(app)
      .put(`/api/products/${created.body.id}`)
      .send({ ...validProduct(), price: null })
      .expect(400);
    const current = await request(app).get(`/api/products/${created.body.id}`).expect(200);
    expect(current.body.price).toBe(10);
  });
});

describe('límites de enteros de PostgreSQL', () => {
  it('rechaza cantidades y stock mínimo fuera de rango con 400', async () => {
    for (const field of ['quantity', 'minStock']) {
      const res = await request(app)
        .post('/api/products')
        .send({ ...validProduct(), [field]: 2_147_483_648 });
      expect(res.status).toBe(400);
    }
  });

  it('rechaza ids fuera de rango con 400', async () => {
    await request(app).get('/api/products/2147483648').expect(400);
    await request(app).get('/api/products?categoryId=99999999999').expect(400);
  });
});

describe('errores del parser JSON', () => {
  it('responde 413 con el formato de error cuando el body supera el límite', async () => {
    const res = await request(app)
      .post('/api/products')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ ...validProduct(), description: 'x'.repeat(200_000) }));
    expect(res.status).toBe(413);
    expect(res.body.error.message).toBeTruthy();
  });
});

describe('categoría inexistente', () => {
  it('devuelve details como arreglo de campos', async () => {
    const res = await request(app)
      .post('/api/products')
      .send({ ...validProduct(), categoryId: categoryId + 999 });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([{ field: 'categoryId', message: expect.any(String) }]);
  });
});
