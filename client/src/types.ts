export interface Category {
  id: number;
  name: string;
  createdAt: string;
  productCount: number;
}

export interface Product {
  id: number;
  name: string;
  sku: string;
  description: string | null;
  price: number;
  quantity: number;
  minStock: number;
  categoryId: number;
  category: { id: number; name: string };
  createdAt: string;
  updatedAt: string;
  lowStock: boolean;
}

export interface ProductInput {
  name: string;
  sku: string;
  description: string | null;
  price: number;
  quantity: number;
  minStock: number;
  categoryId: number;
}

export interface Stats {
  totalProducts: number;
  totalUnits: number;
  lowStockCount: number;
  inventoryValue: number;
}

export interface ProductFilters {
  search: string;
  categoryId: string;
  lowStock: boolean;
}
