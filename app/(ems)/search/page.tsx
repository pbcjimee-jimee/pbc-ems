import Link from "next/link";
import { withEmsTransaction } from "@/lib/db/transaction";
export default async function SearchPage({searchParams}:{searchParams:Promise<{q?:string}>}) {
  const q=(await searchParams).q?.trim().slice(0,120)??"";
  const results=q.length>=2?await withEmsTransaction(async tx=>{
    const pattern="%"+q.replaceAll("\\","\\\\").replaceAll("%","\\%").replaceAll("_","\\_")+"%";
    const clients=await tx.query<{id:string;title:string;detail:string|null}>("select id,display_name as title,company_name as detail from ems.clients where archived_at is null and (display_name ilike $1 or email ilike $1 or phone ilike $1) order by display_name limit 20",[pattern]);
    const jobs=await tx.query<{id:string;title:string;detail:string|null}>("select id,title,number as detail from ems.jobs where archived_at is null and (title ilike $1 or number ilike $1) order by updated_at desc limit 20",[pattern]);
    return {clients,jobs};
  }):null;
  return <><div className="page-header"><div><h1 className="page-title">Search</h1><p className="page-description">Find clients and work available to your account.</p></div></div><form className="toolbar" action="/search"><label className="field" style={{flex:1,maxWidth:560}}><span>Client, job or job number</span><input type="search" name="q" minLength={2} maxLength={120} defaultValue={q} autoFocus required/></label><button className="button" type="submit">Search</button></form>{results?<div className="form-grid">{(["clients","jobs"] as const).map(type=><section className="panel" key={type}><h2>{type==="clients"?"Clients":"Jobs"} <small>({results[type].length})</small></h2>{results[type].length?<ul style={{paddingLeft:20}}>{results[type].map(row=><li key={row.id} style={{marginBottom:14}}><Link href={"/"+type+"/"+row.id}>{row.title}</Link>{row.detail&&<small style={{display:"block",color:"var(--color-muted)"}}>{row.detail}</small>}</li>)}</ul>:<p className="page-description">No {type} match this search.</p>}</section>)}</div>:<div className="empty-state"><h2>Search your workspace</h2><p>Enter at least two characters to find a client or job.</p></div>}</>;
}

