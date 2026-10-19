import type { CommercialSnapshot, CustomerSnapshot } from '@/lib/documents/types';
import type { QuoteCalculationSnapshot } from './types';
import type { QuoteInput, QuoteStatus } from './schemas';
export interface CatalogProduct { id: string; version: number; name: string; code: string | null; unit: string; marketPrice: string; actualPrice: string; source: string; }
export type PricingData = QuoteCalculationSnapshot['settings'];
export interface QuoteRevision { id: string; revisionNumber: number; status: QuoteStatus; snapshot: CommercialSnapshot; customer: CustomerSnapshot; subtotal: string; tax: string; total: string; calculation: QuoteCalculationSnapshot; products: CatalogProduct[]; internalMemo: string; }
export interface QuoteEditorData { id: string; version: number; number: string; title: string; status: QuoteStatus; clientId: string; propertyId: string | null; requestId: string | null; validUntil: string | null; approvedRevisionId: string | null; revision: QuoteRevision; history: { id: string; revisionNumber: number; status: QuoteStatus; total: string }[]; }
export interface QuoteTemplate { id: string; version: number; name: string; data: Pick<QuoteInput,'calculation'|'publicLines'|'terms'|'workType'>; }
