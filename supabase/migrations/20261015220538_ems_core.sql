create schema ems;
create extension if not exists btree_gist with schema extensions;
create sequence ems.quote_number_seq;
create sequence ems.job_number_seq;
create sequence ems.invoice_number_seq;

create table ems.organizations (
 id uuid primary key default gen_random_uuid(), name text not null, timezone text not null default 'Australia/Sydney',
 currency text not null default 'AUD' check(currency='AUD'), settings jsonb not null default '{}',
 version integer not null default 1 check(version>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table ems.memberships (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references ems.organizations(id),
 user_id uuid not null references auth.users(id),role text not null check(role in ('admin','supervisor')),
 active boolean not null default true,display_name text not null,
 version integer not null default 1 check(version>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,user_id)
);

-- Common record columns are installed in the same migration after creating the domain fields.
create table ems.clients(display_name text not null,email text,phone text,company_name text,billing_address text,notes text,tags text[] not null default '{}',archived_at timestamptz);
create table ems.properties(client_id uuid not null,label text not null,address text not null,notes text,archived_at timestamptz);
create table ems.requests(client_id uuid not null,property_id uuid,title text not null,description text not null default '',status text not null default 'new' check(status in ('new','in_review','quoted','closed')),preferred_date date,assessment_at timestamptz,archived_at timestamptz);
create table ems.quotes(client_id uuid not null,property_id uuid,request_id uuid,number text not null default ('Q-'||lpad(nextval('ems.quote_number_seq')::text,5,'0')),title text not null,status text not null default 'draft' check(status in ('draft','issued','approved','changes_requested','declined','archived')),current_revision_id uuid,approved_revision_id uuid,valid_until date);
create table ems.quote_revisions(quote_id uuid not null,revision_number integer not null check(revision_number>0),status text not null default 'draft' check(status in ('draft','issued','approved','changes_requested','declined','archived')),snapshot jsonb not null default '{}',customer_snapshot jsonb not null default '{}',settings_snapshot jsonb not null default '{}',engine_version text not null default 'f4c97d5',subtotal numeric(18,2) not null default 0,tax numeric(18,2) not null default 0,total numeric(18,2) not null default 0,issued_at timestamptz,approved_at timestamptz,check(subtotal>=0 and tax>=0 and total>=0));
create table ems.quote_lines(quote_revision_id uuid not null,position integer not null default 0,kind text not null default 'line_item' check(kind in ('line_item','text')),name text not null,description text not null default '',quantity numeric(18,4) not null default 1 check(quantity>=0),unit_price numeric(18,4) not null default 0,taxable boolean not null default true,visible boolean not null default true,optional boolean not null default false,selected boolean not null default false,total numeric(18,2) not null default 0);
create table ems.quote_calculations(quote_revision_id uuid not null,input jsonb not null,result jsonb not null,products_snapshot jsonb not null default '[]',settings_snapshot jsonb not null default '{}',engine_version text not null);
create table ems.products(code text,name text not null,unit text not null default 'each',price numeric(18,4) not null check(price>=0),data jsonb not null default '{}',archived_at timestamptz);
create table ems.pricing_settings(name text not null,data jsonb not null);
create table ems.quote_templates(name text not null,data jsonb not null,archived_at timestamptz);
create table ems.jobs(client_id uuid not null,property_id uuid,quote_revision_id uuid,number text not null default ('J-'||lpad(nextval('ems.job_number_seq')::text,5,'0')),title text not null,description text not null default '',status text not null default 'unscheduled' check(status in ('unscheduled','scheduled','in_progress','completed','cancelled')),notes text,completed_at timestamptz,archived_at timestamptz);
create table ems.job_contracts(job_id uuid not null,quote_revision_id uuid,snapshot jsonb not null default '{}',customer_snapshot jsonb not null default '{}',subtotal numeric(18,2) not null,tax numeric(18,2) not null,total numeric(18,2) not null,check(subtotal>=0 and tax>=0 and total>=0));
create table ems.visits(job_id uuid,request_id uuid,title text not null,type text not null default 'visit' check(type in ('visit','assessment','general')),description text not null default '',status text not null default 'scheduled' check(status in ('scheduled','in_progress','completed','cancelled')),all_day boolean not null default false,starts_at timestamptz,ends_at timestamptz,start_date date,end_date date,
 check((all_day and start_date is not null and end_date>=start_date and starts_at is null and ends_at is null) or (not all_day and starts_at is not null and ends_at>starts_at and start_date is null and end_date is null)));
create table ems.visit_assignments(visit_id uuid not null,user_id uuid not null);
create table ems.invoices(client_id uuid not null,property_id uuid,job_id uuid,number text not null default ('I-'||lpad(nextval('ems.invoice_number_seq')::text,5,'0')),title text not null,status text not null default 'draft' check(status in ('draft','issued','void')),issued_on date,due_on date,snapshot jsonb not null default '{}',customer_snapshot jsonb not null default '{}',subtotal numeric(18,2) not null default 0,tax numeric(18,2) not null default 0,total numeric(18,2) not null default 0,issued_at timestamptz,voided_at timestamptz,check(subtotal>=0 and tax>=0 and total>=0),check(due_on is null or issued_on is null or due_on>=issued_on));
create table ems.invoice_lines(invoice_id uuid not null,position integer not null default 0,name text not null,description text not null default '',quantity numeric(18,4) not null default 1 check(quantity>=0),unit_price numeric(18,4) not null default 0,taxable boolean not null default true,total numeric(18,2) not null default 0);
create table ems.payments(invoice_id uuid not null,amount numeric(18,2) not null check(amount>0),received_on date not null,method text not null default 'bank_transfer',reference text,notes text,voided_at timestamptz);
create table ems.expenses(user_id uuid not null,job_id uuid,title text not null,category text not null,amount numeric(18,2) not null check(amount>=0),occurred_on date not null,notes text,receipt_path text,archived_at timestamptz);
create table ems.time_entries(user_id uuid not null,job_id uuid,visit_id uuid,started_at timestamptz not null,ended_at timestamptz,break_minutes integer not null default 0 check(break_minutes>=0),status text not null default 'draft' check(status in ('draft','submitted','approved')),notes text,rejection_reason text,approved_at timestamptz,
 check(ended_at is null or (ended_at>started_at and break_minutes*60<=extract(epoch from ended_at-started_at))),check(ended_at is not null or (status='draft' and break_minutes=0)));
create table ems.activity_events(actor_id uuid not null,entity_type text not null,entity_id uuid not null,action text not null,data jsonb not null default '{}');
create table ems.attachments(user_id uuid not null,expense_id uuid,job_id uuid,path text not null,name text not null,content_type text not null,size_bytes bigint not null check(size_bytes>=0));
create table ems.command_receipts(actor_id uuid not null,operation text not null,idempotency_key text not null,payload_digest text not null,result jsonb not null);

do $$ declare t text; begin
 foreach t in array array['clients','properties','requests','quotes','quote_revisions','quote_lines','quote_calculations','products','pricing_settings','quote_templates','jobs','job_contracts','visits','visit_assignments','invoices','invoice_lines','payments','expenses','time_entries','activity_events','attachments','command_receipts'] loop
  execute format('alter table ems.%I add column id uuid primary key default gen_random_uuid(), add column organization_id uuid not null references ems.organizations(id), add column version integer not null default 1 check(version>0), add column created_at timestamptz not null default now(), add column updated_at timestamptz not null default now(), add unique(organization_id,id)',t);
 end loop;
end $$;

do $$ declare rel record; begin
 for rel in select * from (values
 ('properties','client_id','clients'),('requests','client_id','clients'),('requests','property_id','properties'),
 ('quotes','client_id','clients'),('quotes','property_id','properties'),('quotes','request_id','requests'),('quotes','current_revision_id','quote_revisions'),('quotes','approved_revision_id','quote_revisions'),
 ('quote_revisions','quote_id','quotes'),('quote_lines','quote_revision_id','quote_revisions'),('quote_calculations','quote_revision_id','quote_revisions'),
 ('jobs','client_id','clients'),('jobs','property_id','properties'),('jobs','quote_revision_id','quote_revisions'),('job_contracts','job_id','jobs'),('job_contracts','quote_revision_id','quote_revisions'),
 ('visits','job_id','jobs'),('visits','request_id','requests'),('visit_assignments','visit_id','visits'),
 ('invoices','client_id','clients'),('invoices','property_id','properties'),('invoices','job_id','jobs'),('invoice_lines','invoice_id','invoices'),('payments','invoice_id','invoices'),
 ('expenses','job_id','jobs'),('time_entries','job_id','jobs'),('time_entries','visit_id','visits'),('attachments','expense_id','expenses'),('attachments','job_id','jobs')
 ) r(child,col,parent) loop
 execute format('alter table ems.%I add foreign key (organization_id,%I) references ems.%I(organization_id,id)',rel.child,rel.col,rel.parent);
 end loop;
 for rel in select * from (values ('visit_assignments','user_id'),('expenses','user_id'),('time_entries','user_id'),('attachments','user_id'),('activity_events','actor_id'),('command_receipts','actor_id')) r(child,col) loop
 execute format('alter table ems.%I add foreign key(organization_id,%I) references ems.memberships(organization_id,user_id)',rel.child,rel.col);
 end loop;
end $$;

create unique index quote_revision_number on ems.quote_revisions(organization_id,quote_id,revision_number);
create unique index quote_number on ems.quotes(organization_id,number);
create unique index job_number on ems.jobs(organization_id,number);
create unique index invoice_number on ems.invoices(organization_id,number);
create unique index converted_revision_once on ems.jobs(organization_id,quote_revision_id) where quote_revision_id is not null;
create unique index contract_job_once on ems.job_contracts(organization_id,job_id);
create unique index calculation_revision_once on ems.quote_calculations(organization_id,quote_revision_id);
create unique index assignment_once on ems.visit_assignments(organization_id,visit_id,user_id);
create unique index invoice_job_once on ems.invoices(organization_id,job_id) where job_id is not null and status<>'void';
create unique index one_open_timer on ems.time_entries(organization_id,user_id) where ended_at is null;
alter table ems.time_entries add constraint no_overlapping_time exclude using gist(organization_id with =,user_id with =,tstzrange(started_at,ended_at,'[)') with &&);
create unique index command_once on ems.command_receipts(organization_id,actor_id,operation,idempotency_key);
create unique index attachment_path on ems.attachments(path);
create index visits_schedule on ems.visits(organization_id,starts_at,start_date);
create index assignments_user on ems.visit_assignments(organization_id,user_id,visit_id);
create index jobs_client on ems.jobs(organization_id,client_id);
create index requests_client on ems.requests(organization_id,client_id,status);
create index expenses_owner_date on ems.expenses(organization_id,user_id,occurred_on);
create index time_owner_date on ems.time_entries(organization_id,user_id,started_at);
create index activity_entity on ems.activity_events(organization_id,entity_type,entity_id,created_at);

create function ems.touch_updated_at() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now(); return new; end $$;
do $$ declare t record; begin
 for t in select tablename from pg_tables where schemaname='ems' loop
 execute format('alter table ems.%I enable row level security',t.tablename);
 execute format('create trigger touch_updated_at before update on ems.%I for each row execute function ems.touch_updated_at()',t.tablename);
 end loop;
end $$;
