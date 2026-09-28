import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '@/api/types';
import { newUuid } from '@/lib/uuid';
import {
  addToCart,
  cartTotal,
  cashSuggestions,
  changeUnit,
  refreshLines,
  setQty,
  shortages,
  type CartLine,
} from './cart';

const cig: Product = {
  id: 1,
  name: 'Fortune',
  categoryId: null,
  categoryName: null,
  baseUnit: 'stick',
  stockQty: 45,
  reorderLevel: 40,
  isActive: true,
  isLowStock: false,
  units: [
    { id: 10, unitName: 'stick', factor: 1, barcode: null, priceCentavos: 800, isDefault: true },
    { id: 11, unitName: 'pack', factor: 20, barcode: null, priceCentavos: 15000, isDefault: false },
  ],
};

describe('cart', () => {
  it('same unit twice = one line, qty 2', () => {
    const cart = addToCart(addToCart([], cig, 10), cig, 10);
    expect(cart).toHaveLength(1);
    expect(cart[0].qty).toBe(2);
    expect(cartTotal(cart)).toBe(1600);
  });

  it('qty stays between 1 and 10,000', () => {
    const cart = addToCart([], cig, 10);
    expect(setQty(cart, 10, 0)[0].qty).toBe(1);
    expect(setQty(cart, 10, 99_999)[0].qty).toBe(10_000);
  });

  it('switching unit merges into an existing line', () => {
    let cart: CartLine[] = addToCart(addToCart([], cig, 10, 3), cig, 11, 1);
    cart = changeUnit(cart, 10, 11);
    expect(cart).toEqual([{ product: cig, unitId: 11, qty: 4 }]);
  });

  it('pack + sticks share one stock count (tingi)', () => {
    const cart = addToCart(addToCart([], cig, 11, 2), cig, 10, 5); // 40 + 5 = 45: exactly enough
    expect(shortages(cart).size).toBe(0);
    expect(shortages(setQty(cart, 10, 6)).get(1)).toEqual({ needed: 46, stock: 45 });
  });

  it('refresh swaps in new prices and drops units no longer sold', () => {
    const cart = addToCart(addToCart([], cig, 10), cig, 11);
    const repriced = {
      ...cig,
      units: [{ ...cig.units[0], priceCentavos: 900 }], // pack removed, stick repriced
    };
    const { cart: next, removed } = refreshLines(cart, new Map([[1, repriced]]));
    expect(cartTotal(next)).toBe(900);
    expect(removed).toEqual(['Fortune']);
  });

  it('quick cash amounts', () => {
    expect(cashSuggestions(12_300)).toEqual([14_000, 15_000, 20_000, 50_000]);
    // ₱100 exactly: the next amounts people really hand over. "Exact" is its own button.
    expect(cashSuggestions(10_000)).toEqual([20_000, 50_000, 100_000]);
    expect(cashSuggestions(123_400)).toEqual([124_000, 125_000, 130_000, 140_000]);
    expect(cashSuggestions(100_000)).toEqual([]); // ₱1,000 on the dot: only "Exact"
  });
});

describe('newUuid', () => {
  afterEach(() => vi.unstubAllGlobals());
  const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  it('is a v4 UUID, also where crypto.randomUUID is missing (http on a LAN phone)', () => {
    expect(newUuid()).toMatch(V4);
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });
    const a = newUuid();
    expect(a).toMatch(V4);
    expect(newUuid()).not.toBe(a);
  });
});
