'use client';
import { useActionState } from 'react';
import { quoteStatusAction } from '@/app/(ems)/quotes/actions';
import type { QuoteEditorData } from '@/lib/quotes/service-types';
import styles from './quotes.module.css';
const available:Record<string,[string,string][]>={draft:[['issued','Mark issued']],issued:[['approved','Record approval'],['changes_requested','Record changes requested'],['declined','Record decline']],changes_requested:[['issued','Mark reissued'],['declined','Record decline']],approved:[],declined:[],archived:[]};
export function QuoteStatusActions({quote,commandKey}:{quote:QuoteEditorData;commandKey:string}){
  const [state,action,pending]=useActionState(quoteStatusAction,{});
  return <form action={action}><input type="hidden" name="id" value={quote.id}/><input type="hidden" name="expectedVersion" value={quote.version}/><input type="hidden" name="idempotencyKey" value={commandKey}/><div className={styles.actions}>{available[quote.status].map(([next,label])=><button key={next} className="button" name="next" value={next} disabled={pending}>{label}</button>)}<button className="button button-secondary" name="next" value="duplicate" disabled={pending}>Duplicate as draft</button>{quote.status!=='archived'&&<button className="button button-secondary" name="next" value="archived" disabled={pending}>Archive</button>}</div><p className={styles.notice}>Issuing records the document status. It does not send an email.</p>{state.error&&<p className={styles.error} role="alert">{state.error}</p>}{state.success&&<p role="status">{state.success}</p>}</form>;
}
