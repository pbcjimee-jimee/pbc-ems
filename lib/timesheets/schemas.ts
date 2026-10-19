import { z } from 'zod';
export { commandMetaSchema, invalidResult } from '@/lib/clients/schemas';
export const timeEntrySchema = z.object({ id: z.uuid().optional(), jobId: z.uuid().nullable().optional(), visitId: z.uuid().nullable().optional(), startedAt: z.iso.datetime({ offset: true }), endedAt: z.iso.datetime({ offset: true }), breakMinutes: z.number().int().min(0).max(1440), notes: z.string().max(10000).default('') }).strict();
export const entrySelectionSchema = z.array(z.object({ id: z.uuid(), version: z.number().int().positive() }).strict()).min(1).max(100).refine(rows => new Set(rows.map(r => r.id)).size === rows.length, 'Choose each entry once.');
const optionalId = z.preprocess(value => value === '' ? undefined : value, z.uuid().optional());
export const timeFilterSchema = z.object({ from: z.union([z.iso.date(), z.literal('')]).default(''), to: z.union([z.iso.date(), z.literal('')]).default(''), jobId: optionalId, entryId: optionalId, userId: optionalId, status: z.enum(['all', 'draft', 'submitted', 'approved']).default('all'), scope: z.enum(['own', 'all']).default('own') });
