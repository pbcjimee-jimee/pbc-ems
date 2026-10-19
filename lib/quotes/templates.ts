import 'server-only';
import { randomUUID } from 'node:crypto';
import type { Result, Versioned } from '@/lib/domain/types';
import { runCommand, requireVersion, WorkflowError, recordActivity } from '@/lib/workflows/commands';
import { DULUX_PAINT_PRODUCTS } from '@/lib/products/dulux-paints';
import { commandMetaSchema, invalidResult, templateSchema } from './schemas';
import { quoteMutation } from './service';
export async function saveQuoteTemplate(input:unknown,meta:unknown):Promise<Result<Versioned>> {
  const parsed=templateSchema.safeParse(input);if(!parsed.success)return invalidResult(parsed.error);const command=commandMetaSchema.safeParse(meta);if(!command.success)return invalidResult(command.error);const data=parsed.data;
  return quoteMutation(tx=>runCommand(tx,'quote.template.save',command.data,data,async()=>{
    const id=data.id??randomUUID();if(data.id){const [old]=await tx.query<Versioned>('select id,version from ems.quote_templates where id=$1 and organization_id=$2 for update',[id,tx.actor.organizationId]);if(!old)throw new WorkflowError('NOT_FOUND','Template not found.');requireVersion(old.version,command.data.expectedVersion);}else requireVersion(0,command.data.expectedVersion);
    const values=[data.name,JSON.stringify(data.data),data.archived?new Date().toISOString():null,id,tx.actor.organizationId];
    const [saved]=data.id?await tx.query<Versioned>('update ems.quote_templates set name=$1,data=$2::jsonb,archived_at=$3,version=version+1,updated_at=now() where id=$4 and organization_id=$5 returning id,version',values):await tx.query<Versioned>('insert into ems.quote_templates(name,data,archived_at,id,organization_id) values($1,$2::jsonb,$3,$4,$5) returning id,version',values);
    await recordActivity(tx,'quote_template',id,data.archived?'archived':'saved');return saved;
  }));
}
/** Explicit local sample import. Never silently replaces an existing operating catalogue. */
export async function importUnverifiedSeedCatalogue(meta:unknown):Promise<Result<Versioned>> {
  const command=commandMetaSchema.safeParse(meta);if(!command.success)return invalidResult(command.error);
  return quoteMutation(tx=>runCommand(tx,'quote.catalogue.seed',command.data,{source:'local-102-unverified'},async()=>{
    requireVersion(0,command.data.expectedVersion);
    await tx.query('select pg_advisory_xact_lock(hashtextextended($1,0))',['quote.catalogue:'+tx.actor.organizationId]);
    const [count]=await tx.query<{n:string}>('select count(*)::text n from ems.products where organization_id=$1',[tx.actor.organizationId]);
    if(count.n!=='0')throw new WorkflowError('CATALOGUE_EXISTS','The catalogue already has products. Manage them individually; the seed will not replace them.');
    for(const p of DULUX_PAINT_PRODUCTS)await tx.query('insert into ems.products(id,organization_id,code,name,unit,price,data) values($1,$2,$3,$4,$5,$6,$7::jsonb)',[randomUUID(),tx.actor.organizationId,p.productCode??null,p.name,p.unit,p.marketPrice,JSON.stringify({...p,rrpPrice:p.marketPrice,actualPrice:p.marketPrice,source:'Unverified local 102-product seed'})]);
    await recordActivity(tx,'product',tx.actor.organizationId,'unverified_seed_imported',{count:DULUX_PAINT_PRODUCTS.length});return{id:tx.actor.organizationId,version:1};
  }));
}
