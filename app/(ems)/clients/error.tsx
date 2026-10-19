"use client";
import { Button } from "@/components/ui/button";
export default function ClientsError({ retry }: { retry: () => void }) { return <div className="panel" role="alert"><h1>Customer records could not be loaded</h1><p>Check your connection and try again. Saved records have not been changed.</p><Button onClick={retry}>Try again</Button></div>; }
