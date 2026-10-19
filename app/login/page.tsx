import { signIn } from "./actions";
export const dynamic = "force-dynamic";
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <main className="login-page"><section className="login-panel" aria-labelledby="login-title"><h1 id="login-title">Sign in to PBC EMS</h1><p>Use your company account to manage clients, jobs and schedules.</p>
    {error && <p role="alert" className="error-message">{error === "invalid" ? "Enter a valid email and a password of at least 8 characters." : "Sign-in failed. Check your email and password, then try again."}</p>}
    <form action={signIn}><label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="username" required maxLength={254} /><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required minLength={8} maxLength={200} /><button type="submit" className="button button-primary">Sign in</button></form>
    <p className="muted">Need access? Contact your company administrator.</p></section></main>;
}
