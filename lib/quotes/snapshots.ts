import 'server-only';
import type { EmsTx } from '@/lib/db/transaction';
import type { CommercialSnapshot, CustomerSnapshot, DocumentCompany } from '@/lib/documents/types';
import { WorkflowError } from '@/lib/workflows/commands';
import type { QuoteInput } from './schemas';
export async function customerSnapshot(tx: EmsTx, input: QuoteInput): Promise<CustomerSnapshot> {
  const [customer] = await tx.query<Omit<CustomerSnapshot,'propertyAddress'>>('select display_name as name,company_name as company,email,phone,billing_address as "billingAddress" from ems.clients where id=$1 and organization_id=$2 and archived_at is null for share', [input.clientId,tx.actor.organizationId]);
  if (!customer) throw new WorkflowError('INVALID_CLIENT','Choose an active customer.');
  let propertyAddress: string | null = null;
  if (input.propertyId) {
    const [property] = await tx.query<{ address: string }>('select address from ems.properties where id=$1 and organization_id=$2 and client_id=$3 and archived_at is null for share',[input.propertyId,tx.actor.organizationId,input.clientId]);
    if (!property) throw new WorkflowError('INVALID_PROPERTY','Choose a site belonging to this customer.'); propertyAddress=property.address;
  }
  if (input.requestId) {
    const [request] = await tx.query('select id from ems.requests where id=$1 and organization_id=$2 and client_id=$3 and (property_id is null or property_id is not distinct from $4::uuid) for share',[input.requestId,tx.actor.organizationId,input.clientId,input.propertyId ?? null]);
    if (!request) throw new WorkflowError('INVALID_REQUEST','Choose a request belonging to this customer and site.');
  }
  return { ...customer, propertyAddress };
}
export async function commercialSnapshot(tx: EmsTx, input: QuoteInput): Promise<CommercialSnapshot> {
  const [organization] = await tx.query<{ settings: Record<string, unknown> }>('select settings from ems.organizations where id=$1',[tx.actor.organizationId]);
  const company: DocumentCompany = { name: tx.actor.organizationName };
  for (const key of ['legalName','abn','address','email','phone','bankDetails'] as const) if (typeof organization.settings[key]==='string') company[key]=organization.settings[key];
  return { publicLines: input.publicLines, terms: input.terms, workType: input.workType, company, source: { clientId: input.clientId, propertyId: input.propertyId ?? null, requestId: input.requestId ?? null }, document: { title: input.title, validUntil: input.validUntil ?? null } };
}
