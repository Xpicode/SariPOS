import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { CashSession, Expense, ShiftSummary } from '@/api/types';

// Owner: past shifts that opened between two store dates.
export function useShifts(from: string, to: string) {
  return useQuery({
    queryKey: ['shifts', 'list', from, to],
    queryFn: () =>
      api<{ sessions: ShiftSummary[] }>(`/cash-sessions?from=${from}&to=${to}`).then(
        (d) => d.sessions,
      ),
  });
}

export function useShiftReport(id: number) {
  return useQuery({
    queryKey: ['shifts', 'detail', id],
    queryFn: () => api<{ session: CashSession }>(`/cash-sessions/${id}`).then((d) => d.session),
  });
}

export function useExpenses(from: string, to: string) {
  return useQuery({
    queryKey: ['expenses', from, to],
    queryFn: () =>
      api<{ expenses: Expense[] }>(`/expenses?from=${from}&to=${to}`).then((d) => d.expenses),
  });
}

// After opening/closing the drawer or recording an expense, these all changed.
export function useAfterDrawerChange() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['cash-session'] });
    queryClient.invalidateQueries({ queryKey: ['shifts'] });
    queryClient.invalidateQueries({ queryKey: ['expenses'] });
    queryClient.invalidateQueries({ queryKey: ['sales'] });
  };
}
