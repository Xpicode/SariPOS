import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import type {
  AuditEntry,
  Dashboard,
  PeakHour,
  ProductSales,
  ProfitReport,
  TrendDay,
} from '@/api/types';

// Every report takes the same store-day range. keepPreviousData: while a new range loads, the
// old numbers stay on screen (dimmed) instead of the page jumping to "Loading…".
function useRange<T>(path: string, from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: ['reports', path, from, to],
    queryFn: () => api<T>(`/reports/${path}?from=${from}&to=${to}`),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export const useProfit = (from: string, to: string) => useRange<ProfitReport>('profit', from, to);
export const useTrend = (from: string, to: string) =>
  useRange<{ days: TrendDay[] }>('sales-trend', from, to);
export const usePeakHours = (from: string, to: string) =>
  useRange<{ hours: PeakHour[]; days: number }>('peak-hours', from, to);
export const useProductSales = (from: string, to: string, enabled = true) =>
  useRange<{ products: ProductSales[] }>('product-sales', from, to, enabled);

export function useDashboard(enabled: boolean) {
  return useQuery({
    queryKey: ['reports', 'dashboard'],
    queryFn: () => api<Dashboard>('/reports/dashboard'),
    enabled,
  });
}

export type AuditFilters = { userId?: string; action?: string; from?: string; to?: string };

// Newest first, 100 at a time; "Load older" asks for rows before the last id it has.
export function useAuditLog(f: AuditFilters) {
  return useInfiniteQuery({
    queryKey: ['reports', 'audit-log', f],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams(
        Object.entries({ ...f, beforeId: pageParam }).filter(([, v]) => v) as [string, string][],
      );
      return api<{ entries: AuditEntry[]; hasMore: boolean; actions: string[] }>(
        `/reports/audit-log?${params}`,
      );
    },
    initialPageParam: '',
    getNextPageParam: (last) => (last.hasMore ? String(last.entries.at(-1)!.id) : undefined),
    placeholderData: keepPreviousData,
  });
}
