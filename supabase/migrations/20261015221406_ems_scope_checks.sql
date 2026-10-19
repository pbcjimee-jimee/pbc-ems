alter policy own_attachment on ems.attachments with check(
 ems.is_member(organization_id) and user_id=auth.uid()
 and split_part(path,'/',1)=organization_id::text and split_part(path,'/',2)=auth.uid()::text
 and (job_id is null or ems.can_job(organization_id,job_id))
 and (expense_id is null or exists(select 1 from ems.expenses e where e.organization_id=attachments.organization_id and e.id=attachments.expense_id and e.user_id=auth.uid()))
);
alter policy own_activity on ems.activity_events with check(
 ems.is_member(organization_id) and actor_id=auth.uid() and (
 (entity_type in ('expense','expenses') and exists(select 1 from ems.expenses e where e.organization_id=activity_events.organization_id and e.id=entity_id and e.user_id=auth.uid()))
 or (entity_type in ('time_entry','time_entries','timesheet') and exists(select 1 from ems.time_entries t where t.organization_id=activity_events.organization_id and t.id=entity_id and t.user_id=auth.uid()))
 or (entity_type in ('job','jobs') and ems.can_job(organization_id,entity_id))
 or (entity_type in ('visit','visits') and ems.can_visit(organization_id,entity_id))
 ));
create policy assigned_job_status on ems.jobs for update to authenticated
 using(ems.can_job(organization_id,id)) with check(ems.can_job(organization_id,id));
create policy assigned_visit_status on ems.visits for update to authenticated
 using(ems.can_visit(organization_id,id)) with check(ems.can_visit(organization_id,id));
create function ems.guard_supervisor_status() returns trigger language plpgsql set search_path='' as $$
declare allowed text[] := array['status','version','updated_at'];
begin
 if ems.is_admin(old.organization_id) then return new; end if;
 if tg_table_name='jobs' then allowed := allowed || 'completed_at'::text; end if;
 if (to_jsonb(new)-allowed) is distinct from (to_jsonb(old)-allowed) then
   raise exception 'Supervisors can change assigned record status only' using errcode='42501';
 end if;
 return new;
end $$;
revoke all on function ems.guard_supervisor_status() from public,anon;
create trigger supervisor_status_only before update on ems.jobs for each row execute function ems.guard_supervisor_status();
create trigger supervisor_status_only before update on ems.visits for each row execute function ems.guard_supervisor_status();
