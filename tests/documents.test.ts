import { describe,it,expect } from 'vitest';
import { customerDocument } from '@/lib/documents/project';

describe('customer document allowlist',()=>{
  it('drops internal calculation and hidden rows, while showing quoted options outside the total',()=>{
    const result=customerDocument({kind:'quote',id:'x',number:'Q-1',title:'한글 현장',status:'issued',date:'2026-10-16',dueDate:null,subtotal:'90.00',tax:'9.00',total:'99.00',paid:'0.00',snapshot:{company:{name:'PBC',bankDetails:'Account details',secret:'private'},terms:'Customer terms',internalMemo:'PRIVATE MEMO',materials:[{actualPrice:'SECRET COST'}],publicLines:[{id:'a',kind:'line_item',name:'Painting',description:'',quantity:'1',unitPrice:'100',taxable:true,clientVisible:true},{id:'b',kind:'line_item',name:'Discount',description:'',quantity:'1',unitPrice:'-10',taxable:true,clientVisible:true},{id:'c',kind:'line_item',name:'Private row',description:'',quantity:'1',unitPrice:'1',taxable:true,clientVisible:false},{id:'d',kind:'line_item',name:'Optional upgrade',description:'',quantity:'1',unitPrice:'50',taxable:true,clientVisible:true,optional:true,selected:false}]},customer:{name:'Client',billingAddress:'Old address',propertyAddress:'Site',secret:'private'}});
    expect(result.lines.map(l=>l.name)).toEqual(['Painting','Discount','Optional upgrade']);
    expect(result.lines[2]).toMatchObject({optional:true,selected:false});
    expect(result.customer.billingAddress).toBe('Old address');
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|SECRET|Private row|secret|internalMemo|actualPrice|materials/);
    expect(result.balance).toBe('99.00');
  });
  it('subtracts payment using decimal cents and exposes only approved line fields',()=>{
    const doc=customerDocument({kind:'invoice',id:'i',number:'I-1',title:'Work',status:'issued',date:'2026-10-16',dueDate:'2026-10-30',subtotal:'100.00',tax:'10.00',total:'110.00',paid:'25.10',snapshot:{company:{name:'PBC'},terms:'',publicLines:[{id:'a',kind:'line_item',name:'Paint',description:'',quantity:'1',unitPrice:'100',taxable:true,clientVisible:true,actualPrice:'NEVER EXPOSE'}]},customer:{name:'Client'}});
    expect(doc.balance).toBe('84.90');expect(JSON.stringify(doc)).not.toContain('NEVER EXPOSE');
  });
  it('keeps cancelled invoice totals as history and removes the payable balance',()=>{
    const doc=customerDocument({kind:'invoice',id:'i',number:'I-2',title:'Cancelled work',status:'void',date:'2026-10-16',dueDate:null,subtotal:'100.00',tax:'10.00',total:'110.00',paid:'0.00',snapshot:{company:{name:'PBC'},terms:'',publicLines:[]},customer:{name:'Client'}});
    expect(doc.total).toBe('110.00');expect(doc.balance).toBe('0.00');
  });
});
