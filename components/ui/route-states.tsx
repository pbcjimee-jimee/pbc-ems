"use client";

import { Button } from "./button";
import { Icon } from "./icon";

/** Page skeleton shown while a route segment streams. Mirrors the header + list layout to avoid layout shift. */
export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div className="page-header" aria-hidden="true">
        <div><span className="skeleton" style={{ width: 220, height: 32 }} /><span className="skeleton" style={{ width: 340, height: 16, marginTop: 12 }} /></div>
        <span className="skeleton" style={{ width: 140, height: 44 }} />
      </div>
      <div className="card" aria-hidden="true" style={{ padding: 20, display: "grid", gap: 16 }}>
        {Array.from({ length: 6 }, (_, index) => <span key={index} className="skeleton" style={{ height: 20, width: `${90 - index * 8}%` }} />)}
      </div>
    </div>
  );
}

/** Route error fallback. Saved data is never changed by a failed read, so say so and offer a retry. */
export function ErrorState({ title, retry }: { title: string; retry: () => void }) {
  return (
    <div className="empty-state" role="alert">
      <span className="empty-state-icon" style={{ background: "var(--color-danger-subtle)", color: "var(--color-danger)" }}><Icon name="alert" size={24} /></span>
      <h2>{title}</h2>
      <p>Check your connection and try again. Saved records have not been changed.</p>
      <Button onClick={() => retry()} icon="arrow">Try again</Button>
    </div>
  );
}
