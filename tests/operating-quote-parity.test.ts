import { describe,it,expect } from 'vitest';
import { existsSync,readFileSync } from 'node:fs';
import Decimal from 'decimal.js';
import { calculateQuoteSnapshot,type QuoteCalculationInput } from '@/lib/quotes/calculation';
import type { PricingSettings } from '@/lib/calculator';
// Private source cases contain calculation inputs only; never customer names, addresses or Jobber payloads.
const file='.local/operating-cases.json';
const cases:Record<string,unknown>[]=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):[];
describe.skipIf(!cases.length)('operating PBC calculation parity (private local capture)',()=>{
  for(const [index,row] of cases.entries())it(`matches operating saved case ${index+1}`,()=>{
    const materials=(row.materials as Record<string,unknown>[]).map(m=>Object.fromEntries(Object.entries(m).filter(([,v])=>v!==null)));
    const input={materials,selectedMin:row.selected_min,selectedMax:row.selected_max,workingDays:row.working_days??'0',labourPerDay:row.labour_per_day??'0',areaFormulaSelections:Object.fromEntries(['interior','exterior','roof'].map(scope=>[scope,{selectedMin:row[scope+'_selected_min']??row.selected_min,selectedMax:row[scope+'_selected_max']??row.selected_max}]))} as unknown as QuoteCalculationInput;
    const settings=Object.fromEntries(Object.entries(row.pricing_settings_snapshot as Record<string,unknown>).map(([k,v])=>[k,new Decimal(String(v))])) as unknown as PricingSettings;
    const snapshot=calculateQuoteSnapshot(input,settings);
    expect(snapshot.main.subtotal).toBe(new Decimal(String(row.subtotal)).toFixed(2));
    expect(snapshot.main.finalTotal).toBe(new Decimal(String(row.final_total)).toFixed(2));
  });
});
