"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { notifyError, notifySuccess } from "@/app/_components/notify";
import {
  signInDemo,
  signInWithEmailAndPasswordFirebase,
  signUpWithEmailAndPasswordFirebase,
} from "@/app/_lib/auth-client";

export default function LoginForm({
  firebaseReady,
  demoReady,
}: {
  firebaseReady: boolean;
  demoReady: boolean;
}) {
  const router = useRouter();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (isSignUp) {
        await signUpWithEmailAndPasswordFirebase(email, password, displayName);
        notifySuccess("Identity registered");
      } else {
        await signInWithEmailAndPasswordFirebase(email, password);
        notifySuccess("Welcome back, sir");
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not sign in";
      setError(message);
      notifyError(message);
    } finally {
      setLoading(false);
    }
  }

  async function onDemo() {
    setError(null);
    setLoading(true);
    try {
      await signInDemo();
      notifySuccess("Demo operator online");
      router.push("/");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Demo login failed";
      setError(message);
      notifyError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center px-6 py-16 hud-grid">
      <div className="hud-panel w-full max-w-md rounded-2xl p-8">
        <p className="font-mono text-[10px] tracking-[0.35em] text-cyan">
          JARVIS // ACCESS
        </p>
        <h1 className="mt-3 font-display text-3xl tracking-wide text-cyan hud-glow">
          {isSignUp ? "Create operator" : "Authenticate"}
        </h1>
        <p className="mt-2 text-sm text-muted">
          Sign in to the command center. Firebase email/password, or demo mode.
        </p>

        {firebaseReady ? (
          <form onSubmit={onSubmit} className="mt-8 grid gap-4">
            {isSignUp ? (
              <label className="grid gap-1 text-xs uppercase tracking-widest text-muted">
                Callsign
                <input
                  className="rounded-lg border border-line bg-hud px-3 py-2 text-sm text-ink outline-none focus:border-cyan"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Operator"
                />
              </label>
            ) : null}
            <label className="grid gap-1 text-xs uppercase tracking-widest text-muted">
              Email
              <input
                className="rounded-lg border border-line bg-hud px-3 py-2 text-sm text-ink outline-none focus:border-cyan"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-xs uppercase tracking-widest text-muted">
              Password
              <input
                className="rounded-lg border border-line bg-hud px-3 py-2 text-sm text-ink outline-none focus:border-cyan"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-cyan px-4 py-2.5 text-sm font-medium text-hud hover:bg-cyan-2 disabled:opacity-50"
            >
              {loading ? "Working…" : isSignUp ? "Create account" : "Sign in"}
            </button>
            <button
              type="button"
              className="text-sm text-muted hover:text-cyan"
              onClick={() => setIsSignUp((value) => !value)}
            >
              {isSignUp
                ? "Already registered? Sign in"
                : "New operator? Create an account"}
            </button>
          </form>
        ) : (
          <p className="mt-6 rounded-xl border border-line bg-hud px-4 py-3 text-sm text-muted">
            Firebase web keys are not in <code>.env.local</code> yet. Use demo
            mode, or add the project keys.
          </p>
        )}

        {demoReady ? (
          <div className="mt-4">
            {error && !firebaseReady ? (
              <p className="mb-3 text-sm text-danger">{error}</p>
            ) : null}
            <button
              type="button"
              className="w-full rounded-lg border border-line px-4 py-2.5 text-sm text-cyan hover:border-cyan disabled:opacity-50"
              disabled={loading}
              onClick={() => void onDemo()}
            >
              Continue as demo operator
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
