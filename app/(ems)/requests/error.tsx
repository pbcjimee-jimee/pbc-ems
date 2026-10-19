"use client";
import { ErrorState } from "@/components/ui/route-states";
export default function RequestsError({ retry }: { error: Error & { digest?: string }; retry: () => void }) { return <ErrorState title="Requests could not be loaded" retry={retry} />; }
