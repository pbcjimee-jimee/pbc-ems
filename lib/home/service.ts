import "server-only";
import { withEmsTransaction } from "@/lib/db/transaction";
import { sydneyToday } from "@/lib/domain/format";
import { readJobPipeline, type JobPipeline } from "@/lib/jobs/service";
import { readQuotePipeline } from "@/lib/quotes/service";
import type { QuotePipeline } from "@/lib/quotes/service-types";
import { readInvoicePipeline, type InvoicePipeline } from "@/lib/invoices/service";
import { readRequestPipeline, type RequestPipeline } from "@/lib/requests/service";

export interface TodayVisit { id:string; title:string; job_id:string|null; all_day:boolean; starts_at:string|null; ends_at:string|null; status:string; address:string|null; assignees:string[] }
export interface HomeFinance {draft_quotes:string;pending_quotes:string;to_invoice:string;outstanding:string;overdue:string}
export interface HomePipeline {requests:RequestPipeline;jobs:JobPipeline;quotes?:QuotePipeline;invoices?:InvoicePipeline}
export async function getHomeSummary() {
  return withEmsTransaction(async tx => {
    const today=sydneyToday();
    const visits=await tx.query<TodayVisit>(`select v.id,v.title,v.job_id,v.all_day,v.starts_at::text,v.ends_at::text,v.status,p.address,
      coalesce(array(select m.display_name from ems.visit_assignments a join ems.memberships m on m.user_id=a.user_id and m.organization_id=a.organization_id where a.visit_id=v.id and a.organization_id=v.organization_id),'{}') as assignees
      from ems.visits v left join ems.jobs j on j.id=v.job_id and j.organization_id=v.organization_id
      left join ems.properties p on p.id=j.property_id and p.organization_id=j.organization_id
      where v.organization_id=$1 and v.status<>'cancelled' and ((v.all_day and v.start_date<=$2::date and v.end_date>=$2::date)
      or (not v.all_day and v.starts_at < (($2::date+1)::timestamp at time zone 'Australia/Sydney') and v.ends_at > ($2::date::timestamp at time zone 'Australia/Sydney')))
      order by v.all_day desc,v.starts_at nulls first`,[tx.actor.organizationId,today]);
    const [counts]=await tx.query<{active_jobs:string;new_requests:string;open_timers:string}>(`select
      (select count(*) from ems.jobs where status not in ('completed','cancelled') and archived_at is null)::text as active_jobs,
      (select count(*) from ems.requests where status='new' and archived_at is null)::text as new_requests,
      (select count(*) from ems.time_entries where user_id=$1 and ended_at is null)::text as open_timers`,[tx.actor.userId]);
    const upcoming=await tx.query<{id:string;title:string;all_day:boolean;date:string;starts_at:string|null}>(`select id,title,all_day,coalesce(start_date::text,(starts_at at time zone 'Australia/Sydney')::date::text) as date,starts_at::text from ems.visits where organization_id=$1 and status not in ('completed','cancelled') and coalesce(start_date,(starts_at at time zone 'Australia/Sydney')::date)>$2::date and coalesce(start_date,(starts_at at time zone 'Australia/Sydney')::date)<=$2::date+7 order by coalesce(start_date,(starts_at at time zone 'Australia/Sydney')::date),starts_at nulls first limit 5`,[tx.actor.organizationId,today]);
    const recent=await tx.query<{id:string;title:string;status:string;number:string;client_name:string}>(`select j.id,j.title,j.status,j.number,c.display_name as client_name from ems.jobs j join ems.clients c on c.id=j.client_id and c.organization_id=j.organization_id
      where j.archived_at is null order by j.updated_at desc limit 5`);
    const pipeline:HomePipeline={requests:await readRequestPipeline(tx,today),jobs:await readJobPipeline(tx)};
    let finance:HomeFinance|null=null;
    if(tx.actor.role==="admin") {
      pipeline.quotes=await readQuotePipeline(tx);
      pipeline.invoices=await readInvoicePipeline(tx,today);
      [finance]=await tx.query<HomeFinance>(`with balances as (
        select i.id,i.due_on,i.total-coalesce((select sum(p.amount) from ems.payments p where p.invoice_id=i.id and p.voided_at is null),0) as balance
        from ems.invoices i where i.status='issued')
        select (select count(*) from ems.quotes where status='draft')::text as draft_quotes,
        (select count(*) from ems.quotes where status='issued')::text as pending_quotes,
        (select count(*) from ems.jobs j where j.status='completed' and j.archived_at is null and not exists(select 1 from ems.invoices i where i.job_id=j.id and i.status<>'void'))::text as to_invoice,
        coalesce((select sum(balance) from balances where balance>0),0)::text as outstanding,
        (select count(*) from balances where balance>0 and due_on<$1::date)::text as overdue`,[today]);
    }
    return {actor:tx.actor,today,visits,upcoming,counts,recent,finance,pipeline};
  });
}

