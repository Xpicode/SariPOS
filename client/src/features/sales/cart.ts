import type { Product, Unit } from '@/api/types';

// The cart is plain data + pure functions (easy to test, no hidden state).
// Prices shown here are only a preview: the server charges from the database.
export type CartLine = { product: Product; unitId: number; qty: number };

export const MAX_QTY = 10_000; // same limit as the server

export const unitOf = (l: CartLine): Unit => l.product.units.find((u) => u.id === l.unitId)!;
export const lineTotal = (l: CartLine) => unitOf(l).priceCentavos * l.qty;
export const cartTotal = (cart: CartLine[]) => cart.reduce((sum, l) => sum + lineTotal(l), 0);
export const itemCount = (cart: CartLine[]) => cart.reduce((sum, l) => sum + l.qty, 0);

const clampQty = (n: number) => Math.min(MAX_QTY, Math.max(1, Math.floor(n)));

// Same unit again = one more of it, not a second line.
export function addToCart(cart: CartLine[], product: Product, unitId: number, qty = 1) {
  const i = cart.findIndex((l) => l.unitId === unitId);
  if (i === -1) return [...cart, { product, unitId, qty: clampQty(qty) }];
  return cart.map((l, j) => (j === i ? { ...l, qty: clampQty(l.qty + qty) } : l));
}

export const setQty = (cart: CartLine[], unitId: number, qty: number) =>
  cart.map((l) => (l.unitId === unitId ? { ...l, qty: clampQty(qty) } : l));

export const removeLine = (cart: CartLine[], unitId: number) =>
  cart.filter((l) => l.unitId !== unitId);

// Switching a line from "stick" to "pack": if packs are already in the cart, merge into that line.
export function changeUnit(cart: CartLine[], fromUnitId: number, toUnitId: number) {
  const from = cart.find((l) => l.unitId === fromUnitId);
  if (!from || fromUnitId === toUnitId) return cart;
  if (cart.some((l) => l.unitId === toUnitId)) {
    return addToCart(removeLine(cart, fromUnitId), from.product, toUnitId, from.qty);
  }
  return cart.map((l) => (l.unitId === fromUnitId ? { ...l, unitId: toUnitId } : l));
}

// Products whose lines together need more than the last known stock (in base units).
// A pack and loose sticks of the same product share one count.
export function shortages(cart: CartLine[]) {
  const needed = new Map<number, number>();
  for (const l of cart) {
    needed.set(l.product.id, (needed.get(l.product.id) ?? 0) + l.qty * unitOf(l).factor);
  }
  const short = new Map<number, { needed: number; stock: number }>();
  for (const l of cart) {
    const n = needed.get(l.product.id)!;
    if (n > l.product.stockQty) short.set(l.product.id, { needed: n, stock: l.product.stockQty });
  }
  return short;
}

// Swap in freshly loaded products (after "prices changed" / "not enough stock").
// Lines whose unit is no longer sold are dropped and named, so the cashier knows.
export function refreshLines(cart: CartLine[], fresh: Map<number, Product | null>) {
  const removed: string[] = [];
  const next: CartLine[] = [];
  for (const l of cart) {
    const p = fresh.get(l.product.id);
    if (p?.isActive && p.units.some((u) => u.id === l.unitId)) next.push({ ...l, product: p });
    else removed.push(l.product.name);
  }
  return { cart: next, removed };
}

const BILLS = [2_000, 5_000, 10_000, 20_000, 50_000, 100_000]; // ₱20 ... ₱1,000, in centavos

// Quick-cash buttons: the amounts a customer is likely to hand over for this total.
//   ₱123 -> ₱140, ₱150, ₱200, ₱500
export function cashSuggestions(total: number, max = 4) {
  const amounts = new Set<number>();
  for (const bill of BILLS) {
    const rounded = Math.ceil(total / bill) * bill;
    if (rounded > total) amounts.add(rounded);
  }
  return [...amounts].sort((a, b) => a - b).slice(0, max);
}
