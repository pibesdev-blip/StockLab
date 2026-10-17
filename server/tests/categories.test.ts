import request from 'supertest';
import { createApp } from '../src/app';
import { prisma, resetDb } from './helpers';

const app = createApp();

function expectError(res: request.Response, status: number, field?: string) {
  expect(res.status).toBe(status);
  expect(res.body).toEqual({ error: expect.objectContaining({ message: expect.any(String) }) });
  expect(res.body.error.message.length).toBeGreaterThan(0);
  if (field) {
    expect(res.body.error.details).toEqual(expect.arrayContaining([
      { field, message: expect.any(String) },
    ]));
    for (const detail of res.body.error.details) {
      expect(detail).toEqual({ field: expect.any(String), message: expect.any(String) });
    }
  }
}

describe('Categories API contract', () => {
  beforeEach(async () => { await resetDb(); });

  it('lists an empty database', async () => {
    const res = await request(app).get('/api/categories');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('creates, persists and lists categories alphabetically with product counts', async () => {
    const zulu = await request(app).post('/api/categories').send({ name: 'Zulu' });
    expect(zulu.status).toBe(201);
    expect(zulu.body).toEqual({ id: expect.any(Number), name: 'Zulu', createdAt: expect.any(String), productCount: 0 });
    expect(Number.isNaN(Date.parse(zulu.body.createdAt))).toBe(false);
    const alpha = await request(app).post('/api/categories').send({ name: 'Alpha' });
    expect(alpha.status).toBe(201);
    await prisma.product.createMany({ data: [
      { name: 'One', sku: 'ONE', price: 1, quantity: 1, categoryId: zulu.body.id },
      { name: 'Two', sku: 'TWO', price: 2, quantity: 2, categoryId: zulu.body.id },
    ] });
    const list = await request(app).get('/api/categories');
    expect(list.status).toBe(200);
    expect(list.body).toEqual([alpha.body, { ...zulu.body, productCount: 2 }]);
  });

  it.each([
    ['missing', {}], ['empty', { name: '' }], ['blank', { name: '   ' }],
    ['too long', { name: 'a'.repeat(61) }],
  ])('rejects a %s category name', async (_label, body) => {
    expectError(await request(app).post('/api/categories').send(body), 400, 'name');
    expect(await prisma.category.count()).toBe(0);
  });

  it('accepts the 60-character name boundary and rejects a duplicate', async () => {
    const body = { name: 'a'.repeat(60) };
    expect((await request(app).post('/api/categories').send(body)).status).toBe(201);
    expectError(await request(app).post('/api/categories').send(body), 409);
    expect(await prisma.category.count()).toBe(1);
  });

  it('deletes an empty category, persists deletion and returns 404 on repeated deletion', async () => {
    const category = await prisma.category.create({ data: { name: 'Disposable' } });
    const res = await request(app).delete(`/api/categories/${category.id}`);
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect((await request(app).get('/api/categories')).body).toEqual([]);
    expectError(await request(app).delete(`/api/categories/${category.id}`), 404);
  });

  it('rejects deletion of a category containing products without removing either entity', async () => {
    const category = await prisma.category.create({ data: { name: 'Occupied' } });
    await prisma.product.create({ data: { name: 'Item', sku: 'ITEM', price: 1, quantity: 1, categoryId: category.id } });
    expectError(await request(app).delete(`/api/categories/${category.id}`), 409);
    expect((await request(app).get('/api/categories')).body[0]).toMatchObject({ id: category.id, productCount: 1 });
    expect(await prisma.product.count()).toBe(1);
  });

  it('rejects non-positive, fractional and non-numeric category IDs', async () => {
    for (const id of ['abc', '0', '-1', '1.5']) {
      expectError(await request(app).delete(`/api/categories/${id}`), 400);
    }
  });
});
