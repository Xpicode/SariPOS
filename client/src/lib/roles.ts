import type { Role } from '@/api/types';

// In the store, a cashier is called the "bantay".
export const roleLabel = (role: Role) => (role === 'OWNER' ? 'Owner' : 'Bantay');
