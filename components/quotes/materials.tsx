'use client';
import type { MaterialItem } from '@/lib/quotes/types';
import type { CatalogProduct } from '@/lib/quotes/service-types';
import styles from './quotes.module.css';
export function newMaterial():MaterialItem {return {id:crypto.randomUUID(),name:'Custom material',marketPrice:'0',actualPrice:'0',quantity:'1',workingDays:'0',labourPerDay:'1',isCustom:true,areaScope:'interior',timberRole:'none'};}
export function Materials({rows,products,onChange,label='Materials'}:{rows:MaterialItem[];products:CatalogProduct[];onChange:(rows:MaterialItem[])=>void;label?:string}){
  const update=(index:number,change:Partial<MaterialItem>)=>onChange(rows.map((r,i)=>i===index?{...r,...change}:r));
  return <div>{rows.map((row,index)=><fieldset className={styles.row} key={row.id}><legend>{label} {index+1}: {row.name}</legend><div className={styles.rowGrid}>
    <label className={'field '+styles.wide}><span>Catalogue product or custom material</span><select value={row.isCustom?'':row.productId??''} onChange={e=>{const p=products.find(p=>p.id===e.target.value);update(index,p?{productId:p.id,isCustom:false,name:p.name,unit:p.unit,marketPrice:p.marketPrice,actualPrice:p.actualPrice}:{productId:undefined,isCustom:true});}}><option value="">Custom material / labour only</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}</select></label>
    {row.isCustom&&<label className="field"><span>Material name</span><input value={row.name} maxLength={500} onChange={e=>update(index,{name:e.target.value})}/></label>}
    <label className="field"><span>Market price · AUD Ex GST</span><input inputMode="decimal" value={row.marketPrice} onChange={e=>update(index,{marketPrice:e.target.value})}/></label>
    <label className="field"><span>Actual price · AUD Ex GST</span><input inputMode="decimal" value={row.actualPrice} readOnly={!row.isCustom} onChange={e=>update(index,{actualPrice:e.target.value})}/>{!row.isCustom&&<small>Saved catalogue price</small>}</label>
    {(['quantity','workingDays','labourPerDay'] as const).map((field,i)=><label className="field" key={field}><span>{['Quantity','Working days','Persons per day'][i]}</span><input inputMode="decimal" value={row[field]} onChange={e=>update(index,{[field]:e.target.value})}/></label>)}
    <label className="field"><span>Area</span><select value={row.areaScope??''} onChange={e=>update(index,{areaScope:(e.target.value||undefined) as MaterialItem['areaScope']})}><option value="">Unassigned</option><option value="interior">Interior</option><option value="exterior">Exterior</option><option value="roof">Roof</option></select></label>
    <label className="field"><span>Area / room name</span><input value={row.areaName??''} onChange={e=>update(index,{areaName:e.target.value})}/></label>
    <label className="field"><span>Timber role</span><select value={row.timberRole??'none'} onChange={e=>update(index,{timberRole:e.target.value as MaterialItem['timberRole']})}><option value="none">Not timber</option><option value="shared">Shared preparation</option><option value="finish">Super finish (compare Aqua)</option></select></label>
    <label className={'field '+styles.wide}><span>Material note</span><input value={row.memo??''} onChange={e=>update(index,{memo:e.target.value})}/></label>
  </div><div className={styles.actions}><button type="button" className="button button-secondary" onClick={()=>onChange(rows.filter((_,i)=>i!==index))}>Remove material {index+1}</button></div></fieldset>)}<button type="button" className="button button-secondary" onClick={()=>onChange([...rows,newMaterial()])}>Add material / labour row</button></div>;
}
