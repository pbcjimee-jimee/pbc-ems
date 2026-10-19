import 'server-only';
import { z } from 'zod';
import { withEmsTransaction } from '@/lib/db/transaction';
import { requireAdmin } from '@/lib/auth/permissions';
import { customerDocument } from './project';
import type { CustomerDocument } from './types';

type DocumentRow={id:string;number:string;title:string;status:string;date:string;dueDate:string|null;snapshot:unknown;customer:unknown;subtotal:string;tax:string;total:string;paid:string};
export async function getCustomerDocument(kind:'quote'|'invoice',id:string,revisionId?:string):Promise<CustomerDocument|null> {
  if(!z.uuid().safeParse(id).success||(revisionId&&!z.uuid().safeParse(revisionId).success))return null;
  return withEmsTransaction(async tx=>{
    await requireAdmin(tx);
    let row:DocumentRow|undefined;
    if(kind==='quote') [row]=await tx.query<DocumentRow>(`select q.id,q.number,coalesce(r.snapshot->'document'->>'title',q.title) as title,r.status,coalesce(r.issued_at,r.created_at)::text as date,case when r.snapshot ? 'document' then r.snapshot->'document'->>'validUntil' else q.valid_until::text end as "dueDate",r.snapshot,r.customer_snapshot as customer,r.subtotal::text,r.tax::text,r.total::text,'0.00' as paid from ems.quotes q join ems.quote_revisions r on r.quote_id=q.id and r.organization_id=q.organization_id where q.id=$1 and q.organization_id=$2 and r.id=coalesce($3::uuid,q.current_revision_id)`,[id,tx.actor.organizationId,revisionId??null]);
    else [row]=await tx.query<DocumentRow>(`select i.id,i.number,i.title,i.status,coalesce(i.issued_on::text,i.created_at::text) as date,i.due_on::text as "dueDate",i.snapshot,i.customer_snapshot as customer,i.subtotal::text,i.tax::text,i.total::text,coalesce((select sum(p.amount) from ems.payments p where p.invoice_id=i.id and p.organization_id=i.organization_id and p.voided_at is null),0)::text as paid from ems.invoices i where i.id=$1 and i.organization_id=$2`,[id,tx.actor.organizationId]);
    return row?customerDocument({kind,...row}):null;
  });
}
