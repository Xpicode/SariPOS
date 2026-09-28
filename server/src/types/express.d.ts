export type Role = 'OWNER' | 'CASHIER';

declare global {
  namespace Express {
    interface Request {
      user?: { id: number; role: Role };
    }
  }
}
