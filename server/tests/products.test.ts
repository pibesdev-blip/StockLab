import request from 'supertest';
import { createApp } from '../src/app';
import { prisma, resetDb } from './helpers';

const app = createApp();
const valid = { name: 'Widget', sku: 'abc-1', description: 'A widget', price: 12.34, quantity: 6, minStock: 5 };
let categoryId: number;

function expectError(res: request.Response, status: number, field?: string) {
  expect(res.status).toBe(status);
  expect(res.body).toEqual({ error: expect.objectContaining({ message: expect.any(String) }) });
  expect(res.body.error.message.length).toBeGreaterThan(0);
  if (field) {
    expect(res.body.error.details).toEqual(expect.arrayContaining([{ field, message: expect.any(String) }]));
    for (const detail of res.body.error.details) {
      expect(detail).toEqual({ field: expect.any(String), message: expect.any(String) });
    }
  }
}

async function createProduct(overrides: Record<string, unknown> = {}) {
  const res = await request(app).post('/api/products').send({ ...valid, categoryId, ...overrides });
  expect(res.status).toBe(201);
  return res.body;
}

async function expectStats(expected: { totalProducts: number; totalUnits: number; lowStockCount: number; inventoryValue: number }) {
  const res = await request(app).get('/api/products/stats');
  expect(res.status).toBe(200);
  expect(res.body).toEqual(expected);
}

describe('Products API contract', () => {
  beforeEach(async () => {
    await resetDb();
    categoryId = (await prisma.category.create({ data: { name: 'Tools' } })).id;
  });

  it('returns an empty list and zero statistics', async () => {
    const res = await request(app).get('/api/products');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    await expectStats({ totalProducts: 0, totalUnits: 0, lowStockCount: 0, inventoryValue: 0 });
  });

  it('creates a complete JSON product, uppercases SKU and persists it in GET', async () => {
    const product = await createProduct();
    expect(product).toEqual({ ...valid, sku: 'ABC-1', categoryId, category: { id: categoryId, name: 'Tools' },
      id: expect.any(Number), createdAt: expect.any(String), updatedAt: expect.any(String), lowStock: false });
    expect(Number.isInteger(product.id)).toBe(true);
    expect(product.id).toBeGreaterThan(0);
    for (const date of [product.createdAt, product.updatedAt]) expect(Number.isNaN(Date.parse(date))).toBe(false);
    const fetched = await request(app).get(`/api/products/${product.id}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body).toEqual(product);
  });

  it('defaults minStock to 5 and description to null, including equality as low stock', async () => {
    const product = await createProduct({ minStock: undefined, description: undefined, quantity: 5, price: 0 });
    expect(product).toMatchObject({ minStock: 5, description: null, quantity: 5, price: 0, lowStock: true });
  });

  it('lists by name and combines search, category and inclusive low-stock filters', async () => {
    const other = await prisma.category.create({ data: { name: 'Other' } });
    const zulu = await createProduct({ name: 'Zulu', sku: 'MATCH-Z', quantity: 6 });
    const alpha = await createProduct({ name: 'Alpha match', sku: 'A-1', quantity: 5 });
    const beta = await createProduct({ name: 'Beta', sku: 'MATCH-B', quantity: 0, categoryId: other.id });
    const list = async (query: Record<string, string | number>) => {
      const res = await request(app).get('/api/products').query(query);
      expect(res.status).toBe(200);
      return res.body;
    };
    expect(await list({})).toEqual([alpha, beta, zulu]);
    expect(await list({ search: 'aLpHa' })).toEqual([alpha]);
    expect(await list({ search: 'atch-' })).toEqual([beta, zulu]);
    expect(await list({ categoryId })).toEqual([alpha, zulu]);
    expect(await list({ lowStock: 'true' })).toEqual([alpha, beta]);
    expect(await list({ lowStock: 'false' })).toEqual([alpha, beta, zulu]);
    expect(await list({ search: 'MaTcH', categoryId, lowStock: 'true' })).toEqual([alpha]);
    expect(await list({ search: 'not present' })).toEqual([]);
  });

  it('rejects invalid query filters', async () => {
    for (const query of [{ categoryId: 'abc' }, { categoryId: '0' }, { categoryId: '-1' },
      { categoryId: '1.5' }, { lowStock: 'yes' }, { lowStock: '1' }]) {
      expectError(await request(app).get('/api/products').query(query), 400, 'categoryId' in query ? 'categoryId' : 'lowStock');
    }
  });

  it('returns 404 for a missing product', async () => {
    expectError(await request(app).get('/api/products/999999'), 404);
  });

  it('rejects invalid product IDs', async () => {
    for (const id of ['abc', '0', '-1', '1.5']) {
      expectError(await request(app).get(`/api/products/${id}`), 400);
    }
  });

  it.each([
    ['name', undefined], ['name', '   '], ['sku', undefined], ['sku', ''], ['sku', 'AB C'], ['sku', 'AB_C'],
    ['price', -1], ['price', 1.234], ['quantity', -1], ['quantity', 1.5], ['minStock', -1], ['minStock', 1.5],
    ['categoryId', undefined],
  ])('rejects invalid %s=%s on both create and update', async (field, value) => {
    const existing = await createProduct();
    const body = { ...valid, categoryId, [field]: value };
    expectError(await request(app).post('/api/products').send(body), 400, field);
    expectError(await request(app).put(`/api/products/${existing.id}`).send(body), 400, field);
    expect(await prisma.product.count()).toBe(1);
    expect((await request(app).get(`/api/products/${existing.id}`)).body).toEqual(existing);
  });

  it('rejects a nonexistent category on create and update', async () => {
    const existing = await createProduct();
    const body = { ...valid, categoryId: categoryId + 10000 };
    expectError(await request(app).post('/api/products').send(body), 400);
    expectError(await request(app).put(`/api/products/${existing.id}`).send(body), 400);
    expect((await request(app).get(`/api/products/${existing.id}`)).body).toEqual(existing);
  });

  it('rejects duplicate SKUs after uppercasing on create and update', async () => {
    const first = await createProduct({ sku: 'ELE-1' });
    expectError(await request(app).post('/api/products').send({ ...valid, categoryId, sku: 'ele-1' }), 409);
    const second = await createProduct({ sku: 'OTHER' });
    expectError(await request(app).put(`/api/products/${second.id}`).send({ ...valid, categoryId, sku: 'ele-1' }), 409);
    expect((await request(app).get(`/api/products/${first.id}`)).body).toEqual(first);
    expect((await request(app).get(`/api/products/${second.id}`)).body).toEqual(second);
  });

  it('persists a full update keeping its own SKU and updates all statistics through deletion', async () => {
    const product = await createProduct({ price: 0.29, quantity: 3 });
    const second = await createProduct({ name: 'Second', sku: 'SECOND', price: 0.1, quantity: 2, minStock: 0 });
    await expectStats({ totalProducts: 2, totalUnits: 5, lowStockCount: 1, inventoryValue: 1.07 });
    const nextCategory = await prisma.category.create({ data: { name: 'New category' } });
    const body = { name: 'Updated', sku: product.sku, description: null, price: 1.25, quantity: 8, minStock: 7, categoryId: nextCategory.id };
    const updated = await request(app).put(`/api/products/${product.id}`).send(body);
    expect(updated.status).toBe(200);
    expect(updated.body).toEqual({ ...body, id: product.id, category: { id: nextCategory.id, name: 'New category' },
      createdAt: product.createdAt, updatedAt: expect.any(String), lowStock: false });
    expect(Date.parse(updated.body.updatedAt)).toBeGreaterThanOrEqual(Date.parse(product.updatedAt));
    expect((await request(app).get(`/api/products/${product.id}`)).body).toEqual(updated.body);
    await expectStats({ totalProducts: 2, totalUnits: 10, lowStockCount: 0, inventoryValue: 10.2 });
    const deleted = await request(app).delete(`/api/products/${product.id}`);
    expect(deleted.status).toBe(204);
    expect(deleted.text).toBe('');
    expectError(await request(app).get(`/api/products/${product.id}`), 404);
    expectError(await request(app).delete(`/api/products/${product.id}`), 404);
    expect((await request(app).get('/api/products')).body).toEqual([second]);
    await expectStats({ totalProducts: 1, totalUnits: 2, lowStockCount: 0, inventoryValue: 0.2 });
  });

  it('returns 404 when updating a nonexistent product', async () => {
    expectError(await request(app).put('/api/products/999999').send({ ...valid, categoryId }), 404);
  });

  it('returns structured errors for malformed JSON and unknown routes', async () => {
    expectError(await request(app).post('/api/products').set('Content-Type', 'application/json').send('{bad'), 400);
    expectError(await request(app).get('/api/unknown-route'), 404);
  });
});
