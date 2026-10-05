import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { Backdrop } from "@/components/backdrop";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { arrivedVia, authConfigured, supabase } from "@/lib/supabase";

type AuthApi = { email: string; signOut: () => Promise<void> };
const AuthContext = createContext<AuthApi>({ email: "", signOut: async () => {} });
export const useAuth = () => useContext(AuthContext);

type Screen = "sign-in" | "forgot" | "set-password";

/** Shows the sign-in screens until there is a session, then the app. */
export function AuthGate({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  // Invite and reset links sign the person in; they still need to choose a password.
  const [needsPassword, setNeedsPassword] = useState(arrivedVia !== null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === "PASSWORD_RECOVERY") setNeedsPassword(true);
      if (event === "SIGNED_OUT") queryClient.clear();
      setSession(next);
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  if (!authConfigured) return <NotConfigured />;
  if (session === undefined) return <div className="min-h-[100dvh] bg-background" />;

  if (!session) return <AuthScreen initial={arrivedVia === "recovery" ? "forgot" : "sign-in"} />;
  if (needsPassword) {
    return (
      <AuthFrame>
        <SetPassword email={session.user.email ?? ""} isInvite={arrivedVia === "invite"} onDone={() => setNeedsPassword(false)} />
      </AuthFrame>
    );
  }

  const api: AuthApi = {
    email: session.user.email ?? "",
    signOut: async () => {
      await supabase!.auth.signOut();
      queryClient.clear();
    },
  };
  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>;
}

function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative grid min-h-[100dvh] place-items-center overflow-hidden px-4 py-10">
      <Backdrop />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2.5">
          <img src="/favicon.svg" alt="" className="size-7" />
          <span className="text-lg font-semibold tracking-tight">Life Board</span>
        </div>
        <div className="rounded-xl border border-border bg-card/95 p-6 shadow-[0_8px_16px_-4px_rgba(0,0,0,.35),0_24px_32px_-8px_rgba(0,0,0,.45)] backdrop-blur">
          {children}
        </div>
      </div>
    </div>
  );
}

function AuthScreen({ initial }: { initial: Screen }) {
  const [screen, setScreen] = useState<Screen>(initial);
  const [email, setEmail] = useState("");
  return (
    <AuthFrame>
      {screen === "forgot" ? (
        <Forgot email={email} setEmail={setEmail} onBack={() => setScreen("sign-in")} />
      ) : (
        <SignIn email={email} setEmail={setEmail} onForgot={() => setScreen("forgot")} />
      )}
    </AuthFrame>
  );
}

function FormMessage({ error, info }: { error?: string | null; info?: string | null }) {
  if (error) {
    return (
      <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {error}
      </p>
    );
  }
  if (info) {
    return (
      <p role="status" className="rounded-md bg-ship/10 px-3 py-2 text-sm text-foreground">
        {info}
      </p>
    );
  }
  return null;
}

function SignIn({ email, setEmail, onForgot }: { email: string; setEmail: (v: string) => void; onForgot: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error } = await supabase!.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(error.message === "Invalid login credentials" ? "Wrong email or password." : error.message);
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      <div className="grid gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-sm text-muted-foreground">Use the email you were invited with.</p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="si-email">Email</Label>
        <Input id="si-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
      </div>
      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="si-password">Password</Label>
          <button type="button" onClick={onForgot} className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            Forgot password?
          </button>
        </div>
        <Input
          id="si-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      <FormMessage error={error} />
      <Button type="submit" size="lg" disabled={busy}>
        {busy ? "Signing in" : "Sign in"}
      </Button>
    </form>
  );
}

function Forgot({ email, setEmail, onBack }: { email: string; setEmail: (v: string) => void; onBack: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error } = await supabase!.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      <div className="grid gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Reset your password</h1>
        <p className="text-sm text-muted-foreground">We'll email you a link to choose a new one.</p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="fp-email">Email</Label>
        <Input id="fp-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
      </div>
      <FormMessage error={error} info={sent ? "If that email has an account, a reset link is on its way." : null} />
      <div className="grid gap-2">
        <Button type="submit" size="lg" disabled={busy || sent}>
          Send reset link
        </Button>
        <Button type="button" variant="ghost" onClick={onBack}>
          Back to sign in
        </Button>
      </div>
    </form>
  );
}

function SetPassword({ email, isInvite, onDone }: { email: string; isInvite: boolean; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== confirm) return setError("The two passwords don't match.");
    setBusy(true);
    const { error } = await supabase!.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(error.message);
    // Drop the invite/recovery hash so a reload doesn't ask again.
    history.replaceState(null, "", window.location.pathname);
    onDone();
  }

  return (
    <form onSubmit={submit} className="grid gap-5">
      <div className="grid gap-1">
        <h1 className="text-xl font-semibold tracking-tight">{isInvite ? "Welcome. Choose a password" : "Choose a new password"}</h1>
        <p className="text-sm text-muted-foreground">For {email}</p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="sp-new">New password</Label>
        <Input id="sp-new" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
        <p className="text-xs text-muted-foreground">At least 8 characters.</p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="sp-confirm">Repeat password</Label>
        <Input id="sp-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      </div>
      <FormMessage error={error} />
      <Button type="submit" size="lg" disabled={busy}>
        Save password
      </Button>
    </form>
  );
}

function NotConfigured() {
  return (
    <AuthFrame>
      <div className="grid gap-3">
        <h1 className="text-lg font-semibold">Sign-in isn't set up yet</h1>
        <p className="text-sm text-muted-foreground">
          Add <code className="text-foreground">VITE_SUPABASE_URL</code> and{" "}
          <code className="text-foreground">VITE_SUPABASE_PUBLISHABLE_KEY</code> to <code className="text-foreground">.env.local</code>, then
          restart. The README has the steps.
        </p>
      </div>
    </AuthFrame>
  );
}
