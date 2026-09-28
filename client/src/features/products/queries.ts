import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { Category, ExpiringItem, Movement, Product } from '@/api/types';

export type ProductFilters = {
  search?: string;
  categoryId?: number;
  lowStock?: boolean;
  includeInactive?: boolean;
};

// Same regex as the server's barcodeSchema.
export const BARCODE_RE = /^[0-9A-Za-z-]{3,50}$/;

export function useProducts(f: ProductFilters) {
  const params = new URLSearchParams();
  if (f.search) params.set('search', f.search);
  if (f.categoryId) params.set('categoryId', String(f.categoryId));
  if (f.lowStock) params.set('lowStock', 'true');
  if (f.includeInactive) params.set('includeInactive', 'true');
  return useQuery({
    queryKey: ['products', 'list', f],
    queryFn: () => api<{ products: Product[] }>(`/products?${params}`).then((d) => d.products),
    placeholderData: keepPreviousData, // keep showing the old list while the next search loads
  });
}

export function useProduct(id: number, enabled = true) {
  return useQuery({
    queryKey: ['products', 'detail', id],
    queryFn: () => api<{ product: Product }>(`/products/${id}`).then((d) => d.product),
    enabled,
  });
}

export function useMovements(productId: number, enabled: boolean) {
  return useQuery({
    queryKey: ['products', 'movements', productId],
    queryFn: () =>
      api<{ movements: Movement[] }>(`/inventory/movements?productId=${productId}`).then(
        (d) => d.movements,
      ),
    enabled, // owner only: don't even ask as a cashier
  });
}

export function useExpiring(days = 7) {
  return useQuery({
    queryKey: ['products', 'expiring', days],
    queryFn: () =>
      api<{ items: ExpiringItem[] }>(`/inventory/expiring?days=${days}`).then((d) => d.items),
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: () => api<{ categories: Category[] }>('/categories').then((d) => d.categories),
    staleTime: 5 * 60_000, // categories rarely change
  });
}

// After any stock or product change, every list, detail and history is refetched.
// Pass the product the server just returned: its page then shows the new price/stock at once,
// instead of flashing the old cached numbers until the refetch lands.
export function useRefreshProducts() {
  const queryClient = useQueryClient();
  return (saved?: Product) => {
    if (saved) queryClient.setQueryData(['products', 'detail', saved.id], saved);
    return queryClient.invalidateQueries({ queryKey: ['products'] });
  };
}

// Scanned or typed barcode -> the product and the exact unit (pack vs stick) it belongs to.
export const lookupBarcode = (code: string) =>
  api<{ product: Product; unitId: number }>(`/products/barcode/${encodeURIComponent(code)}`);
