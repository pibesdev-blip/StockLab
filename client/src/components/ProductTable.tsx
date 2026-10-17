import type { Product } from '../types';
import { formatCurrency, formatNumber } from '../utils/format';

interface Props {
  products: Product[];
  loading: boolean;
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
}

export function ProductTable({ products, loading, onEdit, onDelete }: Props) {
  if (loading && products.length === 0) {
    return <div className="empty">Cargando productos…</div>;
  }

  if (products.length === 0) {
    return (
      <div className="empty">
        <span aria-hidden="true">🔍</span>
        <p>No hay productos que coincidan con los filtros.</p>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Producto</th>
            <th>Categoría</th>
            <th className="num">Precio</th>
            <th className="num">Stock</th>
            <th aria-label="Acciones" />
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id}>
              <td data-label="Producto">
                <div className="product-name">{p.name}</div>
                <div className="product-sku">{p.sku}</div>
              </td>
              <td data-label="Categoría">
                <span className="chip">{p.category.name}</span>
              </td>
              <td data-label="Precio" className="num">
                {formatCurrency(p.price)}
              </td>
              <td data-label="Stock" className="num">
                <span className={`stock ${p.lowStock ? 'stock--low' : ''}`}>
                  {formatNumber(p.quantity)}
                  {p.lowStock && <small> · bajo (mín. {p.minStock})</small>}
                </span>
              </td>
              <td className="actions">
                <button className="btn btn--ghost btn--sm" onClick={() => onEdit(p)} aria-label={`Editar ${p.name}`}>
                  Editar
                </button>
                <button
                  className="btn btn--ghost btn--sm btn--danger-text"
                  onClick={() => onDelete(p)}
                  aria-label={`Eliminar ${p.name}`}
                >
                  Eliminar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
