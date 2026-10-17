import type { Category, ProductFilters } from '../types';

interface Props {
  filters: ProductFilters;
  categories: Category[];
  onChange: (filters: ProductFilters) => void;
}

export function Filters({ filters, categories, onChange }: Props) {
  const hasFilters = Boolean(filters.search || filters.categoryId || filters.lowStock);

  return (
    <div className="filters" role="search">
      <input
        type="search"
        className="input filters__search"
        placeholder="Buscar por nombre o SKU…"
        aria-label="Buscar productos"
        value={filters.search}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
      />
      <select
        className="input"
        aria-label="Filtrar por categoría"
        value={filters.categoryId}
        onChange={(e) => onChange({ ...filters, categoryId: e.target.value })}
      >
        <option value="">Todas las categorías</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={filters.lowStock}
          onChange={(e) => onChange({ ...filters, lowStock: e.target.checked })}
        />
        Solo stock bajo
      </label>
      {hasFilters && (
        <button className="btn btn--link" onClick={() => onChange({ search: '', categoryId: '', lowStock: false })}>
          Limpiar filtros
        </button>
      )}
    </div>
  );
}
