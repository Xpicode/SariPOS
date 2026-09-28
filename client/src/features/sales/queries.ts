import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { CashSession, Sale, SaleSummary } from '@/api/types';

export function useCurrentSession() {
  return useQuery({
    queryKey: ['cash-session'],
    queryFn: () =>
      api<{ session: CashSession | null }>('/cash-sessions/current').then((d) => d.session),
  });
}

// Owner: one store day (default today). Cashier: the server ignores `day` and returns the
// open shift only.
export function useSales(day?: string) {
  return useQuery({
    queryKey: ['sales', 'list', day ?? 'today'],
    queryFn: () =>
      api<{ sales: SaleSummary[] }>(day ? `/sales?from=${day}` : '/sales').then((d) => d.sales),
  });
}

export function useSale(id: number) {
  return useQuery({
    queryKey: ['sales', 'detail', id],
    queryFn: () => api<{ sale: Sale }>(`/sales/${id}`).then((d) => d.sale),
  });
}

// After a sale or a void: stock and the sales lists changed.
export function useAfterSale() {
  const queryClient = useQueryClient();
  return (sale?: Sale) => {
    if (sale) queryClient.setQueryData(['sales', 'detail', sale.id], sale);
    queryClient.invalidateQueries({ queryKey: ['sales'] });
    queryClient.invalidateQueries({ queryKey: ['products'] });
  };
}
