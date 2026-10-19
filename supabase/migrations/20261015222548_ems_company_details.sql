-- Company document fields only; membership, role and tenant identity remain immutable.
grant update(name,settings,version,updated_at) on ems.organizations to authenticated;
create policy org_admin_update on ems.organizations for update to authenticated
using(ems.is_admin(id)) with check(ems.is_admin(id));
