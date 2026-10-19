import { z } from 'zod';
export { commandMetaSchema, invalidResult } from '@/lib/clients/schemas';
const number = z.string().regex(/^\d+(?:\.\d{1,2})?$/, 'Use a positive number with up to two decimal places.').max(12);
const signed = z.string().regex(/^-?\d+(?:\.\d{1,2})?$/, 'Use a number with up to two decimal places.').max(13);
const key = z.string().min(1).max(100).refine(v => !['__proto__', 'constructor', 'prototype'].includes(v));
const formula = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);
const selection = z.object({ selectedMin: formula, selectedMax: formula });
export const materialSchema = z.object({
  id: key, logicalKey: key.optional(), timberRole: z.enum(['none', 'shared', 'finish']).optional(), productId: z.uuid().optional(),
  name: z.string().max(500), manufacturer: z.string().nullable().optional(), type: z.string().nullable().optional(), unit: z.string().max(100).optional(),
  category: z.string().nullable().optional(), productLine: z.string().nullable().optional(), base: z.string().nullable().optional(), sheen: z.string().nullable().optional(), volumeLitres: z.string().nullable().optional(), productCode: z.string().nullable().optional(),
  memo: z.string().max(4000).optional(), marketPrice: number, actualPrice: number, quantity: number, workingDays: number, labourPerDay: number,
  areaId: z.string().max(100).optional(), areaName: z.string().max(500).optional(), areaScope: z.enum(['interior', 'exterior', 'roof']).optional(), isCustom: z.boolean(),
}).strict();
const override = z.object({ mode: z.enum(['inherit', 'override']), value: number });
export const calculationSchema = z.object({
  materials: z.array(materialSchema).max(200), selectedMin: formula, selectedMax: formula,
  areaFormulaSelections: z.object({ interior: selection, exterior: selection, roof: selection }).optional(), workingDays: number.optional(), labourPerDay: number.optional(),
  options: z.array(z.object({ id: key, title: z.string().max(500), materials: z.array(materialSchema).max(100), selectedMin: formula, selectedMax: formula, isExpanded: z.boolean() })).max(30).optional(),
  paintComparison: z.object({ version: z.literal(1), key, alternatives: z.array(z.object({ targetLogicalKey: key, previousRole: z.enum(['shared', 'finish']), acknowledgedSourceProductId: z.string().nullable(),
    product: z.object({ productId: z.uuid(), name: z.string().max(500), marketPrice: number, actualPrice: number }).optional(), quantity: override, workingDays: override, labourPerDay: override })).max(100), result: z.object({ superSubtotal: signed, aquaSubtotal: signed.nullable(), differenceSubtotal: signed.nullable() }).optional() }).optional(),
}).strict();
const policy = z.enum(['preserve', 'set_true', 'set_false']);
export const publicLineSchema = z.object({ id: key, kind: z.enum(['line_item', 'text']), name: z.string().max(500), description: z.string().max(10000), quantity: number, unitPrice: signed, taxable: z.boolean(), clientVisible: z.boolean(), optional: z.boolean().nullable().optional(), selected: z.boolean().nullable().optional(), recommended: z.boolean().nullable().optional(), optionalWritePolicy: policy.optional(), recommendedWritePolicy: policy.optional(), paintComparisonKey: key.optional() }).strict();
export const quoteSchema = z.object({
  id: z.uuid().optional(), clientId: z.uuid(), propertyId: z.uuid().nullable().optional(), requestId: z.uuid().nullable().optional(), title: z.string().trim().min(1).max(500),
  workType: z.enum(['Interior', 'Exterior', 'Roof', 'Mixed']).default('Interior'), terms: z.string().max(20000).default(''), internalMemo: z.string().max(20000).default(''),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => { const d = new Date(v + 'T12:00:00Z'); return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0,10) === v; }, 'Use a real calendar date.').nullable().optional(),
  calculation: calculationSchema, publicLines: z.array(publicLineSchema).max(200), refreshPricing: z.boolean().default(false),
}).strict().superRefine((value, ctx) => {
  for (const rows of [value.publicLines, value.calculation.materials]) {
    if (new Set(rows.map(r => r.id)).size !== rows.length) ctx.addIssue({ code: 'custom', message: 'Each row needs a unique identifier.' });
  }
});
export type QuoteInput = z.infer<typeof quoteSchema>;
export const quoteStatusSchema = z.enum(['draft', 'issued', 'approved', 'changes_requested', 'declined', 'archived']);
export type QuoteStatus = z.infer<typeof quoteStatusSchema>;
export const pricingSchema = z.object({ f1LabourRate: number, f2LabourRate: number, f3LabourRate: number, f4LabourRate: number, f5LabourRate: number, roofLabourRate: number, f2Margin: number, f3Margin: number, f4Margin: number, f5Margin: number }).strict().refine(v => [v.f2Margin,v.f3Margin,v.f4Margin,v.f5Margin].every(n => Number(n) < 1), 'Margins must be less than 1 (30% = 0.30).');
export const productSchema = z.object({ id: z.uuid().optional(), name: z.string().trim().min(1).max(500), code: z.string().max(100).default(''), unit: z.string().max(100).default('each'), marketPrice: number, actualPrice: number, archived: z.boolean().default(false) }).strict();
export const templateSchema = z.object({ id: z.uuid().optional(), name: z.string().trim().min(1).max(200), data: z.object({ workType: z.enum(['Interior','Exterior','Roof','Mixed']), terms: z.string().max(20000), calculation: calculationSchema, publicLines: z.array(publicLineSchema).max(200) }).strict(), archived: z.boolean().default(false) }).strict();
