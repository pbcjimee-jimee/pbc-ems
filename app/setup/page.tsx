import Link from "next/link";
import { Status } from "@/components/ui/status";

export const metadata = { title: "Set up EMS" };

export default function SetupPage() {
  return (
    <main id="main-content" className="setup-page">
      <div className="setup-brand">Paint Buddy &amp; Co.</div>
      <section className="setup-panel" aria-labelledby="setup-title">
        <Status tone="warning">Configuration required</Status>
        <h1 id="setup-title">Connect your EMS workspace</h1>
        <p className="page-description">
          Set up a separate Supabase database and authentication service before opening your business workspace.
          No business data is available until this connection is configured.
        </p>
        <h2>Configure the server</h2>
        <ol className="setup-steps">
          <li>Copy <code>.env.example</code> to <code>.env.local</code> in this EMS project.</li>
          <li>Enter the EMS project URL and publishable key, then the private database connection.</li>
          <li>Apply the EMS database migrations and provision the first administrator.</li>
          <li>Restart the application and check the connection.</li>
        </ol>
        <dl className="setup-keys">
          <div><dt><code>NEXT_PUBLIC_SUPABASE_URL</code></dt><dd>EMS Supabase project URL</dd></div>
          <div><dt><code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code></dt><dd>Public application key</dd></div>
          <div><dt><code>EMS_DATABASE_URL</code></dt><dd>Private, restricted server connection</dd></div>
        </dl>
        <p className="alert">Use a dedicated EMS database. Keep database passwords and secret keys on the server.</p>
        <Link className="button" href="/">Check configuration</Link>
      </section>
      <p className="setup-footer">PBC EMS · AUD · Australia/Sydney</p>
    </main>
  );
}
