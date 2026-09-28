import type { PaymentType } from '@/api/types';

export const PAYMENT_LABEL: Record<PaymentType, string> = {
  CASH: 'Cash',
  GCASH: 'GCash',
  UTANG: 'Utang',
};
