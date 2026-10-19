'use client';
import type { QuoteOptionItem } from '@/lib/quotes/types';
import type { CatalogProduct } from '@/lib/quotes/service-types';
import { Materials } from './materials';
import { FormulaSelectionFields } from './formula-selection';
import styles from './quotes.module.css';
export function Options({value,products,onChange}:{value:QuoteOptionItem[];products:CatalogProduct[];onChange:(v:QuoteOptionItem[])=>void}){
  const update=(index:number,change:Partial<QuoteOptionItem>)=>onChange(value.map((r,i)=>i===index?{...r,...change}:r));
  return <>{value.map((option,index)=><fieldset key={option.id} className={styles.row}><legend>Internal option {index+1}</legend><label className="field"><span>Option name</span><input value={option.title} onChange={e=>update(index,{title:e.target.value})}/></label><div className={styles.scope}><FormulaSelectionFields name={'Option '+(index+1)} value={option} onChange={v=>update(index,v)}/></div><Materials rows={option.materials} products={products} label={'Option '+(index+1)+' material'} onChange={materials=>update(index,{materials})}/><div className={styles.actions}><button className="button button-secondary" type="button" onClick={()=>onChange(value.filter((_,i)=>i!==index))}>Remove option {index+1}</button></div></fieldset>)}<button type="button" className="button button-secondary" onClick={()=>onChange([...value,{id:crypto.randomUUID(),title:'New option',materials:[],selectedMin:1,selectedMax:1,isExpanded:true}])}>Add internal option</button><p className={styles.notice}>Options stay separate from the main internal calculation. Add customer optional lines below to include their selling prices.</p></>;
}
