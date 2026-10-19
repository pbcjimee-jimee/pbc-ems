import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

export const fixtures = {
  pbcOrganizationId: "10000000-0000-4000-8000-000000000001", otherOrganizationId: "10000000-0000-4000-8000-000000000002",
  pbcAdmin: "20000000-0000-4000-8000-000000000001", pbcSupervisor: "20000000-0000-4000-8000-000000000002", otherCompanyAdmin: "20000000-0000-4000-8000-000000000003", inactiveUser: "20000000-0000-4000-8000-000000000004",
  pbcClientId: "30000000-0000-4000-8000-000000000001", otherClientId: "30000000-0000-4000-8000-000000000002", pbcPropertyId: "40000000-0000-4000-8000-000000000001", pbcJobId: "50000000-0000-4000-8000-000000000001", unassignedJobId: "50000000-0000-4000-8000-000000000002", pbcVisitId: "60000000-0000-4000-8000-000000000001",
};
export function loadLocalEnv() {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
}
function assertLocal(connectionString) {
  const url = new URL(connectionString);
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error("Local fixture tools refuse remote databases");
}
export async function resetLocalFixtures() {
  loadLocalEnv();
  const databaseUrl = process.env.EMS_TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error("Run node scripts/local-db.mjs setup first");
  assertLocal(databaseUrl); assertLocal(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const client = new pg.Client({ connectionString: databaseUrl }); await client.connect();
  try {
    const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.EMS_LOCAL_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const password = process.env.EMS_LOCAL_TEST_PASSWORD;
    for (const [id, email] of [[fixtures.pbcAdmin,"admin@ems.local"],[fixtures.pbcSupervisor,"supervisor@ems.local"],[fixtures.otherCompanyAdmin,"other@ems.local"],[fixtures.inactiveUser,"inactive@ems.local"]]) {
      const existing = await auth.auth.admin.getUserById(id);
      if (!existing.data.user) {
        const { error } = await auth.auth.admin.createUser({ id, email, password, email_confirm: true });
        if (error) throw error;
      }
    }
    await client.query("BEGIN");
    await client.query("truncate ems.organizations cascade");
    await client.query("insert into ems.organizations(id,name) values($1,'PBC — Local sample'),($2,'Other company — Local sample')", [fixtures.pbcOrganizationId,fixtures.otherOrganizationId]);
    for (const [user, org, role, active, name] of [[fixtures.pbcAdmin,fixtures.pbcOrganizationId,"admin",true,"Sample administrator"],[fixtures.pbcSupervisor,fixtures.pbcOrganizationId,"supervisor",true,"Sample supervisor"],[fixtures.otherCompanyAdmin,fixtures.otherOrganizationId,"admin",true,"Other administrator"],[fixtures.inactiveUser,fixtures.pbcOrganizationId,"supervisor",false,"Inactive sample"]]) {
      await client.query("insert into ems.memberships(organization_id,user_id,role,active,display_name) values($1,$2,$3,$4,$5)",[org,user,role,active,name]);
    }
    await client.query("insert into ems.clients(id,organization_id,display_name,email,billing_address) values($1,$2,'Sample client — 한글 고객','sample@example.test','Sample billing address'),($3,$4,'Other sample client',null,null)",[fixtures.pbcClientId,fixtures.pbcOrganizationId,fixtures.otherClientId,fixtures.otherOrganizationId]);
    await client.query("insert into ems.properties(id,organization_id,client_id,label,address) values($1,$2,$3,'Sample property','Sample address, Sydney NSW')",[fixtures.pbcPropertyId,fixtures.pbcOrganizationId,fixtures.pbcClientId]);
    await client.query("insert into ems.jobs(id,organization_id,client_id,property_id,title) values($1,$2,$3,$4,'Sample assigned job'),($5,$2,$3,$4,'Sample unassigned job')",[fixtures.pbcJobId,fixtures.pbcOrganizationId,fixtures.pbcClientId,fixtures.pbcPropertyId,fixtures.unassignedJobId]);
    const sampleContract={company:{name:'PBC — Local sample'},publicLines:[{id:'sample-line',kind:'line_item',name:'Sample painting work',description:'Sample scope for local testing',quantity:'1',unitPrice:'100.00',taxable:true,clientVisible:true}],terms:'Sample terms. Not a live customer agreement.',source:{clientId:fixtures.pbcClientId,propertyId:fixtures.pbcPropertyId}};
    const sampleCustomer={name:'Sample client — 한글 고객',company:null,email:'sample@example.test',phone:null,billingAddress:'Sample billing address',propertyAddress:'Sample address, Sydney NSW'};
    for(const jobId of [fixtures.pbcJobId,fixtures.unassignedJobId])await client.query("insert into ems.job_contracts(organization_id,job_id,snapshot,customer_snapshot,subtotal,tax,total) values($1,$2,$3::jsonb,$4::jsonb,100,10,110)",[fixtures.pbcOrganizationId,jobId,JSON.stringify(sampleContract),JSON.stringify(sampleCustomer)]);
    await client.query("insert into ems.visits(id,organization_id,job_id,title,starts_at,ends_at) values($1,$2,$3,'Sample assigned visit',now()+interval '1 day',now()+interval '1 day 2 hours')",[fixtures.pbcVisitId,fixtures.pbcOrganizationId,fixtures.pbcJobId]);
    await client.query("insert into ems.visit_assignments(organization_id,visit_id,user_id) values($1,$2,$3)",[fixtures.pbcOrganizationId,fixtures.pbcVisitId,fixtures.pbcSupervisor]);
    await client.query("insert into ems.expenses(organization_id,user_id,title,category,amount,occurred_on) values($1,$2,'Sample admin expense','materials',20,current_date)",[fixtures.pbcOrganizationId,fixtures.pbcAdmin]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { await client.end(); }
}

async function setup() {
  // The npm package exposes the platform binary; use its JS launcher without a shell.
  const launcher = existsSync("node_modules/supabase/bin/supabase") ? "node_modules/supabase/bin/supabase" : "node_modules/supabase/dist/supabase.js";
  const cliOutput = execFileSync(process.execPath,[launcher,"--profile","supabase/local-cli-profile.json","status","-o","json"],{encoding:"utf8",stdio:["ignore","pipe","pipe"]});
  const status = JSON.parse(cliOutput);
  assertLocal(status.DB_URL);
  const previous = existsSync(".env.local") ? readFileSync(".env.local","utf8") : "";
  const previousPassword = previous.match(/^EMS_LOCAL_TEST_PASSWORD=(.+)$/m)?.[1];
  const testPassword = previousPassword ?? `Local-${randomBytes(18).toString("base64url")}`;
  const runtimePassword = randomBytes(24).toString("base64url");
  const client = new pg.Client({ connectionString: status.DB_URL }); await client.connect();
  try { const formatted = await client.query("select format('alter role ems_runtime password %L',$1::text) as sql",[runtimePassword]); await client.query(formatted.rows[0].sql); } finally { await client.end(); }
  const runtime = new URL(status.DB_URL); runtime.username="ems_runtime"; runtime.password=runtimePassword;
  const values = {NEXT_PUBLIC_SUPABASE_URL:status.API_URL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:status.PUBLISHABLE_KEY ?? status.ANON_KEY,EMS_DATABASE_URL:runtime.toString(),EMS_TEST_DATABASE_URL:status.DB_URL,EMS_LOCAL_SERVICE_ROLE_KEY:status.SERVICE_ROLE_KEY,EMS_LOCAL_TEST_PASSWORD:testPassword};
  writeFileSync(".env.local",Object.entries(values).map(([key,value])=>`${key}=${value}`).join("\n")+"\n");
  writeFileSync(".superpowers/sdd/pbc-ems/local-login.txt",`LOCAL TEST ACCOUNTS ONLY\nadmin@ems.local\nsupervisor@ems.local\nPassword: ${testPassword}\n`);
  await resetLocalFixtures();
  console.log("Local EMS environment and sample accounts ready. Credentials: .superpowers/sdd/pbc-ems/local-login.txt");
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  if (process.argv[2]==="setup") await setup();
  else if (process.argv[2]==="seed") { await resetLocalFixtures(); console.log("Local sample fixtures reset"); }
  else throw new Error("Usage: node scripts/local-db.mjs setup|seed");
}
