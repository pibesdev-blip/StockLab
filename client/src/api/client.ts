import type { Category, Product, ProductFilters, ProductInput, Stats } from '../types';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: { field: string; message: string }[],
  ) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
  } catch {
    throw new ApiError(0, 'No se pudo conectar con el servidor.');
  }

  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, body?.error?.message ?? `Error ${res.status}`, body?.error?.details);
  }
  return body as T;
}

export const api = {
  listProducts(filters: ProductFilters) {
    const params = new URLSearchParams();
    if (filters.search.trim()) params.set('search', filters.search.trim());
    if (filters.categoryId) params.set('categoryId', filters.categoryId);
    if (filters.lowStock) params.set('lowStock', 'true');
    const qs = params.toString();
    return request<Product[]>(`/products${qs ? `?${qs}` : ''}`);
  },
  getStats: () => request<Stats>('/products/stats'),
  createProduct: (input: ProductInput) =>
    request<Product>('/products', { method: 'POST', body: JSON.stringify(input) }),
  updateProduct: (id: number, input: ProductInput) =>
    request<Product>(`/products/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  deleteProduct: (id: number) => request<void>(`/products/${id}`, { method: 'DELETE' }),
  listCategories: () => request<Category[]>('/categories'),
  createCategory: (name: string) =>
    request<Category>('/categories', { method: 'POST', body: JSON.stringify({ name }) }),
  deleteCategory: (id: number) => request<void>(`/categories/${id}`, { method: 'DELETE' }),
};
