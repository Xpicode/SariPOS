import { describe, expect, it } from 'vitest';
import { limitUsed, reminderText } from './utang';

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
