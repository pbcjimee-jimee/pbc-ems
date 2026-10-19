import 'server-only';
import { z } from 'zod';
import { withEmsTransaction } from '@/lib/db/transaction';
import { requireAdmin } from '@/lib/auth/permissions';
import { runCommand,requireVersion,WorkflowError } from '@/lib/workflows/commands';
import type { Result,Versioned } from '@/lib/domain/types';
const text=(max:number)=>z.string().trim().max(max).default('');
export const companySchema=z.object({name:z.string().trim().min(1).max(200),legalName:text(200),abn:text(80),address:text(2000),email:z.union([z.email(),z.literal('')]).default(''),phone:text(80),bankDetails:text(2000)}).strict();
export type CompanySettings=z.infer<typeof companySchema>;
const metaSchema=z.object({expectedVersion:z.number().int().positive(),idempotencyKey:z.string().min(1).max(200)}).strict();
export async function getCompanySettings(){return withEmsTransaction(async tx=>{await requireAdmin(tx);const [row]=await tx.query<{id:string;version:number;name:string;settings:Record<string,unknown>}>('select id,version,name,settings from ems.organizations where id=$1',[tx.actor.organizationId]);return {id:row.id,version:row.version,data:companySchema.parse({name:row.name,...Object.fromEntries(['legalName','abn','address','email','phone','bankDetails'].map(k=>[k,typeof row.settings[k]==='string'?row.settings[k]:'']))})};});}
export async function saveCompanySettings(input:unknown,meta:unknown):Promise<Result<Versioned>>{
  const parsed=companySchema.safeParse(input),command=metaSchema.safeParse(meta);
  if(!parsed.success||!command.success)return {ok:false,error:{code:'VALIDATION',message:'Check the company details and try again.',fields:parsed.success?undefined:Object.fromEntries(parsed.error.issues.map(i=>[i.path.join('.'),i.message]))}};
  try{return {ok:true,data:await withEmsTransaction(async tx=>{
    await requireAdmin(tx);
    return runCommand(tx,'company.save',command.data,parsed.data,async()=>{
      const [current]=await tx.query<{version:number}>('select version from ems.organizations where id=$1 for update',[tx.actor.organizationId]);requireVersion(current.version,command.data.expectedVersion);
      const {name,...settings}=parsed.data;
      const [saved]=await tx.query<Versioned>('update ems.organizations set name=$1,settings=settings||$2::jsonb,version=version+1,updated_at=now() where id=$3 returning id,version',[name,JSON.stringify(settings),tx.actor.organizationId]);return saved;
    });
  })};}catch(error){return {ok:false,error:{code:error instanceof WorkflowError?error.code:'SAVE_FAILED',message:error instanceof WorkflowError?error.message:'Company details could not be saved. Your input is kept.'}};}
}
