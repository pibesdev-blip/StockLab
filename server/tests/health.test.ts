import request from 'supertest';
import { createApp } from '../src/app';

describe('GET /api/health', () => {
  it('responde ok', async () => {
    const res = await request(createApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('devuelve 404 con formato de error para rutas inexistentes', async () => {
    const res = await request(createApp()).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.message).toMatch(/Ruta no encontrada/);
  });
});
