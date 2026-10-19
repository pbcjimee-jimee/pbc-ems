import 'server-only';
import { randomUUID } from 'node:crypto';
import Decimal from 'decimal.js';
import { z } from 'zod';
import { withEmsTransaction, type EmsTx } from '@/lib/db/transaction';
import { requireAdmin } from '@/lib/auth/permissions';
import { ValidationError, DEFAULT_PRICING_SETTINGS, type PricingSettings } from '@/lib/calculator';
import type { Result, Versioned } from '@/lib/domain/types';
import { runCommand, recordActivity, requireVersion, WorkflowError } from '@/lib/workflows/commands';
import { calculateQuoteSnapshot, QUOTE_ENGINE_VERSION } from './calculation';
import { calculateCommercialTotals } from './commercial-totals';
import { quoteSchema, quoteStatusSchema, commandMetaSchema, invalidResult, productSchema, pricingSchema, type QuoteInput, type QuoteStatus } from './schemas';
import type { CatalogProduct, QuoteEditorData, QuoteRevision, PricingData, QuoteTemplate } from './service-types';
import type { QuoteCalculationInput, MaterialItem } from './types';
import { customerSnapshot, commercialSnapshot } from './snapshots';

export async function quoteMutation<T>(work: (tx: EmsTx) => Promise<T>): Promise<Result<T>> {
  try { return { ok: true, data: await withEmsTransaction(async tx => {
    if (tx.actor.role !== 'admin') throw new WorkflowError('FORBIDDEN','Administrator permission required.');
    await requireAdmin(tx); return work(tx);
  }) }; } catch (error) {
    if (error instanceof WorkflowError) return { ok: false, error: { code: error.code, message: error.message } };
    if (error instanceof ValidationError) return { ok: false, error: { code: 'VALIDATION', message: error.message } };
    return { ok: false, error: { code: 'SAVE_FAILED', message: 'The quote could not be saved. Your input is kept. Check your connection and try again.' } };
  }
}
export function pricingValues(data: PricingData): PricingSettings {
  return Object.fromEntries(Object.entries(data).map(([key,value]) => [key,new Decimal(value)])) as unknown as PricingSettings;
}
const defaultPricing = (): PricingData => Object.fromEntries(Object.entries(DEFAULT_PRICING_SETTINGS).map(([key,v]) => [key,String(v)])) as PricingData;
export async function readPricing(tx: EmsTx): Promise<{ pricing: PricingData; pricingVersion: number; pricingConfigured: boolean }> {
  const [row] = await tx.query<{ data: PricingData; version: number }>("select data,version from ems.pricing_settings where organization_id=$1 and name='current' order by created_at desc limit 1 for share",[tx.actor.organizationId]);
  return { pricing: row ? pricingSchema.parse(row.data) : defaultPricing(), pricingVersion: row?.version ?? 0, pricingConfigured: !!row };
}
export async function readCatalog(tx: EmsTx): Promise<CatalogProduct[]> {
  return tx.query<CatalogProduct>(`select id,version,name,code,unit,coalesce(data->>'rrpPrice',data->>'marketPrice',price::text) as "marketPrice",coalesce(data->>'rrpPrice',data->>'marketPrice',price::text) as "actualPrice",coalesce(data->>'source','EMS catalogue') as source from ems.products where organization_id=$1 and archived_at is null order by name for share`,[tx.actor.organizationId]);
}
type CalculationRow = { input: QuoteCalculationInput & { internalMemo?: string }; result: QuoteRevision['calculation']; products_snapshot: CatalogProduct[]; settings_snapshot: PricingData };
async function previousCalculation(tx: EmsTx, revisionId: string | null): Promise<CalculationRow | null> {
  if (!revisionId) return null;
  return (await tx.query<CalculationRow>('select input,result,products_snapshot,settings_snapshot from ems.quote_calculations where quote_revision_id=$1 and organization_id=$2',[revisionId,tx.actor.organizationId]))[0] ?? null;
}
function allMaterials(input: QuoteCalculationInput): MaterialItem[] { return [...input.materials,...(input.options ?? []).flatMap(o => o.materials)]; }
async function authoritativeCalculation(tx: EmsTx, data: QuoteInput, previous: CalculationRow | null) {
  const input = structuredClone(data.calculation);
  const catalog = await readCatalog(tx); const current = new Map(catalog.map(p => [p.id,p]));
  const oldProducts = new Map((previous?.products_snapshot ?? []).map(p => [p.id,p]));
  const oldRows = new Map(previous ? allMaterials(previous.input).map(row => [row.id,row]) : []);
  const used = new Map<string,CatalogProduct>();
  const resolve = (id: string, existing: boolean) => {
    const product = (!data.refreshPricing && existing ? oldProducts.get(id) : undefined) ?? current.get(id);
    if (!product) throw new WorkflowError('INVALID_PRODUCT','A selected product is unavailable. Select an active product or use a custom material.');
    used.set(id,product); return product;
  };
  for (const row of allMaterials(input)) {
    if (row.isCustom) { delete row.productId; continue; }
    if (!row.productId) throw new WorkflowError('INVALID_PRODUCT','Select a catalogue product.');
    const old = oldRows.get(row.id); const retained = old?.productId === row.productId && !old.isCustom;
    const product = resolve(row.productId,retained);
    // Original source uses consumer/RRP price for a new row and retains the existing row's actual snapshot.
    row.actualPrice = !data.refreshPricing && retained ? old.actualPrice : new Decimal(product.actualPrice).toFixed(2);
    row.name=product.name; row.unit=product.unit;
  }
  for (const alternative of input.paintComparison?.alternatives ?? []) {
    if (!alternative.product) continue;
    const old = previous?.input.paintComparison?.alternatives.find(a => a.targetLogicalKey===alternative.targetLogicalKey && a.product?.productId===alternative.product?.productId);
    const product = resolve(alternative.product.productId,!!old);
    alternative.product.actualPrice = !data.refreshPricing && old?.product ? old.product.actualPrice : new Decimal(product.actualPrice).toFixed(2);
    alternative.product.name=product.name;
  }
  const settings = !data.refreshPricing && previous ? previous.settings_snapshot : (await readPricing(tx)).pricing;
  return { input, result: calculateQuoteSnapshot(input,pricingValues(settings)), products: [...used.values()], settings };
}
type QuoteLock = Versioned & { status: QuoteStatus; current_revision_id: string | null; approved_revision_id: string | null };
async function lockQuote(tx: EmsTx, id: string, version: number): Promise<QuoteLock> {
  const [row] = await tx.query<QuoteLock>('select id,version,status,current_revision_id,approved_revision_id from ems.quotes where id=$1 and organization_id=$2 for update',[id,tx.actor.organizationId]);
  if (!row) throw new WorkflowError('NOT_FOUND','Quote not found.'); requireVersion(row.version,version); return row;
}
async function writeRevision(tx: EmsTx, id: string, data: QuoteInput, previous: CalculationRow | null) {
  const customer = await customerSnapshot(tx,data); const snapshot = await commercialSnapshot(tx,data);
  const calculation = await authoritativeCalculation(tx,data,previous); const totals = calculateCommercialTotals(data.publicLines);
  if (new Decimal(totals.total).isNegative() || new Decimal(totals.subtotal).isNegative() || new Decimal(totals.gst).isNegative()) throw new WorkflowError('INVALID_TOTAL','The customer quote total and GST cannot be negative.');
  const [number] = await tx.query<{ next: number }>('select coalesce(max(revision_number),0)+1 as next from ems.quote_revisions where quote_id=$1 and organization_id=$2',[id,tx.actor.organizationId]);
  const revisionId=randomUUID(); const org=tx.actor.organizationId;
  await tx.query("insert into ems.quote_revisions(id,organization_id,quote_id,revision_number,status,snapshot,customer_snapshot,settings_snapshot,engine_version,subtotal,tax,total) values($1,$2,$3,$4,'draft',$5::jsonb,$6::jsonb,$7::jsonb,$8,$9,$10,$11)",[revisionId,org,id,number.next,JSON.stringify(snapshot),JSON.stringify(customer),JSON.stringify(calculation.settings),QUOTE_ENGINE_VERSION,totals.subtotal,totals.gst,totals.total]);
  await tx.query('insert into ems.quote_calculations(organization_id,quote_revision_id,input,result,products_snapshot,settings_snapshot,engine_version) values($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb,$7)',[org,revisionId,JSON.stringify({ ...calculation.input,internalMemo:data.internalMemo }),JSON.stringify(calculation.result),JSON.stringify(calculation.products),JSON.stringify(calculation.settings),QUOTE_ENGINE_VERSION]);
  for (const [position,line] of data.publicLines.entries()) {
    const total=totals.lineTotals.find(t=>t.id===line.id)?.subtotal ?? '0.00';
    await tx.query('insert into ems.quote_lines(organization_id,quote_revision_id,position,kind,name,description,quantity,unit_price,taxable,visible,optional,selected,total) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',[org,revisionId,position,line.kind,line.name,line.description,line.quantity,line.unitPrice,line.taxable,line.clientVisible,!!line.optional,!!line.selected,total]);
  }
  return revisionId;
}
export async function saveQuote(input: unknown, meta: unknown): Promise<Result<Versioned>> {
  const parsed=quoteSchema.safeParse(input); if (!parsed.success) return invalidResult(parsed.error);
  const command=commandMetaSchema.safeParse(meta); if (!command.success) return invalidResult(command.error); const data=parsed.data;
  return quoteMutation(tx => runCommand(tx,'quote.save',command.data,data,async () => {
    const id=data.id ?? randomUUID(); const org=tx.actor.organizationId; let previous: CalculationRow | null=null;
    if (data.id) {
      const row=await lockQuote(tx,id,command.data.expectedVersion);
      if (row.status==='archived') throw new WorkflowError('INVALID_STATUS','Duplicate an archived quote to create new work.');
      previous=await previousCalculation(tx,row.current_revision_id);
    } else { requireVersion(0,command.data.expectedVersion); await customerSnapshot(tx,data); await tx.query('insert into ems.quotes(id,organization_id,client_id,property_id,request_id,title,valid_until) values($1,$2,$3,$4,$5,$6,$7)',[id,org,data.clientId,data.propertyId??null,data.requestId??null,data.title,data.validUntil??null]); }
    const revisionId=await writeRevision(tx,id,data,previous);
    const [saved]=await tx.query<Versioned>("update ems.quotes set client_id=$1,property_id=$2,request_id=$3,title=$4,valid_until=$5,current_revision_id=$6,status='draft',version=version+$7,updated_at=now() where id=$8 and organization_id=$9 returning id,version",[data.clientId,data.propertyId??null,data.requestId??null,data.title,data.validUntil??null,revisionId,data.id?1:0,id,org]);
    await recordActivity(tx,'quote',id,data.id?'revision_saved':'created',{ revisionId }); return saved;
  }));
}
const transitions: Record<QuoteStatus,QuoteStatus[]> = { draft:['issued','archived'],issued:['approved','changes_requested','declined','archived'],approved:['archived'],changes_requested:['issued','declined','archived'],declined:['archived'],archived:[] };
export async function transitionQuote(id: unknown, next: unknown, meta: unknown): Promise<Result<Versioned>> {
  const parsed=z.object({ id:z.uuid(),next:quoteStatusSchema,meta:commandMetaSchema }).safeParse({id,next,meta}); if (!parsed.success) return invalidResult(parsed.error); const data=parsed.data;
  return quoteMutation(tx=>runCommand(tx,'quote.transition',data.meta,{id:data.id,next:data.next},async()=>{
    const current=await lockQuote(tx,data.id,data.meta.expectedVersion);
    if (!current.current_revision_id || !transitions[current.status].includes(data.next)) throw new WorkflowError('INVALID_STATUS','This quote cannot make that status change. Reload to see available actions.');
    if (data.next==='issued' || data.next==='approved') {
      const [revision]=await tx.query<{ snapshot: QuoteRevision['snapshot']; total:string }>('select snapshot,total from ems.quote_revisions where id=$1 and organization_id=$2',[current.current_revision_id,tx.actor.organizationId]);
      if (!revision.snapshot.publicLines.some(l=>l.kind==='line_item'&&l.clientVisible&&(!l.optional||l.selected)) || new Decimal(revision.total).lte(0)) throw new WorkflowError('EMPTY_QUOTE','Add selected customer-visible priced lines before issuing.');
    }
    // Approved revision contents and status remain immutable, including when the parent is archived.
    if (current.status!=='approved') await tx.query("update ems.quote_revisions set status=$1,issued_at=case when $1='issued' then coalesce(issued_at,now()) else issued_at end,approved_at=case when $1='approved' then now() else approved_at end,updated_at=now() where id=$2 and organization_id=$3",[data.next,current.current_revision_id,tx.actor.organizationId]);
    const [saved]=await tx.query<Versioned>("update ems.quotes set status=$1,approved_revision_id=case when $1='approved' then current_revision_id else approved_revision_id end,version=version+1,updated_at=now() where id=$2 and organization_id=$3 returning id,version",[data.next,data.id,tx.actor.organizationId]);
    if (data.next==='issued') await tx.query("update ems.requests set status='quoted',version=version+1,updated_at=now() where id=(select request_id from ems.quotes where id=$1 and organization_id=$2) and organization_id=$2 and status in ('new','in_review')",[data.id,tx.actor.organizationId]);
    await recordActivity(tx,'quote',data.id,data.next,{ revisionId:current.current_revision_id }); return saved;
  }));
}
async function editorInTx(tx:EmsTx,id:string):Promise<QuoteEditorData|null> {
  const [quote]=await tx.query<Omit<QuoteEditorData,'revision'|'history'> & { currentRevisionId:string }>('select id,version,number,title,status,client_id as "clientId",property_id as "propertyId",request_id as "requestId",valid_until::text as "validUntil",approved_revision_id as "approvedRevisionId",current_revision_id as "currentRevisionId" from ems.quotes where id=$1 and organization_id=$2',[id,tx.actor.organizationId]);
  if (!quote) return null;
  const revision=await revisionInTx(tx,quote.currentRevisionId); if (!revision) return null;
  const history=await tx.query<QuoteEditorData['history'][number]>('select id,revision_number as "revisionNumber",status,total from ems.quote_revisions where quote_id=$1 and organization_id=$2 order by revision_number desc',[id,tx.actor.organizationId]);
  return { ...quote,revision,history };
}
async function revisionInTx(tx:EmsTx,id:string):Promise<QuoteRevision|null> {
  const [row]=await tx.query<Omit<QuoteRevision,'calculation'|'products'|'internalMemo'>>('select id,revision_number as "revisionNumber",status,snapshot,customer_snapshot as customer,subtotal,tax,total from ems.quote_revisions where id=$1 and organization_id=$2',[id,tx.actor.organizationId]);
  const calculation=await previousCalculation(tx,id); return row&&calculation ? { ...row,calculation:calculation.result,products:calculation.products_snapshot,internalMemo:calculation.input.internalMemo??'' } : null;
}
export async function getQuoteEditor(id:string):Promise<QuoteEditorData|null> {
  if (!z.uuid().safeParse(id).success) return null;
  return withEmsTransaction(async tx=>{ await requireAdmin(tx); return editorInTx(tx,id); });
}
export async function getQuoteRevision(id:string):Promise<QuoteRevision|null> {
  if (!z.uuid().safeParse(id).success) return null;
  return withEmsTransaction(async tx=>{ await requireAdmin(tx); return revisionInTx(tx,id); });
}
export async function duplicateQuote(id:unknown,meta:unknown):Promise<Result<Versioned>> {
  const parsed=z.object({ id:z.uuid(),meta:commandMetaSchema }).safeParse({id,meta}); if (!parsed.success) return invalidResult(parsed.error); const data=parsed.data;
  return quoteMutation(tx=>runCommand(tx,'quote.duplicate',data.meta,{id:data.id},async()=>{
    await lockQuote(tx,data.id,data.meta.expectedVersion); const source=await editorInTx(tx,data.id); if (!source) throw new WorkflowError('NOT_FOUND','Quote not found.');
    const newId=randomUUID(); const rev=source.revision;
    const input:QuoteInput={ clientId:source.clientId,propertyId:source.propertyId,requestId:null,title:source.title+' (copy)',validUntil:null,workType:(rev.snapshot.workType??'Interior') as QuoteInput['workType'],terms:rev.snapshot.terms,internalMemo:rev.internalMemo,calculation:rev.calculation.input,publicLines:rev.snapshot.publicLines,refreshPricing:false };
    await tx.query('insert into ems.quotes(id,organization_id,client_id,property_id,title) values($1,$2,$3,$4,$5)',[newId,tx.actor.organizationId,input.clientId,input.propertyId,input.title]);
    const newRevision=await writeRevision(tx,newId,input,await previousCalculation(tx,rev.id));
    await tx.query('update ems.quotes set current_revision_id=$1 where id=$2 and organization_id=$3',[newRevision,newId,tx.actor.organizationId]);
    await recordActivity(tx,'quote',newId,'duplicated',{sourceId:data.id}); return { id:newId,version:1 };
  }));
}
export async function listQuotes(input:unknown={}) {
  const parsed=z.object({ search:z.string().max(200).default(''),status:z.union([quoteStatusSchema,z.literal('all')]).default('all'),page:z.coerce.number().int().min(1).max(10000).default(1) }).safeParse(input);
  const filter=parsed.success?parsed.data:{search:'',status:'all',page:1};
  return withEmsTransaction(async tx=>{ await requireAdmin(tx);
    const where="q.organization_id=$1 and ($2='' or q.title ilike '%'||$2||'%' or q.number ilike '%'||$2||'%' or c.display_name ilike '%'||$2||'%') and ($3='all' or q.status=$3)";
    const values=[tx.actor.organizationId,filter.search,filter.status];
    const [count]=await tx.query<{total:string}>(`select count(*)::text total from ems.quotes q join ems.clients c on c.id=q.client_id and c.organization_id=q.organization_id where ${where}`,values);
    const items=await tx.query<{id:string;number:string;title:string;status:QuoteStatus;clientName:string;total:string;validUntil:string|null}>(`select q.id,q.number,q.title,q.status,c.display_name as "clientName",coalesce(r.total,0)::text total,q.valid_until::text as "validUntil" from ems.quotes q join ems.clients c on c.id=q.client_id and c.organization_id=q.organization_id left join ems.quote_revisions r on r.id=q.current_revision_id and r.organization_id=q.organization_id where ${where} order by q.updated_at desc,q.id limit 25 offset $4`,[...values,(filter.page-1)*25]);
    return {items,total:Number(count.total),filter};
  });
}
export async function getQuoteResources() {
  return withEmsTransaction(async tx=>{ await requireAdmin(tx); return {
    products:await readCatalog(tx),...await readPricing(tx),
    templates:await tx.query<QuoteTemplate>('select id,version,name,data from ems.quote_templates where organization_id=$1 and archived_at is null order by name',[tx.actor.organizationId]),
    clients:await tx.query<{id:string;name:string}>('select id,display_name as name from ems.clients where organization_id=$1 and archived_at is null order by display_name',[tx.actor.organizationId]),
    properties:await tx.query<{id:string;clientId:string;label:string;address:string}>('select id,client_id as "clientId",label,address from ems.properties where organization_id=$1 and archived_at is null order by label',[tx.actor.organizationId]),
  }; });
}
export type QuoteResources = Awaited<ReturnType<typeof getQuoteResources>>;
export async function saveProduct(input:unknown,meta:unknown):Promise<Result<Versioned>> {
  const parsed=productSchema.safeParse(input); if (!parsed.success) return invalidResult(parsed.error); const command=commandMetaSchema.safeParse(meta); if(!command.success)return invalidResult(command.error); const data=parsed.data;
  return quoteMutation(tx=>runCommand(tx,'quote.product.save',command.data,data,async()=>{
    const id=data.id??randomUUID(); if(data.id){const [p]=await tx.query<Versioned>('select id,version from ems.products where id=$1 and organization_id=$2 for update',[id,tx.actor.organizationId]);if(!p)throw new WorkflowError('NOT_FOUND','Product not found.');requireVersion(p.version,command.data.expectedVersion);}else requireVersion(0,command.data.expectedVersion);
    const detail=JSON.stringify({marketPrice:data.marketPrice,rrpPrice:data.marketPrice,actualPrice:data.marketPrice,source:'EMS administrator'});
    const values=[data.name,data.code,data.unit,data.marketPrice,detail,data.archived?new Date().toISOString():null,id,tx.actor.organizationId];
    const [saved]=data.id?await tx.query<Versioned>('update ems.products set name=$1,code=$2,unit=$3,price=$4,data=$5::jsonb,archived_at=$6,version=version+1,updated_at=now() where id=$7 and organization_id=$8 returning id,version',values):await tx.query<Versioned>('insert into ems.products(name,code,unit,price,data,archived_at,id,organization_id) values($1,$2,$3,$4,$5::jsonb,$6,$7,$8) returning id,version',values);
    await recordActivity(tx,'product',id,data.archived?'archived':'saved'); return saved;
  }));
}
export async function savePricingSettings(input:unknown,meta:unknown):Promise<Result<Versioned>> {
  const parsed=pricingSchema.safeParse(input);if(!parsed.success)return invalidResult(parsed.error);const command=commandMetaSchema.safeParse(meta);if(!command.success)return invalidResult(command.error);
  return quoteMutation(tx=>runCommand(tx,'quote.pricing.save',command.data,parsed.data,async()=>{
    await tx.query("select pg_advisory_xact_lock(hashtextextended($1,0))",['quote.pricing:'+tx.actor.organizationId]);
    const [current]=await tx.query<Versioned>("select id,version from ems.pricing_settings where organization_id=$1 and name='current' order by created_at desc limit 1 for update",[tx.actor.organizationId]); requireVersion(current?.version??0,command.data.expectedVersion);
    const [saved]=current?await tx.query<Versioned>('update ems.pricing_settings set data=$1::jsonb,version=version+1,updated_at=now() where id=$2 and organization_id=$3 returning id,version',[JSON.stringify(parsed.data),current.id,tx.actor.organizationId]):await tx.query<Versioned>("insert into ems.pricing_settings(organization_id,name,data) values($1,'current',$2::jsonb) returning id,version",[tx.actor.organizationId,JSON.stringify(parsed.data)]);
    await recordActivity(tx,'pricing_settings',saved.id,'saved');return saved;
  }));
}
