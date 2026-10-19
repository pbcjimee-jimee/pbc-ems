-- A client's other sites are not automatically part of a worker's assigned work.
create function ems.can_property(org uuid,property uuid) returns boolean language sql stable security definer set search_path='' as $$
 select ems.is_member(org) and (ems.is_admin(org)
 or exists(select 1 from ems.jobs j where j.organization_id=org and j.property_id=property and ems.can_job(org,j.id))
 or exists(select 1 from ems.requests r join ems.visits v on v.organization_id=r.organization_id and v.request_id=r.id where r.organization_id=org and r.property_id=property and ems.can_visit(org,v.id)))
$$;
revoke all on function ems.can_property(uuid,uuid) from public,anon;
grant execute on function ems.can_property(uuid,uuid) to authenticated;
alter policy property_scope on ems.properties using(ems.can_property(organization_id,id));

-- Direct jobs retain their original enquiry as well as quote-derived jobs.
alter table ems.jobs add column request_id uuid;
alter table ems.jobs add constraint jobs_request_fk foreign key(organization_id,request_id) references ems.requests(organization_id,id);
create index jobs_request_idx on ems.jobs(organization_id,request_id) where request_id is not null;
alter policy request_scope on ems.requests using(ems.is_member(organization_id) and (
 exists(select 1 from ems.visits v where v.organization_id=requests.organization_id and v.request_id=requests.id and ems.can_visit(v.organization_id,v.id))
 or exists(select 1 from ems.jobs j where j.organization_id=requests.organization_id and j.request_id=requests.id and ems.can_job(j.organization_id,j.id))));
