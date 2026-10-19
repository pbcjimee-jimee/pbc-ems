import { signIn } from "./actions";
export const dynamic = "force-dynamic";
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main className="login-page"><section className="login-panel" aria-labelledby="login-title">
    <div className="login-brand"><span aria-hidden="true">PBC</span>Paint Buddy &amp; Co.</div>
    <h1 id="login-title">Sign in to PBC EMS</h1><p>Use your company account to manage clients, jobs and schedules.</p>
    {error && <p role="alert" className="error-message">{error === "invalid" ? "Enter a valid email and a password of at least 8 characters." : "Sign-in failed. Check your email and password, then try again."}</p>}
    <form action={signIn}>
      <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="username" required maxLength={254} /></div>
      <div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required minLength={8} maxLength={200} /></div>
      <button type="submit" className="button">Sign in</button>
    </form>
    <p className="muted" style={{ fontSize: 13, margin: 0 }}>Need access? Contact your company administrator.</p>
  </section></main>;
}
