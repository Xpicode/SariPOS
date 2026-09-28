import { describe, expect, it } from 'vitest';
import {
  daysLate,
  interestPreview,
  isOverdue,
  limitUsed,
  percentLabel,
  reminderText,
} from './utang';

describe('utang helpers', () => {
  it('reminder names the customer and the exact balance', () => {
    const text = reminderText('Aling Nena', 25050, new Date('2026-09-28T03:00:00Z'));
    expect(text).toContain('Hi Aling Nena!');
    expect(text).toContain('₱250.50');
    expect(text).toContain('September 28');
  });
  it('limit bar stays within 0–100', () => {
    expect(limitUsed(25000, 50000)).toBe(50);
    expect(limitUsed(90000, 50000)).toBe(100); // over the limit (e.g. the owner lowered it)
    expect(limitUsed(-5000, 50000)).toBe(0); // store owes them
    expect(limitUsed(100, 0)).toBe(100);
  });
});

describe('due dates and interest', () => {
  it('overdue only when the date passed AND they still owe', () => {
    expect(isOverdue({ pastDue: true, balance: 100 })).toBe(true);
    expect(isOverdue({ pastDue: true, balance: 0 })).toBe(false);
    expect(isOverdue({ pastDue: false, balance: 100 })).toBe(false);
  });
  it('5% of ₱400 = ₱20; rounded down like the server', () => {
    expect(interestPreview(40_000, 500)).toBe(2_000);
    expect(interestPreview(333, 250)).toBe(8);
  });
  it('days late', () => {
    expect(daysLate('2026-09-20', '2026-09-28')).toBe(8);
    expect(daysLate('2026-09-28', '2026-09-28')).toBe(0);
  });
  it('percent label', () => {
    expect(percentLabel(500)).toBe('5%');
    expect(percentLabel(250)).toBe('2.5%');
  });
});
