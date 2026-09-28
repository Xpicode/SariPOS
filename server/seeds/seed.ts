// Dev seed: wipes all data and loads a sample sari-sari store.
// Run: npm run seed   (needs SEED_* vars in .env)
import argon2 from 'argon2';
import { env } from '../src/config/env';
import { pool } from '../src/db/pool';
import { withTransaction } from '../src/db/transaction';

if (env.NODE_ENV === 'production') throw new Error('Refusing to seed a production database');

const { SEED_OWNER_PASSWORD, SEED_CASHIER_PASSWORD, SEED_OWNER_PIN } = process.env;
if (!SEED_OWNER_PASSWORD || !SEED_CASHIER_PASSWORD || !SEED_OWNER_PIN) {
  throw new Error('Set SEED_OWNER_PASSWORD, SEED_CASHIER_PASSWORD and SEED_OWNER_PIN in .env');
}
// Same policy the app enforces (plan 8.4), so dev accounts are never weaker than real ones.
if (SEED_OWNER_PASSWORD.length < 8 || SEED_CASHIER_PASSWORD.length < 8) {
  throw new Error('Seed passwords must be at least 8 characters');
}
if (!/^\d{4,6}$/.test(SEED_OWNER_PIN)) throw new Error('SEED_OWNER_PIN must be 4-6 digits');

const c = (pesos: number) => Math.round(pesos * 100); // pesos -> centavos

// [unit_name, factor, cost ₱, price ₱]; first unit is the default selling unit
type Unit = [string, number, number, number];
type Product = {
  name: string;
  cat: string;
  base?: string;
  stock: number;
  reorder?: number;
  units: Unit[];
};

const CATEGORIES = [
  'Beverages',
  'Snacks & Candies',
  'Canned Goods & Noodles',
  'Household & Personal Care',
  'Cigarettes',
];

const PRODUCTS: Product[] = [
  // Beverages
  { name: 'Coca-Cola 1.5L', cat: 'Beverages', stock: 12, units: [['bottle', 1, 68, 75]] },
  {
    name: 'Coke Mismo 290ml',
    cat: 'Beverages',
    stock: 24,
    units: [
      ['bottle', 1, 17, 20],
      ['case', 12, 200, 230],
    ],
  },
  { name: 'Royal Tru-Orange 1L', cat: 'Beverages', stock: 10, units: [['bottle', 1, 50, 58]] },
  { name: 'C2 Apple 230ml', cat: 'Beverages', stock: 24, units: [['bottle', 1, 13, 16]] },
  {
    name: 'Absolute Distilled Water 500ml',
    cat: 'Beverages',
    stock: 24,
    units: [['bottle', 1, 12, 15]],
  },
  {
    name: 'Nescafé Original 3-in-1',
    cat: 'Beverages',
    stock: 60,
    reorder: 10,
    units: [
      ['sachet', 1, 7.5, 9],
      ['tali', 10, 72, 85],
    ],
  },
  {
    name: 'Kopiko Brown Coffee',
    cat: 'Beverages',
    stock: 60,
    reorder: 10,
    units: [
      ['sachet', 1, 8, 10],
      ['tali', 10, 78, 95],
    ],
  },
  {
    name: 'Milo 22g',
    cat: 'Beverages',
    stock: 40,
    reorder: 10,
    units: [
      ['sachet', 1, 8.5, 10],
      ['tali', 10, 82, 97],
    ],
  },
  {
    name: 'Bear Brand Swak 33g',
    cat: 'Beverages',
    stock: 30,
    reorder: 10,
    units: [['sachet', 1, 11, 13]],
  },

  // Snacks & Candies
  { name: 'Piattos Cheese 40g', cat: 'Snacks & Candies', stock: 20, units: [['pack', 1, 17, 20]] },
  { name: 'Nova Multigrain 40g', cat: 'Snacks & Candies', stock: 20, units: [['pack', 1, 17, 20]] },
  {
    name: 'Boy Bawang Cornick 100g',
    cat: 'Snacks & Candies',
    stock: 15,
    units: [['pack', 1, 22, 26]],
  },
  {
    name: 'SkyFlakes Crackers 25g',
    cat: 'Snacks & Candies',
    stock: 50,
    reorder: 10,
    units: [
      ['pack', 1, 6, 7],
      ['bundle', 10, 55, 65],
    ],
  },
  {
    name: 'Rebisco Sandwich 32g',
    cat: 'Snacks & Candies',
    stock: 50,
    reorder: 10,
    units: [
      ['pack', 1, 7, 8],
      ['bundle', 10, 65, 75],
    ],
  },
  {
    name: 'Choc Nut',
    cat: 'Snacks & Candies',
    stock: 72,
    reorder: 24,
    units: [
      ['pc', 1, 1.5, 2],
      ['box', 24, 36, 45],
    ],
  },
  {
    name: 'Maxx Menthol Candy',
    cat: 'Snacks & Candies',
    stock: 100,
    reorder: 20,
    units: [
      ['pc', 1, 0.8, 1],
      ['pack', 50, 38, 45],
    ],
  },

  // Canned Goods & Noodles
  {
    name: 'Lucky Me Pancit Canton Original 60g',
    cat: 'Canned Goods & Noodles',
    stock: 72,
    reorder: 12,
    units: [
      ['pc', 1, 14, 16],
      ['box', 72, 980, 1100],
    ],
  },
  {
    name: 'Lucky Me Beef Mami 55g',
    cat: 'Canned Goods & Noodles',
    stock: 48,
    reorder: 12,
    units: [['pc', 1, 9.5, 11]],
  },
  {
    name: 'Nissin Cup Noodles Seafood',
    cat: 'Canned Goods & Noodles',
    stock: 12,
    units: [['cup', 1, 22, 26]],
  },
  {
    name: 'Argentina Corned Beef 150g',
    cat: 'Canned Goods & Noodles',
    stock: 12,
    units: [['can', 1, 36, 42]],
  },
  {
    name: 'Century Tuna Flakes in Oil 155g',
    cat: 'Canned Goods & Noodles',
    stock: 12,
    units: [['can', 1, 36, 42]],
  },
  {
    name: '555 Sardines Tomato Sauce 155g',
    cat: 'Canned Goods & Noodles',
    stock: 24,
    units: [['can', 1, 21, 25]],
  },
  {
    name: 'Ligo Sardines Tomato Sauce 155g',
    cat: 'Canned Goods & Noodles',
    stock: 24,
    units: [['can', 1, 22, 26]],
  },
  {
    name: 'Sinandomeng Rice',
    cat: 'Canned Goods & Noodles',
    base: 'g',
    stock: 25000,
    reorder: 5000,
    units: [
      ['kilo', 1000, 48, 55],
      ['half kilo', 500, 24, 28],
    ],
  },
  {
    name: 'Brown Sugar',
    cat: 'Canned Goods & Noodles',
    base: 'g',
    stock: 5000,
    reorder: 1000,
    units: [
      ['quarter kilo', 250, 17, 20],
      ['kilo', 1000, 68, 78],
    ],
  },

  // Household & Personal Care
  {
    name: 'Safeguard Pure White 60g',
    cat: 'Household & Personal Care',
    stock: 12,
    units: [['bar', 1, 26, 30]],
  },
  {
    name: 'Palmolive Shampoo 12ml',
    cat: 'Household & Personal Care',
    stock: 48,
    reorder: 12,
    units: [
      ['sachet', 1, 5.5, 7],
      ['tali', 12, 62, 78],
    ],
  },
  {
    name: 'Surf Powder Detergent 65g',
    cat: 'Household & Personal Care',
    stock: 36,
    reorder: 12,
    units: [
      ['sachet', 1, 6.5, 8],
      ['tali', 6, 38, 46],
    ],
  },
  {
    name: 'Joy Dishwashing Liquid 20ml',
    cat: 'Household & Personal Care',
    stock: 36,
    reorder: 12,
    units: [['sachet', 1, 5, 6]],
  },
  {
    name: 'Silver Swan Soy Sauce 200ml',
    cat: 'Household & Personal Care',
    stock: 12,
    units: [['bottle', 1, 12, 15]],
  },

  // Cigarettes (base unit = stick)
  {
    name: 'Fortune International Red',
    cat: 'Cigarettes',
    base: 'stick',
    stock: 200,
    reorder: 40,
    units: [
      ['stick', 1, 7, 8],
      ['pack', 20, 135, 150],
      ['ream', 200, 1300, 1450],
    ],
  },
  {
    name: 'Winston Red',
    cat: 'Cigarettes',
    base: 'stick',
    stock: 200,
    reorder: 40,
    units: [
      ['stick', 1, 8, 9],
      ['pack', 20, 150, 170],
      ['ream', 200, 1450, 1650],
    ],
  },
];

async function seed() {
  const [ownerHash, cashierHash, pinHash] = await Promise.all([
    argon2.hash(SEED_OWNER_PASSWORD!),
    argon2.hash(SEED_CASHIER_PASSWORD!),
    argon2.hash(SEED_OWNER_PIN!),
  ]);

  await withTransaction(async (db) => {
    await db.query(`TRUNCATE users, refresh_tokens, categories, products, product_units, price_history,
      stock_movements, cash_sessions, customers, sales, sale_items, credit_ledger, ewallet_accounts,
      fee_rules, ewallet_transactions, expenses, audit_logs, sale_counters RESTART IDENTITY CASCADE`);

    const {
      rows: [owner],
    } = await db.query(
      `INSERT INTO users (username, full_name, password_hash, pin_hash, role)
       VALUES ('owner', 'Store Owner', $1, $2, 'OWNER') RETURNING id`,
      [ownerHash, pinHash],
    );
    await db.query(
      `INSERT INTO users (username, full_name, password_hash, role)
       VALUES ('cashier', 'Bantay', $1, 'CASHIER')`,
      [cashierHash],
    );

    const catIds = new Map<string, number>();
    for (const name of CATEGORIES) {
      const { rows } = await db.query('INSERT INTO categories (name) VALUES ($1) RETURNING id', [
        name,
      ]);
      catIds.set(name, rows[0].id);
    }

    for (const p of PRODUCTS) {
      const {
        rows: [prod],
      } = await db.query(
        `INSERT INTO products (name, category_id, base_unit, stock_qty, reorder_level)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [p.name, catIds.get(p.cat), p.base ?? 'pc', p.stock, p.reorder ?? 5],
      );
      for (const [i, [unit, factor, cost, price]] of p.units.entries()) {
        await db.query(
          `INSERT INTO product_units (product_id, unit_name, factor, cost_centavos, price_centavos, is_default)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [prod.id, unit, factor, c(cost), c(price), i === 0],
        );
      }
      // Every stock change is a ledger row, including the opening stock.
      const [, factor, cost] = p.units[0];
      await db.query(
        `INSERT INTO stock_movements (product_id, type, qty_change, unit_cost, note, created_by)
         VALUES ($1, 'STOCK_IN', $2, $3, 'Opening stock (seed)', $4)`,
        [prod.id, p.stock, Math.round(c(cost) / factor), owner.id],
      );
    }

    // Wallets start empty; the opening float is a TOP_UP row (from outside the drawer), so the
    // wallet history explains every peso of the balance. Load earns 3% (₱100 of load costs ₱97).
    await db.query(
      `INSERT INTO ewallet_accounts (name, kind, commission_bp) VALUES
       ('GCash (store)', 'GCASH', 0), ('Load Wallet', 'ELOAD', 300)`,
    );
    await db.query(
      `INSERT INTO ewallet_transactions
         (idempotency_key, account_id, type, amount, wallet_change, cash_change, created_by)
       VALUES (gen_random_uuid(), 1, 'TOP_UP', $1, $1, 0, $3),
              (gen_random_uuid(), 2, 'TOP_UP', $2, $2, 0, $3)`,
      [c(5000), c(2000), owner.id],
    );
    await db.query('UPDATE ewallet_accounts SET balance = $1 WHERE id = 1', [c(5000)]);
    await db.query('UPDATE ewallet_accounts SET balance = $1 WHERE id = 2', [c(2000)]);

    // Utang customers (no debt yet: every CHARGE must come from a real sale).
    await db.query(
      `INSERT INTO customers (name, phone, address, credit_limit, is_blocked) VALUES
       ('Aling Nena', '09171234567', 'Purok 2, tabi ng simbahan', $1, FALSE),
       ('Mang Tonyo', '09281234567', NULL, $2, FALSE),
       ('Kuya Jun', NULL, NULL, $3, TRUE)`,
      [c(500), c(1000), c(300)],
    );

    // GCash: ₱10 per ₱500 bracket, up to ₱10,000 (1–500 = ₱10, 500.01–1000 = ₱20, ...)
    for (const txnType of ['CASH_IN', 'CASH_OUT']) {
      for (let i = 1; i <= 20; i++) {
        await db.query(
          `INSERT INTO fee_rules (wallet_kind, txn_type, min_amount, max_amount, fee)
           VALUES ('GCASH', $1, $2, $3, $4)`,
          [txnType, (i - 1) * c(500) + 1, i * c(500), i * c(10)],
        );
      }
    }
  });

  console.log(
    `Seeded: 2 users, ${CATEGORIES.length} categories, ${PRODUCTS.length} products, 3 customers, 2 wallets, 40 fee rules`,
  );
}

seed()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
