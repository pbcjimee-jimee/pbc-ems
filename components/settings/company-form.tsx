'use client';
import { useActionState,useId } from 'react';
import { Field } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { saveSettingsAction,type SettingsState } from '@/app/(ems)/settings/actions';
import type { CompanySettings } from '@/lib/settings/service';
export function CompanyForm({data,version}:{data:CompanySettings;version:number}){
  const [state,action,pending]=useActionState(saveSettingsAction,{} as SettingsState),key=useId();
  const values={...data,...state.values};const error=state.result&&!state.result.ok?state.result.error:undefined;
  return <form onReset={event => event.preventDefault()} action={action} className="panel"><input type="hidden" name="version" value={state.result?.ok?state.result.data.version:version}/><input type="hidden" name="key" value={key+'-'+(state.result?.ok?state.result.data.version:version)}/>
    {error&&<p className="alert" role="alert">{error.message}</p>}{state.result?.ok&&<p className="alert" role="status">Company details saved. Existing issued documents keep their saved details.</p>}
    <div className="form-grid">{([{name:'name',label:'Company display name',required:true},{name:'legalName',label:'Legal business name'},{name:'abn',label:'ABN'},{name:'email',label:'Business email',type:'email'},{name:'phone',label:'Business phone'},{name:'address',label:'Business address'}] as const).map(field=><Field key={field.name} {...field} name={field.name} defaultValue={values[field.name]} error={error?.fields?.[field.name]}/>)}<div className="field"><label htmlFor="bankDetails">Bank and payment details</label><textarea id="bankDetails" name="bankDetails" rows={4} maxLength={2000} defaultValue={values.bankDetails}/><p className="field-hint">Shown on new invoices. Enter your verified business details.</p></div></div><div className="form-actions"><Button type="submit" loading={pending}>Save company details</Button></div>
  </form>
}
