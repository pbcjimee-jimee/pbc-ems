import { getCompanySettings } from '@/lib/settings/service';
import { CompanyForm } from '@/components/settings/company-form';
export default async function SettingsPage(){const settings=await getCompanySettings();return <><div className="page-header"><div><h1>Company details</h1><p className="page-description">Business information used on new customer quotes and invoices. AUD · Australia/Sydney.</p></div></div><CompanyForm data={settings.data} version={settings.version}/></>}
