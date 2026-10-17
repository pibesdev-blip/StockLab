import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api/client';
import { CategoryManager } from './components/CategoryManager';
import { ConfirmDialog } from './components/ConfirmDialog';
import { Filters } from './components/Filters';
import { ProductForm } from './components/ProductForm';
import { ProductTable } from './components/ProductTable';
import { StatsCards } from './components/StatsCards';
import { Toast, type ToastMessage } from './components/Toast';
import type { Category, Product, ProductFilters, ProductInput, Stats } from './types';

const EMPTY_FILTERS: ProductFilters = { search: '', categoryId: '', lowStock: false };

type Dialog =
  | { kind: 'none' }
  | { kind: 'form'; product: Product | null }
  | { kind: 'delete'; product: Product }
  | { kind: 'categories' };

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [filters, setFilters] = useState<ProductFilters>(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const productsRequest = useRef(0);
  const [dialog, setDialog] = useState<Dialog>({ kind: 'none' });
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const debouncedFilters = useDebounced(filters, 300);

  const notify = (type: ToastMessage['type'], text: string) => setToast({ id: Date.now(), type, text });
  const dismissToast = useCallback(() => setToast(null), []);
  const closeDialog = useCallback(() => setDialog({ kind: 'none' }), []);

  const loadProducts = useCallback(async () => {
    // Solo la respuesta de la petición más reciente actualiza la lista.
    const seq = ++productsRequest.current;
    setLoading(true);
    try {
      const result = await api.listProducts(debouncedFilters);
      if (seq !== productsRequest.current) return;
      setProducts(result);
      setLoadError(null);
    } catch (err) {
      if (seq !== productsRequest.current) return;
      setLoadError(err instanceof Error ? err.message : 'No se pudieron cargar los productos.');
    } finally {
      if (seq === productsRequest.current) setLoading(false);
    }
  }, [debouncedFilters]);

  const loadSummary = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([api.getStats(), api.listCategories()]);
      setStats(s);
      setCategories(c);
      setSummaryError(null);
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : 'No se pudo cargar el resumen.');
    }
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const refreshAll = () => Promise.all([loadProducts(), loadSummary()]);

  async function handleSave(input: ProductInput) {
    if (dialog.kind !== 'form') return;
    if (dialog.product) {
      await api.updateProduct(dialog.product.id, input);
      notify('success', `Producto "${input.name}" actualizado.`);
    } else {
      await api.createProduct(input);
      notify('success', `Producto "${input.name}" creado.`);
    }
    closeDialog();
    await refreshAll();
  }

  async function handleDelete(product: Product) {
    try {
      await api.deleteProduct(product.id);
      notify('success', `Producto "${product.name}" eliminado.`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'No se pudo eliminar.');
    }
    closeDialog();
    await refreshAll();
  }

  async function handleCreateCategory(name: string) {
    await api.createCategory(name);
    notify('success', `Categoría "${name}" creada.`);
    await loadSummary();
  }

  async function handleDeleteCategory(category: Category) {
    await api.deleteCategory(category.id);
    notify('success', `Categoría "${category.name}" eliminada.`);
    if (filters.categoryId === String(category.id)) setFilters((f) => ({ ...f, categoryId: '' }));
    await loadSummary();
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="container topbar__inner">
          <div className="logo">
            <span aria-hidden="true">📦</span> StockLab
          </div>
          <div className="topbar__actions">
            <button className="btn btn--ghost" onClick={() => setDialog({ kind: 'categories' })}>
              Categorías
            </button>
            <button className="btn" onClick={() => setDialog({ kind: 'form', product: null })}>
              + Nuevo producto
            </button>
          </div>
        </div>
      </header>

      <main className="container main">
        <div className="page-title">
          <h1>Inventario</h1>
          <p>Gestioná productos, precios y stock disponible.</p>
        </div>

        {summaryError && (
          <div className="alert alert--error alert--standalone" role="alert">
            {summaryError}{' '}
            <button className="btn btn--link" onClick={() => void loadSummary()}>
              Reintentar
            </button>
          </div>
        )}
        <StatsCards stats={stats} />

        <section className="panel">
          <Filters filters={filters} categories={categories} onChange={setFilters} />
          {loadError ? (
            <div className="alert alert--error" role="alert">
              {loadError}{' '}
              <button className="btn btn--link" onClick={() => void refreshAll()}>
                Reintentar
              </button>
            </div>
          ) : (
            <ProductTable
              products={products}
              loading={loading}
              onEdit={(product) => setDialog({ kind: 'form', product })}
              onDelete={(product) => setDialog({ kind: 'delete', product })}
            />
          )}
          {!loadError && products.length > 0 && (
            <p className="panel__footer">
              Mostrando {products.length} de {stats?.totalProducts ?? products.length} productos
            </p>
          )}
        </section>
      </main>

      {dialog.kind === 'form' && (
        <ProductForm product={dialog.product} categories={categories} onSubmit={handleSave} onClose={closeDialog} />
      )}
      {dialog.kind === 'delete' && (
        <ConfirmDialog
          title="Eliminar producto"
          message={`¿Seguro que querés eliminar "${dialog.product.name}" (${dialog.product.sku})? Esta acción no se puede deshacer.`}
          onConfirm={() => handleDelete(dialog.product)}
          onCancel={closeDialog}
        />
      )}
      {dialog.kind === 'categories' && (
        <CategoryManager
          categories={categories}
          onCreate={handleCreateCategory}
          onDelete={handleDeleteCategory}
          onClose={closeDialog}
        />
      )}

      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}
