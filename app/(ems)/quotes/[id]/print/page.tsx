import { notFound } from 'next/navigation';
import { getCustomerDocument } from '@/lib/documents/service';
import { CustomerDocumentView } from '@/components/documents/customer-document';
export default async function QuotePrint({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{revision?:string;revisionId?:string}>}){
  const {id}=await params;const query=await searchParams;
  const document=await getCustomerDocument('quote',id,query.revisionId??query.revision);if(!document)notFound();
  return <CustomerDocumentView document={document}/>;
}
