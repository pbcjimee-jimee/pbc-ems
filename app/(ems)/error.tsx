"use client";
import { ErrorState } from "@/components/ui/route-states";
export default function WorkspaceSectionError({ retry }: { error: Error & { digest?: string }; retry: () => void }) { return <ErrorState title="This page could not be loaded" retry={retry} />; }
