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
  ewalletCash: number | null; // net cash from GCash / load (in − out)
  ewalletCount: number;
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
  | 'id'
  | 'saleNo'
  | 'createdAt'
  | 'paymentType'
  | 'total'
  | 'status'
  | 'cashierName'
  | 'customerName'
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

export type WalletKind = 'GCASH' | 'MAYA' | 'ELOAD';

// An e-wallet the store holds (the GCash app, the load retailer app). All money in centavos.
export type Wallet = {
  id: number;
  name: string;
  kind: WalletKind;
  balance: number;
  lowBalanceAlert: number;
  commissionBp: number; // load only: 300 = the store keeps 3%
  isLow: boolean;
};

export type EwalletTxnType = 'CASH_IN' | 'CASH_OUT' | 'ELOAD' | 'TOP_UP' | 'WITHDRAW';
export type Telco = 'GLOBE' | 'TM' | 'SMART' | 'TNT' | 'DITO';

// What one transaction did to the two pockets (plan 6.4). Cashiers get the number masked.
export type EwalletTxn = {
  id: number;
  type: EwalletTxnType;
  accountId: number;
  accountName: string;
  amount: number;
  fee: number; // what the store earned
  walletChange: number;
  cashChange: number; // + into the drawer, − paid out of it
  customerNumber: string | null;
  customerName: string | null;
  feeVia: FeeVia; // how the customer paid the fee: cash into the drawer, or GCash into the wallet
  referenceNo: string | null;
  telco: Telco | null;
  cashSessionId: number | null;
  createdBy: string;
  createdAt: string;
};

export type FeeVia = 'CASH' | 'GCASH';

// The server's answer to "what would this cost?", before confirming. standardFee = what the fee
// rules say (differs from fee only when the owner typed their own; null = no rule covers it).
export type FeeQuote = {
  fee: number;
  feeVia: FeeVia;
  walletChange: number;
  cashChange: number;
  standardFee: number | null;
};

export type FeeRule = {
  walletKind: WalletKind;
  txnType: 'CASH_IN' | 'CASH_OUT';
  minAmount: number;
  maxAmount: number;
  fee: number;
};

// What one product sold over some store days (owner only). Active products that didn't sell
// are included with 0: those are the slow movers.
export type ProductSales = {
  productId: number;
  name: string;
  baseUnit: string;
  units: { unitName: string; factor: number }[];
  stockQty: number;
  saleCount: number; // how many receipts had it
  qtySold: number; // in base units
  revenue: number;
  profit: number;
  lastSoldAt: string | null; // ever, not only in the range
};

// Profit by source (plan 6.7). All centavos.
export type ProfitReport = {
  from: string;
  to: string;
  products: { revenue: number; cost: number; profit: number; saleCount: number };
  gcash: { count: number; earned: number };
  eload: { count: number; earned: number };
  expenses: {
    byCategory: { category: ExpenseCategory; count: number; total: number }[];
    total: number;
  };
  ownerWithdrawals: number; // money taken home: not a cost, shown apart
  netProfit: number;
};

export type TrendDay = { day: string; sales: number; profit: number; count: number };
export type PeakHour = { hour: number; count: number; sales: number };

export type Dashboard = {
  day: string;
  sales: number;
  netProfit: number;
  transactions: { sales: number; ewallet: number };
  wallets: Wallet[];
  topUtang: { id: number; name: string; balance: number }[];
};

export type AuditEntry = {
  id: number;
  createdAt: string;
  action: string;
  entity: string | null;
  entityId: number | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ip: string | null;
  userId: number | null;
  userName: string | null;
};
