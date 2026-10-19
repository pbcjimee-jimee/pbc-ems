-- Runtime password is provisioned locally by scripts/local-db.mjs, never embedded in migrations.
create role ems_runtime login nosuperuser nobypassrls noinherit nocreatedb nocreaterole noreplication;
grant authenticated to ems_runtime;
grant connect on database postgres to ems_runtime;
revoke all on schema ems from public,anon;
grant usage on schema ems to authenticated;
grant select on ems.organizations,ems.memberships to authenticated;
grant select,insert,update,delete on all tables in schema ems to authenticated;
revoke insert,update,delete on ems.organizations,ems.memberships from authenticated;
grant usage,select on all sequences in schema ems to authenticated;

-- The only SECURITY DEFINER helpers are boolean, current-actor scope checks.
-- They live in the nonexposed schema, bind auth.uid(), have an empty search_path,
-- and cannot accept a caller-provided user identity or reveal arbitrary rows.
create function ems.is_member(org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from ems.memberships m where m.organization_id=org and m.user_id=auth.uid() and m.active)
$$;
create function ems.is_admin(org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from ems.memberships m where m.organization_id=org and m.user_id=auth.uid() and m.active and m.role='admin')
$$;
create function ems.can_visit(org uuid,visit uuid) returns boolean language sql stable security definer set search_path='' as $$
 select ems.is_member(org) and (ems.is_admin(org) or exists(select 1 from ems.visit_assignments a where a.organization_id=org and a.visit_id=visit and a.user_id=auth.uid()))
$$;
create function ems.can_job(org uuid,job uuid) returns boolean language sql stable security definer set search_path='' as $$
 select ems.is_member(org) and (ems.is_admin(org) or exists(select 1 from ems.visits v join ems.visit_assignments a on a.organization_id=v.organization_id and a.visit_id=v.id where v.organization_id=org and v.job_id=job and a.user_id=auth.uid()))
$$;
create function ems.can_client(org uuid,client uuid) returns boolean language sql stable security definer set search_path='' as $$
 select ems.is_member(org) and (ems.is_admin(org) or exists(select 1 from ems.jobs j where j.organization_id=org and j.client_id=client and ems.can_job(org,j.id)) or exists(select 1 from ems.requests r join ems.visits v on v.organization_id=r.organization_id and v.request_id=r.id where r.organization_id=org and r.client_id=client and ems.can_visit(org,v.id)))
$$;
revoke all on all functions in schema ems from public,anon;
grant execute on function ems.is_member(uuid),ems.is_admin(uuid),ems.can_visit(uuid,uuid),ems.can_job(uuid,uuid),ems.can_client(uuid,uuid) to authenticated;
create policy org_read on ems.organizations for select to authenticated using(ems.is_member(id));
create policy member_read on ems.memberships for select to authenticated using(ems.is_member(organization_id));
do $$ declare t text; begin
 foreach t in array array['clients','properties','requests','quotes','quote_revisions','quote_lines','quote_calculations','products','pricing_settings','quote_templates','jobs','job_contracts','visits','visit_assignments','invoices','invoice_lines','payments','expenses','time_entries','activity_events','attachments','command_receipts'] loop
 execute format('create policy admin_all on ems.%I for all to authenticated using(ems.is_admin(organization_id)) with check(ems.is_admin(organization_id))',t);
 end loop;
end $$;
create policy client_scope on ems.clients for select to authenticated using(ems.can_client(organization_id,id));
create policy property_scope on ems.properties for select to authenticated using(ems.can_client(organization_id,client_id));
create policy request_scope on ems.requests for select to authenticated using(ems.is_member(organization_id) and exists(select 1 from ems.visits v where v.organization_id=requests.organization_id and v.request_id=requests.id and ems.can_visit(v.organization_id,v.id)));
create policy job_scope on ems.jobs for select to authenticated using(ems.can_job(organization_id,id));
create policy visit_scope on ems.visits for select to authenticated using(ems.can_visit(organization_id,id));
create policy assignment_scope on ems.visit_assignments for select to authenticated using(ems.can_visit(organization_id,visit_id));
create policy own_expense on ems.expenses for all to authenticated using(ems.is_member(organization_id) and user_id=auth.uid()) with check(ems.is_member(organization_id) and user_id=auth.uid() and (job_id is null or ems.can_job(organization_id,job_id)));
create policy own_time_read on ems.time_entries for select to authenticated using(ems.is_member(organization_id) and user_id=auth.uid());
create policy own_time_insert on ems.time_entries for insert to authenticated with check(ems.is_member(organization_id) and user_id=auth.uid() and status='draft' and (job_id is null or ems.can_job(organization_id,job_id)) and (visit_id is null or ems.can_visit(organization_id,visit_id)));
create policy own_time_update on ems.time_entries for update to authenticated using(ems.is_member(organization_id) and user_id=auth.uid() and status='draft') with check(ems.is_member(organization_id) and user_id=auth.uid() and status in ('draft','submitted') and (job_id is null or ems.can_job(organization_id,job_id)) and (visit_id is null or ems.can_visit(organization_id,visit_id)));
create policy own_attachment on ems.attachments for all to authenticated using(ems.is_member(organization_id) and user_id=auth.uid()) with check(ems.is_member(organization_id) and user_id=auth.uid() and (job_id is null or ems.can_job(organization_id,job_id)) and (expense_id is null or exists(select 1 from ems.expenses e where e.organization_id=attachments.organization_id and e.id=attachments.expense_id and e.user_id=auth.uid())));
create policy own_activity on ems.activity_events for insert to authenticated with check(ems.is_member(organization_id) and actor_id=auth.uid());
create policy own_receipt on ems.command_receipts for all to authenticated using(ems.is_member(organization_id) and actor_id=auth.uid()) with check(ems.is_member(organization_id) and actor_id=auth.uid());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('ems-receipts','ems-receipts',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf']);
create policy ems_receipt_read on storage.objects for select to authenticated using(bucket_id='ems-receipts' and exists(select 1 from ems.attachments a where a.path=name and ems.is_member(a.organization_id) and (ems.is_admin(a.organization_id) or a.user_id=auth.uid())));
create policy ems_receipt_insert on storage.objects for insert to authenticated with check(bucket_id='ems-receipts' and (storage.foldername(name))[2]=auth.uid()::text and exists(select 1 from ems.memberships m where m.organization_id::text=(storage.foldername(name))[1] and m.user_id=auth.uid() and m.active));
create policy ems_receipt_delete on storage.objects for delete to authenticated using(bucket_id='ems-receipts' and (storage.foldername(name))[2]=auth.uid()::text and exists(select 1 from ems.memberships m where m.organization_id::text=(storage.foldername(name))[1] and m.user_id=auth.uid() and m.active));
