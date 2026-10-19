# Commercial snapshot contract

Owned by root for Task9 document integration. Tasks5/6 consume lib/documents/types.ts.

- quote_revisions.snapshot / job_contracts.snapshot / invoices.snapshot contain CommercialSnapshot:
  {publicLines: PublicLineDraft[],terms:string,workType?:string,company:DocumentCompany}.
- customer_snapshot contains CustomerSnapshot:
  {name,company,email,phone,billingAddress,propertyAddress}.
- company settings are ems.organizations.settings JSON:
  {legalName?,abn?,address?,email?,phone?,bankDetails?}. Company.name is organization's display name.
- quote_calculations stores internal input/result/products/settings; never put them in CommercialSnapshot or CustomerDocument.
- Numeric totals are SQL numeric/string; tax is GST from calculateCommercialTotals().gst.
- job_contracts freezes public snapshot/customer/totals from an approved quote revision.
- invoices.snapshot remains the exact immutable commercial snapshot, alongside normalized invoice_lines.
- Manual public lines/optional selection must not be replaced with internal engine totals.
- Documents use an allowlist CustomerDocument; never send raw rows/calculation to the print component.

`CommercialSnapshot.source` freezes the selected client/site IDs; `document` freezes quote title/validUntil per revision. They are server metadata and omitted from the customer output DTO. Approved job conversion uses these frozen IDs even after the current quote draft changes customer/site.
