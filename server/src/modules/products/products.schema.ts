import { z } from 'zod';

// Money is whole centavos. ₱1,000,000 per unit is far above any sari-sari item
// and stops typos (an extra 000) from reaching the database.
export const MAX_CENTAVOS = 100_000_000;
const centavos = z
  .number()
  .int('Money must be whole centavos')
  .min(0, 'Amount can’t be negative')
  .max(MAX_CENTAVOS, 'Amount is too large');

const id = z.number().int().positive();

// EAN-13, UPC, Code 128 etc. are letters/digits; nothing else belongs in a barcode.
export const barcodeSchema = z
  .string()
  .trim()
  .regex(/^[0-9A-Za-z-]{3,50}$/, 'Barcode: 3–50 letters, numbers or -');

const unitSchema = z.object({
  id: id.optional(), // present = an existing unit (edit); absent = a new unit
  unitName: z.string().trim().toLowerCase().min(1, 'Name every unit').max(30),
  // How many base units one of these holds (pack = 20 sticks). Capped so qty × factor
  // can never overflow the INT stock column.
  factor: z.number().int().min(1, 'A unit holds at least 1').max(10_000),
  barcode: barcodeSchema.nullable(),
  costCentavos: centavos,
  priceCentavos: centavos,
  isDefault: z.boolean(),
});

const unitsSchema = z
  .array(unitSchema)
  .min(1, 'Add at least one selling unit')
  .max(10, 'At most 10 units')
  .refine((u) => u.filter((x) => x.isDefault).length === 1, 'Pick exactly one default unit')
  .refine(
    (u) => new Set(u.map((x) => x.unitName)).size === u.length,
    'Unit names must be different',
  )
  .refine((u) => {
    const codes = u.map((x) => x.barcode).filter(Boolean);
    return new Set(codes).size === codes.length;
  }, 'Each barcode can only be used once')
  .refine((u) => {
    const ids = u.map((x) => x.id).filter(Boolean);
    return new Set(ids).size === ids.length;
  }, 'Duplicate unit');

const name = z.string().trim().min(1, 'Enter a product name').max(120);
const reorderLevel = z.number().int().min(0).max(1_000_000);

export const createProductSchema = z.object({
  name,
  categoryId: id.nullable(),
  baseUnit: z.string().trim().toLowerCase().min(1, 'Enter the base unit').max(20),
  reorderLevel,
  units: unitsSchema,
});

// baseUnit is fixed after creation: stock is counted in it, so changing it would silently
// change what every existing stock number means. stockQty is never editable here: stock only
// changes through stock-in / adjust, which write the ledger.
export const updateProductSchema = z
  .object({
    name: name.optional(),
    categoryId: id.nullable().optional(), // null = remove category
    reorderLevel: reorderLevel.optional(),
    isActive: z.boolean().optional(),
    units: unitsSchema.optional(), // the full list; units left out are removed (deactivated)
  })
  .refine((o) => Object.values(o).some((v) => v !== undefined), 'Nothing to update');

export const listQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  lowStock: z.stringbool().optional(),
  includeInactive: z.stringbool().optional(),
});

export const categorySchema = z.object({
  name: z.string().trim().min(1, 'Enter a category name').max(60),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type UnitInput = z.infer<typeof unitSchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
