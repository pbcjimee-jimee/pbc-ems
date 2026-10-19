import Decimal from 'decimal.js';
import type { CustomerDocument, CustomerSnapshot, DocumentCompany } from './types';
import type { PublicLineDraft } from '@/lib/quotes/types';

type DocumentInput = Omit<CustomerDocument,'company'|'customer'|'lines'|'terms'|'balance'> & { snapshot: unknown; customer: unknown };
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const string=(v:unknown)=>typeof v==='string'?v:'';
const nullable=(v:unknown)=>string(v)||null;
export function customerDocument(input:DocumentInput):CustomerDocument {
  const snapshot=object(input.snapshot), rawCompany=object(snapshot.company), rawCustomer=object(input.customer);
  const company:DocumentCompany={ name:string(rawCompany.name) };
  for(const key of ['legalName','abn','address','email','phone','bankDetails'] as const) if(typeof rawCompany[key]==='string')company[key]=rawCompany[key];
  const customer:CustomerSnapshot={name:string(rawCustomer.name),company:nullable(rawCustomer.company),email:nullable(rawCustomer.email),phone:nullable(rawCustomer.phone),billingAddress:nullable(rawCustomer.billingAddress),propertyAddress:nullable(rawCustomer.propertyAddress)};
  const lines:PublicLineDraft[]=[];
  for(const value of Array.isArray(snapshot.publicLines)?snapshot.publicLines:[]) {
    const line=object(value);
    if(line.clientVisible!==true || (input.kind==='invoice'&&line.optional===true&&line.selected!==true) || !['text','line_item'].includes(string(line.kind)))continue;
    lines.push({id:string(line.id),kind:line.kind as PublicLineDraft['kind'],name:string(line.name),description:string(line.description),quantity:string(line.quantity),unitPrice:string(line.unitPrice),taxable:line.taxable===true,clientVisible:true,optional:line.optional===true,selected:line.selected===true});
  }
  return {kind:input.kind,id:input.id,number:input.number,title:input.title,status:input.status,date:input.date,dueDate:input.dueDate,company,customer,lines,terms:string(snapshot.terms),subtotal:input.subtotal,tax:input.tax,total:input.total,paid:input.paid,balance:input.status==='void'?'0.00':new Decimal(input.total).minus(input.paid).toFixed(2)};
}
