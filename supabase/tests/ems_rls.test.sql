begin;
create extension if not exists pgtap with schema extensions;
select plan(19);
select ok(not rolsuper and not rolbypassrls and not rolinherit and not rolcreatedb and not rolcreaterole,'runtime has no elevated privileges') from pg_roles where rolname='ems_runtime';
select ok(not pg_has_role('ems_runtime','postgres','MEMBER'),'runtime cannot become migration administrator');
select ok(pg_has_role('ems_runtime','authenticated','MEMBER'),'runtime can SET ROLE authenticated');
select ok(not has_schema_privilege('anon','ems','USAGE'),'anonymous cannot use ems');
select is((select count(*)::int from pg_tables where schemaname='ems' and not rowsecurity),0,'all business tables have RLS');
select ok(not has_table_privilege('authenticated','ems.memberships','UPDATE'),'authenticated cannot self-promote');
select ok(not has_table_privilege('authenticated','ems.organizations','INSERT'),'authenticated cannot create organizations');
insert into auth.users(id,email) values('a0000000-0000-4000-8000-000000000001','sql-admin@ems.local'),('a0000000-0000-4000-8000-000000000002','sql-supervisor@ems.local'),('a0000000-0000-4000-8000-000000000003','sql-other@ems.local'),('a0000000-0000-4000-8000-000000000004','sql-inactive@ems.local');
insert into ems.organizations(id,name) values('b0000000-0000-4000-8000-000000000001','SQL sample'),('b0000000-0000-4000-8000-000000000002','SQL other');
insert into ems.memberships(organization_id,user_id,role,display_name,active) values
('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','admin','SQL admin',true),
('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002','supervisor','SQL supervisor',true),
('b0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000003','admin','SQL other',true),
('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000004','supervisor','SQL inactive',false);
insert into ems.clients(id,organization_id,display_name) values('c0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','SQL client');
insert into ems.jobs(id,organization_id,client_id,title) values('d0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','SQL job');
insert into ems.job_contracts(organization_id,job_id,subtotal,tax,total) values('b0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001',100,10,110);
insert into ems.visits(id,organization_id,job_id,title,all_day,start_date,end_date) values('e0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001','SQL visit',true,'2026-10-16','2026-10-17');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*)::int from ems.clients where id='c0000000-0000-4000-8000-000000000001'),1,'admin sees own client');
select is((select count(*)::int from ems.job_contracts where job_id='d0000000-0000-4000-8000-000000000001'),1,'admin sees contract');
select set_config('request.jwt.claims','{"sub":"a0000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*)::int from ems.clients where id='c0000000-0000-4000-8000-000000000001'),0,'other company admin cannot see client');
select throws_ok($$insert into ems.properties(organization_id,client_id,label,address) values('b0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000001','forged','forged')$$,'23503',null,'composite FK rejects forged cross-company parent');
select set_config('request.jwt.claims','{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*)::int from ems.jobs where id='d0000000-0000-4000-8000-000000000001'),0,'unassigned supervisor cannot see job');
reset role;
insert into ems.visit_assignments(organization_id,visit_id,user_id) values('b0000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002');
set local role authenticated;
select is((select count(*)::int from ems.jobs where id='d0000000-0000-4000-8000-000000000001'),1,'assigned supervisor sees job');
select is((select count(*)::int from ems.job_contracts where job_id='d0000000-0000-4000-8000-000000000001'),0,'supervisor cannot see job money');
select throws_ok($$update ems.memberships set role='admin' where user_id=auth.uid()$$,'42501',null,'supervisor cannot escalate role');
select throws_ok($$insert into ems.expenses(organization_id,user_id,title,category,amount,occurred_on) values('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','forged','materials',10,current_date)$$,'42501',null,'supervisor cannot forge expense owner');
select set_config('request.jwt.claims','{"sub":"a0000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select is((select count(*)::int from ems.clients where id='c0000000-0000-4000-8000-000000000001'),0,'inactive membership sees no client');
select set_config('request.jwt.claims','{}',true);
select is((select count(*)::int from ems.organizations),0,'missing identity sees no organization');
reset role;
select is((select public from storage.buckets where id='ems-receipts'),false,'receipt bucket is private');
select * from finish();
rollback;
