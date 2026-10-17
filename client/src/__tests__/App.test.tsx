import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import type { Category, Product } from '../types';

const categories: Category[] = [
  { id: 1, name: 'Electrónica', createdAt: '', productCount: 2 },
  { id: 2, name: 'Oficina', createdAt: '', productCount: 0 },
];

const makeProduct = (over: Partial<Product>): Product => ({
  id: 1,
  name: 'Mouse',
  sku: 'ELE-001',
  description: null,
  price: 1000,
  quantity: 10,
  minStock: 5,
  categoryId: 1,
  category: { id: 1, name: 'Electrónica' },
  createdAt: '',
  updatedAt: '',
  lowStock: false,
  ...over,
});

const products = [
  makeProduct({}),
  makeProduct({ id: 2, name: 'Teclado', sku: 'ELE-002', quantity: 1, lowStock: true }),
];

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(status === 204 ? null : JSON.stringify(body), { status }));
}

function mockApi() {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url.startsWith('/api/products/stats'))
      return json({ totalProducts: 2, totalUnits: 11, lowStockCount: 1, inventoryValue: 11000 });
    if (url.startsWith('/api/categories')) return json(categories);
    if (method === 'DELETE') return json(null, 204);
    if (method === 'POST') return json({ error: { message: 'Ya existe un registro con ese valor (sku)' } }, 409);
    if (url.includes('lowStock=true')) return json(products.filter((p) => p.lowStock));
    return json(products);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('App', () => {
  it('muestra el resumen y la lista de productos', async () => {
    mockApi();
    render(<App />);

    expect(await screen.findByText('Teclado')).toBeInTheDocument();
    expect(screen.getByText('Mouse')).toBeInTheDocument();
    const summary = screen.getByRole('region', { name: /resumen/i });
    expect(within(summary).getByText('Stock bajo').nextSibling).toHaveTextContent('1');
    expect(screen.getByText(/bajo \(mín\. 5\)/)).toBeInTheDocument();
  });

  it('filtra por stock bajo enviando el parámetro a la API', async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Mouse');

    await user.click(screen.getByLabelText('Solo stock bajo'));

    await waitFor(() => expect(screen.queryByText('Mouse')).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith('/api/products?lowStock=true', expect.anything());
  });

  it('ignora respuestas viejas que llegan después de una búsqueda más nueva', async () => {
    let releaseSlow: () => void = () => {};
    const slow = new Promise<void>((resolve) => (releaseSlow = resolve));
    const fetchMock = mockApi();
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((input, init) => {
      // La primera búsqueda ("mou") tarda; la segunda ("tec") responde enseguida.
      if (String(input).includes('search=mou')) return slow.then(() => json([products[0]]));
      if (String(input).includes('search=tec')) return json([products[1]]);
      return base(input, init);
    });
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Mouse');

    const search = screen.getByLabelText('Buscar productos');
    await user.type(search, 'mou');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/products?search=mou', expect.anything()));
    await user.clear(search);
    await user.type(search, 'tec');
    await waitFor(() => expect(screen.queryByText('Mouse')).not.toBeInTheDocument());

    releaseSlow();
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByText('Teclado')).toBeInTheDocument();
    expect(screen.queryByText('Mouse')).not.toBeInTheDocument();
  });

  it('pide confirmación antes de eliminar un producto', async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Mouse');

    await user.click(screen.getByRole('button', { name: 'Eliminar Mouse' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('ELE-001');
    expect(fetchMock).not.toHaveBeenCalledWith('/api/products/1', expect.objectContaining({ method: 'DELETE' }));

    await user.click(within(dialog).getByRole('button', { name: 'Eliminar' }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/products/1', expect.objectContaining({ method: 'DELETE' })),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(/eliminado/);
  });

  it('valida el formulario y muestra el error del servidor', async () => {
    mockApi();
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Mouse');

    await user.click(screen.getByRole('button', { name: '+ Nuevo producto' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(within(dialog).getByText('El nombre es obligatorio.')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('Nombre'), 'Mouse 2');
    await user.type(within(dialog).getByLabelText('SKU'), 'ELE-001');
    await user.selectOptions(within(dialog).getByLabelText('Categoría'), '1');
    await user.type(within(dialog).getByLabelText('Precio'), '99.90');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/ya existe/i);
  });
});
