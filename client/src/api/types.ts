export type Role = 'OWNER' | 'CASHIER';

// The logged-in user, as returned by /auth/login and /auth/refresh.
export type User = { id: number; username: string; fullName: string; role: Role };

export type Session = { accessToken: string; user: User };

export type Category = { id: number; name: string };

export type Unit = {
  id: number;
  unitName: string;
  factor: number; // how many base units one of these holds
  barcode: string | null;
  priceCentavos: number;
  costCentavos?: number; // only sent to owners
  isDefault: boolean;
};

export type Product = {
  id: number;
  name: string;
  categoryId: number | null;
  categoryName: string | null;
  baseUnit: string;
  stockQty: number; // in base units
  reorderLevel: number;
  isActive: boolean;
  isLowStock: boolean;
  units: Unit[];
};

export type MovementType = 'STOCK_IN' | 'SALE' | 'VOID_RETURN' | 'ADJUSTMENT' | 'SPOILAGE';

export type Movement = {
  id: number;
  type: MovementType;
  qtyChange: number;
  unitCost: number | null;
  expiryDate: string | null;
  note: string | null;
  createdAt: string;
  createdBy: string;
};

export type ExpiringItem = {
  movementId: number;
  productId: number;
  name: string;
  baseUnit: string;
  expiryDate: string;
  qtyLeft: number;
  daysLeft: number; // negative = already expired
};

// A row on the Users page (OWNER only).
export type ManagedUser = User & {
  isActive: boolean;
  hasPin: boolean;
  lockedUntil: string | null;
  createdAt: string;
};

export type ExpenseCategory =
  | 'SUPPLIES'
  | 'ELECTRIC'
  | 'WATER'
  | 'RENT'
  | 'TRANSPORT'
  | 'SALARY'
  | 'OTHER'
  | 'OWNER_WITHDRAWAL';

export type Expense = {
  id: number;
  category: ExpenseCategory;
  amount: number;
  paidFromDrawer: boolean;
  note: string | null;
  cashSessionId: number | null;
  createdBy: string;
  createdAt: string;
};

// A shift of the cash drawer with its money summary (the Z-report once closed).
// Fields that are null for a cashier while the shift is open: the "blind count" (the server
// hides what the drawer should hold until the cashier's count is saved).
export type CashSession = {
  id: number;
  status: 'OPEN' | 'CLOSED';
  openedAt: string;
  openedBy: string;
  closedAt: string | null;
  closedBy: string | null;
  openingCash: number;
  expectedCash: number | null;
  actualCash: number | null;
  overShort: number | null; // actual − expected: + over, − short
  cashCount: Record<string, number> | null; // centavo value -> how many bills/coins
  notes: string | null;
  sales: {
    cashCount: number;
    cashTotal: number | null;
    gcashCount: number;
    gcashTotal: number | null;
    voidedCount: number;
    voidedTotal: number | null;
    utangCount: number;
    utangTotal: number | null;
  };
  utangPayments: number | null; // cash received for utang during the shift
  utangPaymentCount: number;
  ewalletCash: number | null;
  drawerExpenses: number;
  expenses: Pick<Expense, 'id' | 'category' | 'amount' | 'note' | 'createdBy' | 'createdAt'>[];
};

// A row in the owner's shift history.
export type ShiftSummary = Pick<
  CashSession,
  | 'id'
  | 'openedAt'
  | 'openedBy'
  | 'closedAt'
  | 'closedBy'
  | 'openingCash'
  | 'expectedCash'
  | 'actualCash'
  | 'overShort'
>;

export type PaymentType = 'CASH' | 'GCASH' | 'UTANG';
export type SaleStatus = 'COMPLETED' | 'VOIDED';

export type SaleItem = {
  productId: number;
  productName: string;
  unitName: string;
  qty: number;
  unitPrice: number; // centavos, as charged (snapshot)
  lineTotal: number;
};

// A receipt. All money in centavos.
export type Sale = {
  id: number;
  saleNo: string;
  cashSessionId: number;
  cashierId: number;
  cashierName: string;
  paymentType: PaymentType;
  subtotal: number;
  discount: number;
  total: number;
  amountTendered: number | null; // cash only
  changeGiven: number | null; // cash only
  gcashRefNo: string | null;
  status: SaleStatus;
  voidReason: string | null;
  voidedBy: string | null;
  customerId: number | null; // utang only
  customerName: string | null;
  createdAt: string;
  items: SaleItem[];
};

// A row in the sales list.
export type SaleSummary = Pick<
  Sale,
  'id' | 'saleNo' | 'createdAt' | 'paymentType' | 'total' | 'status' | 'cashierName' | 'customerName'
> & { itemCount: number };

// An utang customer. Cashiers get the phone masked (0917****567) and no address.
export type Customer = {
  id: number;
  name: string;
  phone: string | null;
  address: string | null;
  creditLimit: number;
  isBlocked: boolean;
  balance: number; // owed now; negative = the store owes them
  createdAt: string;
};

// One line of the statement, with the balance right after it (like a passbook).
export type LedgerEntry = {
  id: number;
  type: 'CHARGE' | 'PAYMENT' | 'ADJUSTMENT';
  amount: number;
  note: string | null;
  createdAt: string;
  createdBy: string;
  saleId: number | null;
  saleNo: string | null;
  balance: number;
};

export type AgingBucket = '0-7' | '8-15' | '16-30' | '30+';

export type AgingReport = {
  buckets: { bucket: AgingBucket; count: number; total: number }[];
  customers: (Pick<Customer, 'id' | 'name' | 'phone' | 'creditLimit' | 'isBlocked' | 'balance'> & {
    oldestUnpaid: string;
    daysOwed: number;
    bucket: AgingBucket;
  })[];
};
