-- Administrators may manage receipts for an active coworker without changing ownership.
alter policy ems_receipt_insert on storage.objects with check (
 bucket_id='ems-receipts' and exists (
  select 1 from ems.memberships owner_member
  where owner_member.organization_id::text=(storage.foldername(storage.objects.name))[1]
   and owner_member.user_id::text=(storage.foldername(storage.objects.name))[2]
   and owner_member.active
   and ems.is_member(owner_member.organization_id)
   and (owner_member.user_id=auth.uid() or ems.is_admin(owner_member.organization_id))
 )
);
alter policy ems_receipt_delete on storage.objects using (
 bucket_id='ems-receipts' and exists (
  select 1 from ems.memberships owner_member
  where owner_member.organization_id::text=(storage.foldername(storage.objects.name))[1]
   and owner_member.user_id::text=(storage.foldername(storage.objects.name))[2]
   and owner_member.active
   and ems.is_member(owner_member.organization_id)
   and (owner_member.user_id=auth.uid() or ems.is_admin(owner_member.organization_id))
 )
);
