const currency = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
const integer = new Intl.NumberFormat('es-AR');

export const formatCurrency = (value: number) => currency.format(value);
export const formatNumber = (value: number) => integer.format(value);
