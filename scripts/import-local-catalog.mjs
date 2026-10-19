import { readFileSync } from 'node:fs';
import pg from 'pg';
import Decimal from 'decimal.js';
import { loadLocalEnv, fixtures } from './local-db.mjs';

loadLocalEnv();
const target = new URL(process.env.EMS_TEST_DATABASE_URL ?? 'invalid:');
if (!['127.0.0.1','localhost'].includes(target.hostname)) throw new Error('Catalog import only supports the separate local EMS database');
const catalog = JSON.parse(readFileSync('.local/quote-catalog.json','utf8'));
const settings=Object.fromEntries(Object.entries(catalog.settings).map(([key,value])=>[key,new Decimal(value).toString()]));
if (catalog.products.length !== catalog.activeProductCount || catalog.actualPricePolicy !== 'consumer_rrp') throw new Error('Invalid catalog provenance');
const client = new pg.Client({ connectionString: target.toString() });
await client.connect();
try {
  await client.query('BEGIN');
  const organization = await client.query('select name from ems.organizations where id=$1 for update',[fixtures.pbcOrganizationId]);
  if (!organization.rows[0]?.name.includes('Local sample')) throw new Error('Import requires the explicitly labelled local sample company');
  for (const product of catalog.products) {
    const data = { ...product, source: `${catalog.source} · ${catalog.capturedOn}`, capturedOn: catalog.capturedOn, actualPricePolicy: catalog.actualPricePolicy };
    await client.query('insert into ems.products(id,organization_id,code,name,unit,price,data) values($1,$2,$3,$4,$5,$6,$7::jsonb) on conflict(id) do update set code=excluded.code,name=excluded.name,unit=excluded.unit,price=excluded.price,data=excluded.data,archived_at=null,version=ems.products.version+1,updated_at=now() where ems.products.organization_id=excluded.organization_id',[product.id,fixtures.pbcOrganizationId,product.productCode,product.name,product.unit??'each',product.marketPrice,JSON.stringify(data)]);
  }
  const current = await client.query("select id from ems.pricing_settings where organization_id=$1 and name='current' order by created_at limit 1",[fixtures.pbcOrganizationId]);
  if (current.rows[0]) await client.query('update ems.pricing_settings set data=$1::jsonb,version=version+1,updated_at=now() where id=$2',[JSON.stringify(settings),current.rows[0].id]);
  else await client.query("insert into ems.pricing_settings(organization_id,name,data) values($1,'current',$2::jsonb)",[fixtures.pbcOrganizationId,JSON.stringify(settings)]);
  await client.query('COMMIT');
  console.log(`Imported ${catalog.activeProductCount} active operating catalog products and pricing settings into local EMS. Source captured ${catalog.capturedOn}.`);
} catch (error) { await client.query('ROLLBACK'); throw error; }
finally { await client.end(); }
