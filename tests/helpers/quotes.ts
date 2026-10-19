import { randomUUID } from 'node:crypto';
import { fixtures, adminQuery, asLocalUser } from './database';
import { saveQuote, transitionQuote, getQuoteEditor } from '@/lib/quotes/service';

export const quoteCommand = (expectedVersion = 0) => ({ expectedVersion, idempotencyKey: randomUUID() });
export const fixtureQuoteInput = () => ({
  clientId: fixtures.pbcClientId, propertyId: fixtures.pbcPropertyId, title: 'Local test repaint',
  workType: 'Interior', terms: 'Test terms', internalMemo: 'Internal only',
  calculation: { materials: [{ id: 'wall', name: 'Custom wall paint', marketPrice: '100', actualPrice: '80', quantity: '2', workingDays: '1', labourPerDay: '2', isCustom: true, areaScope: 'interior' }], selectedMin: 3, selectedMax: 3 },
  publicLines: [{ id: 'public', kind: 'line_item', name: 'Painting service', description: 'Walls', quantity: '1', unitPrice: '1000', taxable: true, clientVisible: true }, { id: 'optional', kind: 'line_item', name: 'Extra', description: '', quantity: '1', unitPrice: '200', taxable: true, clientVisible: true, optional: true, selected: false }],
});
export async function approveFixtureQuote(): Promise<{ id: string; total: string }> {
  return asLocalUser(fixtures.pbcAdmin, async () => {
    const saved = await saveQuote(fixtureQuoteInput(), quoteCommand()); if (!saved.ok) throw new Error(saved.error.message);
    const issued = await transitionQuote(saved.data.id, 'issued', quoteCommand(1)); if (!issued.ok) throw new Error(issued.error.message);
    const approved = await transitionQuote(saved.data.id, 'approved', quoteCommand(2)); if (!approved.ok) throw new Error(approved.error.message);
    return { id: saved.data.id, total: (await getQuoteEditor(saved.data.id))!.revision.total };
  });
}
export async function changeFixtureProductPrice(price: string): Promise<void> {
  await adminQuery('update ems.products set price=$1::numeric,data=jsonb_set(data,\'{marketPrice}\',to_jsonb($1::text)) where organization_id=$2', [price, fixtures.pbcOrganizationId]);
}
export async function getApprovedRevision(id: string): Promise<{ total: string }> {
  const [row] = await adminQuery<{ total: string }>('select r.total from ems.quotes q join ems.quote_revisions r on r.id=q.approved_revision_id where q.id=$1', [id]);
  if (!row) throw new Error('No approved revision'); return row;
}
