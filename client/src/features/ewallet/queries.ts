import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { EwalletTxn, EwalletTxnType, FeeQuote, FeeRule, Wallet } from '@/api/types';

export function useWallets() {
  return useQuery({
    queryKey: ['ewallet', 'accounts'],
    queryFn: () => api<{ accounts: Wallet[] }>('/ewallet/accounts').then((d) => d.accounts),
  });
}

// Owner: one store day. Cashier: the server ignores `day` and returns the open shift only.
export function useEwalletTxns(day?: string) {
  return useQuery({
    queryKey: ['ewallet', 'transactions', day ?? 'shift'],
    queryFn: () =>
      api<{ transactions: EwalletTxn[] }>(`/ewallet/transactions${day ? `?from=${day}` : ''}`).then(
        (d) => d.transactions,
      ),
  });
}

export function useFeeRules() {
  return useQuery({
    queryKey: ['ewallet', 'fee-rules'],
    queryFn: () => api<{ rules: FeeRule[] }>('/ewallet/fee-rules').then((d) => d.rules),
  });
}

export type QuoteRequest = {
  accountId: number;
  type: EwalletTxnType;
  amount: number;
  drawer?: boolean;
};

// The fee and what happens to both pockets, computed by the SERVER (the same code that saves the
// transaction), so the counter never shows a fee the server wouldn't charge. null = not yet.
export function useFeeQuote(req: QuoteRequest | null) {
  return useQuery({
    queryKey: ['ewallet', 'quote', req],
    queryFn: () => api<FeeQuote>('/ewallet/fee-preview', { method: 'POST', body: req }),
    enabled: req !== null,
    retry: false,
  });
}

// After any e-wallet change: balances, lists and the drawer (cash moved) are out of date.
export function useAfterEwalletChange() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['ewallet'] });
    queryClient.invalidateQueries({ queryKey: ['cash-session'] });
  };
}
