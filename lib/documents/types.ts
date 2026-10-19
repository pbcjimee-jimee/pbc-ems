import type { PublicLineDraft } from "@/lib/quotes/types";
export interface CustomerSnapshot {
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  billingAddress: string | null;
  propertyAddress: string | null;
}
export interface DocumentCompany {
  name: string;
  legalName?: string;
  abn?: string;
  address?: string;
  email?: string;
  phone?: string;
  bankDetails?: string;
}
export interface CommercialSnapshot {
  publicLines: PublicLineDraft[];
  terms: string;
  workType?: string;
  company: DocumentCompany;
  source?: { clientId: string; propertyId: string | null; requestId?: string | null };
  document?: { title: string; validUntil: string | null };
}
export interface CustomerDocument {
  kind: "quote" | "invoice";
  id: string;
  number: string;
  title: string;
  status: string;
  date: string;
  dueDate: string | null;
  company: DocumentCompany;
  customer: CustomerSnapshot;
  lines: PublicLineDraft[];
  terms: string;
  subtotal: string;
  tax: string;
  total: string;
  paid: string;
  balance: string;
}

