import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { AgingReport, Customer, LedgerEntry } from '@/api/types';

export function useCustomers(search = '') {
  return useQuery({
    queryKey: ['customers', 'list', search],
    queryFn: () =>
      api<{ customers: Customer[] }>(
        `/customers${search ? `?search=${encodeURIComponent(search)}` : ''}`,
      ).then((d) => d.customers),
    placeholderData: keepPreviousData,
  });
}

export function useStatement(id: number) {
  return useQuery({
    queryKey: ['customers', 'statement', id],
    queryFn: () =>
      api<{ customer: Customer; entries: LedgerEntry[] }>(`/customers/${id}/ledger`),
  });
}

export function useAging() {
  return useQuery({
    queryKey: ['customers', 'aging'],
    queryFn: () => api<AgingReport>('/customers/aging'),
  });
}

// After a customer change, an utang sale, a payment or a void.
export function useAfterCustomerChange() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['customers'] });
    queryClient.invalidateQueries({ queryKey: ['cash-session'] }); // payments count in the drawer
  };
}
