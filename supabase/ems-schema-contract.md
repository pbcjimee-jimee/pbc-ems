# EMS SQL contract

All tables: UUID `id`, UUID `organization_id` (except organizations), integer `version default 1`, timestamptz `created_at/updated_at`. Parent FKs use `(organization_id,id)`.

- organizations: name, timezone default Australia/Sydney, currency AUD, settings jsonb.
- memberships: user_id(auth.users), role(admin/supervisor), active boolean, display_name.
- clients: display_name,email,phone,company_name,billing_address,notes,tags text[],archived_at.
- properties: client_id,label,address,notes,archived_at.
- requests: client_id,property_id,title,description,status(new/in_review/quoted/closed),preferred_date date,assessment_at timestamptz,archived_at.
- quotes: client_id,property_id,request_id,number,title,status(draft/issued/approved/changes_requested/declined/archived),current_revision_id,approved_revision_id,valid_until date.
- quote_revisions: quote_id,revision_number,status,snapshot jsonb,customer_snapshot jsonb,settings_snapshot jsonb,engine_version text,subtotal/tax/total numeric(18,2),issued_at,approved_at. unique quote_id+revision_number.
- quote_lines: quote_revision_id,position,kind(line_item/text),name,description,quantity numeric(18,4),unit_price numeric(18,4),taxable boolean,visible boolean,optional boolean,selected boolean,total numeric(18,2).
- quote_calculations: quote_revision_id unique,input jsonb,result jsonb,products_snapshot jsonb,settings_snapshot jsonb,engine_version.
- products: code,name,unit,price numeric(18,4),data jsonb,archived_at.
- pricing_settings: name,data jsonb. quote_templates: name,data jsonb,archived_at.
- jobs: client_id,property_id,quote_revision_id unique,number(default J- sequence),title,description,status(unscheduled/scheduled/in_progress/completed/cancelled),notes,completed_at,archived_at. NO MONEY.
- job_contracts: job_id unique,quote_revision_id,snapshot jsonb,customer_snapshot jsonb,subtotal/tax/total numeric(18,2). ADMIN ONLY.
- visits: job_id,request_id,title,type(visit/assessment/general),description,status(scheduled/in_progress/completed/cancelled),all_day boolean,starts_at/ends_at timestamptz,start_date/end_date date. Dates inclusive. Timed and all-day fields exclusive.
- visit_assignments: visit_id,user_id. unique visit_id+user_id.
- invoices: client_id,property_id,job_id,number,title,status(draft/issued/void),issued_on/due_on date,snapshot/customer_snapshot jsonb,subtotal/tax/total numeric(18,2),issued_at,voided_at. unique live job_id,unique number.
- invoice_lines: invoice_id,position,name,description,quantity numeric(18,4),unit_price numeric(18,4),taxable boolean,total numeric(18,2).
- payments: invoice_id,amount numeric(18,2)>0,received_on date,method,reference,notes,voided_at.
- expenses: user_id,job_id,title,category,amount numeric(18,2)>=0,occurred_on date,notes,receipt_path,archived_at.
- time_entries: user_id,job_id,visit_id,started_at/ended_at timestamptz,break_minutes int,status(draft/submitted/approved),notes,rejection_reason,approved_at. one open entry per user, closed interval exclusion per user.
- activity_events: actor_id,entity_type,entity_id,action,data jsonb.
- attachments: user_id,expense_id,job_id,path,name,content_type,size_bytes.
- command_receipts: actor_id,operation,idempotency_key,payload_digest,result jsonb. unique organization+actor+operation+key.

Runtime transaction: `withEmsTransaction(work)`; tx.query<T>(sql,values) returns T[], tx.actor is {userId,organizationId,role,displayName,organizationName}. SQL financial numeric values stay strings; no custom numeric parser. All business SQL uses `ems.` fixed tables and parameter values. `requireAdmin(tx)` before administrative mutation; `requireMembership` and `getCurrentMembership` for layout identity.

Receipt paths must follow `organizationId/userId/randomId.ext`. Audit entity types for supervisor are expense/time_entry/job/visit (plural forms accepted), and must refer to their accessible records.
Update 2026-10-16: jobs additionally has nullable request_id with company-scoped FK. Supervisor property reads are limited to exact sites on assigned jobs or assessment visits through ems.can_property.
