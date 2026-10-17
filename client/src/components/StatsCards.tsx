import type { Stats } from '../types';
import { formatCurrency, formatNumber } from '../utils/format';

interface Props {
  stats: Stats | null;
}

export function StatsCards({ stats }: Props) {
  const items = [
    { label: 'Productos', value: stats ? formatNumber(stats.totalProducts) : '—', icon: '📦' },
    { label: 'Unidades en stock', value: stats ? formatNumber(stats.totalUnits) : '—', icon: '🔢' },
    {
      label: 'Stock bajo',
      value: stats ? formatNumber(stats.lowStockCount) : '—',
      icon: '⚠️',
      warn: Boolean(stats?.lowStockCount),
    },
    { label: 'Valor del inventario', value: stats ? formatCurrency(stats.inventoryValue) : '—', icon: '💰' },
  ];

  return (
    <section className="stats" aria-label="Resumen del inventario">
      {items.map((item) => (
        <article key={item.label} className={`stat ${item.warn ? 'stat--warn' : ''}`}>
          <span className="stat__icon" aria-hidden="true">
            {item.icon}
          </span>
          <div>
            <span className="stat__label">{item.label}</span>
            <strong className="stat__value">{item.value}</strong>
          </div>
        </article>
      ))}
    </section>
  );
}
