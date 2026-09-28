import type { ExpenseCategory } from '@/api/types';

export const EXPENSE_LABEL: Record<ExpenseCategory, string> = {
  SUPPLIES: 'Store supplies',
  ELECTRIC: 'Electricity',
  WATER: 'Water',
  RENT: 'Rent',
  TRANSPORT: 'Transport / delivery',
  SALARY: 'Salary',
  OTHER: 'Other',
  OWNER_WITHDRAWAL: 'Owner withdrawal',
};
