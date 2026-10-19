import { getCompanySettings } from '@/lib/settings/service';
import { CompanyForm } from '@/components/settings/company-form';
import { PageHeader } from '@/components/ui/page-header';
export default async function SettingsPage(){const settings=await getCompanySettings();return <div className="form-page"><PageHeader title="Company details" description="Business information used on new customer quotes and invoices. AUD · Australia/Sydney."/><CompanyForm data={settings.data} version={settings.version}/></div>}
