"use client";
import { ErrorState } from "@/components/ui/route-states";
export default function ClientsError({ retry }: { error: Error & { digest?: string }; retry: () => void }) { return <ErrorState title="Client records could not be loaded" retry={retry} />; }
