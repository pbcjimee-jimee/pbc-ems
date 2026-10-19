'use server';
import { revalidatePath } from 'next/cache';
import { saveCompanySettings } from '@/lib/settings/service';
import type { Result,Versioned } from '@/lib/domain/types';
export type SettingsState={result?:Result<Versioned>;values?:Record<string,string>};
export async function saveSettingsAction(_previous:SettingsState,form:FormData):Promise<SettingsState>{
  const values=Object.fromEntries([...form.entries()].filter((e):e is [string,string]=>typeof e[1]==='string'));
  const result=await saveCompanySettings(Object.fromEntries(['name','legalName','abn','address','email','phone','bankDetails'].map(k=>[k,values[k]??''])),{expectedVersion:Number(values.version),idempotencyKey:values.key});
  if(result.ok)revalidatePath('/','layout');return {result,values};
}
