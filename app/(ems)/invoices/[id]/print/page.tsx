import { notFound } from 'next/navigation';
import { getCustomerDocument } from '@/lib/documents/service';
import { CustomerDocumentView } from '@/components/documents/customer-document';
export default async function InvoicePrint({params}:{params:Promise<{id:string}>}){
  const {id}=await params;const document=await getCustomerDocument('invoice',id);if(!document)notFound();
  return <CustomerDocumentView document={document}/>;
}
