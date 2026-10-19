alter policy ems_receipt_read on storage.objects using(
 bucket_id='ems-receipts' and exists(
 select 1 from ems.attachments a where a.path=storage.objects.name
 and ems.is_member(a.organization_id) and (ems.is_admin(a.organization_id) or a.user_id=auth.uid())
 ));
