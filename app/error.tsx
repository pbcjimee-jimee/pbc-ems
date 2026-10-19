"use client";
import Link from "next/link";
export default function WorkspaceError({ retry }: { error: Error & {digest?:string}; retry:()=>void }) {
  return <main style={{maxWidth:560,margin:"12vh auto",padding:24}}>
    <h1>We couldn&apos;t load this workspace</h1><p className="page-description">Your saved records are kept. Try again, or sign in with an active company account.</p>
    <div className="form-actions"><button className="button" onClick={retry}>Try again</button><Link className="button button-secondary" href="/login">Go to sign in</Link></div>
  </main>;
}

