"use client";
import { Button } from "@/components/ui/button";
export default function RequestsError({ retry }: { retry: () => void }) { return <div className="panel" role="alert"><h1>Requests could not be loaded</h1><p>Check your connection and try again. Saved requests have not been changed.</p><Button onClick={retry}>Try again</Button></div>; }
