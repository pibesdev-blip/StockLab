import { toProductInput, validateProduct, type ProductFormValues } from '../utils/validateProduct';

const valid: ProductFormValues = {
  name: 'Mouse',
  sku: 'ele-010',
  description: '',
  price: '1234,5',
  quantity: '3',
  minStock: '5',
  categoryId: '1',
};

describe('validateProduct', () => {
  it('acepta datos válidos', () => {
    expect(validateProduct(valid)).toEqual({});
  });

  it('exige los campos obligatorios', () => {
    const errors = validateProduct({ ...valid, name: ' ', sku: '', price: '', quantity: '', minStock: '', categoryId: '' });
    expect(Object.keys(errors).sort()).toEqual(['categoryId', 'minStock', 'name', 'price', 'quantity', 'sku']);
  });

  it('rechaza formatos inválidos', () => {
    const errors = validateProduct({ ...valid, sku: 'AB C', price: '-1', quantity: '1.5', minStock: '-2' });
    expect(errors.sku).toBeDefined();
    expect(errors.price).toBeDefined();
    expect(errors.quantity).toBeDefined();
    expect(errors.minStock).toBeDefined();
    expect(validateProduct({ ...valid, price: '10.123' }).price).toBeDefined();
  });

  it('convierte los valores del formulario al formato de la API', () => {
    expect(toProductInput(valid)).toEqual({
      name: 'Mouse',
      sku: 'ELE-010',
      description: null,
      price: 1234.5,
      quantity: 3,
      minStock: 5,
      categoryId: 1,
    });
  });
});
