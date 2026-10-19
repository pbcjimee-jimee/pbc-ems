'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { saveQuote, transitionQuote, duplicateQuote, saveProduct, savePricingSettings } from '@/lib/quotes/service';
import { saveQuoteTemplate, importUnverifiedSeedCatalogue } from '@/lib/quotes/templates';
import type { Result, Versioned } from '@/lib/domain/types';
export type QuoteActionState = { error?: string; fields?: Record<string,string>; success?: string };
function decode(form:FormData):unknown { try{return JSON.parse(String(form.get('payload')??'{}'));}catch{return null;} }
function command(form:FormData) {return {expectedVersion:Number(form.get('expectedVersion')),idempotencyKey:String(form.get('idempotencyKey')??'')};}
function state(result:Result<Versioned>):QuoteActionState{return result.ok?{success:'Saved.'}:{error:result.error.message,fields:result.error.fields};}
export async function saveQuoteAction(_:QuoteActionState,form:FormData):Promise<QuoteActionState>{
  const result=await saveQuote(decode(form),command(form));if(!result.ok)return state(result);
  revalidatePath('/quotes');redirect('/quotes/'+result.data.id);
}
export async function quoteStatusAction(_:QuoteActionState,form:FormData):Promise<QuoteActionState>{
  const id=String(form.get('id')??'');const next=form.get('next');
  const result=next==='duplicate'?await duplicateQuote(id,command(form)):await transitionQuote(id,next,command(form));
  if(!result.ok)return state(result);revalidatePath('/quotes');revalidatePath('/quotes/'+id);
  if(next==='duplicate')redirect('/quotes/'+result.data.id+'/edit');return{success:'Quote status updated.'};
}
export async function productAction(_:QuoteActionState,form:FormData):Promise<QuoteActionState>{const result=await saveProduct(decode(form),command(form));if(result.ok)revalidatePath('/quotes');return state(result);}
export async function pricingAction(_:QuoteActionState,form:FormData):Promise<QuoteActionState>{const result=await savePricingSettings(decode(form),command(form));if(result.ok)revalidatePath('/quotes');return state(result);}
export async function templateAction(_:QuoteActionState,form:FormData):Promise<QuoteActionState>{const result=await saveQuoteTemplate(decode(form),command(form));if(result.ok)revalidatePath('/quotes');return state(result);}
export async function seedCatalogueAction(_:QuoteActionState,form:FormData):Promise<QuoteActionState>{const result=await importUnverifiedSeedCatalogue(command(form));if(result.ok)revalidatePath('/quotes');return state(result);}
