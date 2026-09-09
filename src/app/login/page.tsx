"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getErrorMessage } from "@/lib/getErrorMessage";

type Mode = "password" | "magic_link";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Previously handled by middleware (redirect away from /login once already signed in) — now
  // done here directly, since this app's middleware.ts had to be removed entirely (see CLAUDE.md:
  // this Next.js/Vercel combination's Edge-runtime middleware crashes with a Next.js/Turbopack
  // platform bug — `ReferenceError: __dirname is not defined` — that reproduces even with zero
  // third-party imports in middleware.ts, so it isn't something our own code can fix).
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) window.location.href = "/dashboard";
    });
  }, []);

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    const supabase = createClient();
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage("Account created! Check your email to confirm, then sign in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.href = "/dashboard";
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    const supabase = createClient();
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) throw error;
      setMessage("Check your email for a sign-in link.");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-xl font-bold text-slate-900">Benefit Cliff Navigator</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in to save your profile and get renewal/eligibility reminders.</p>
        </div>

        <div className="flex gap-2 text-sm">
          <button
            onClick={() => setMode("password")}
            className={`flex-1 rounded-lg px-3 py-1.5 font-medium ${mode === "password" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
          >
            Email & password
          </button>
          <button
            onClick={() => setMode("magic_link")}
            className={`flex-1 rounded-lg px-3 py-1.5 font-medium ${mode === "magic_link" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}
          >
            Magic link
          </button>
        </div>

        {mode === "password" ? (
          <form onSubmit={handlePasswordSubmit} className="space-y-3">
            <input
              type="email"
              required
              placeholder="you@example.com"
              className="w-full rounded-lg border border-slate-300 p-2 text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              type="password"
              required
              minLength={6}
              placeholder="Password"
              className="w-full rounded-lg border border-slate-300 p-2 text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-700 disabled:bg-slate-300"
            >
              {loading ? "Please wait…" : isSignUp ? "Create account" : "Sign in"}
            </button>
            <button type="button" onClick={() => setIsSignUp((v) => !v)} className="w-full text-center text-xs text-slate-500 underline">
              {isSignUp ? "Already have an account? Sign in" : "New here? Create an account"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleMagicLink} className="space-y-3">
            <input
              type="email"
              required
              placeholder="you@example.com"
              className="w-full rounded-lg border border-slate-300 p-2 text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-700 disabled:bg-slate-300"
            >
              {loading ? "Sending…" : "Send magic link"}
            </button>
          </form>
        )}

        {error && <p className="text-center text-sm text-rose-600">{error}</p>}
        {message && <p className="text-center text-sm text-emerald-600">{message}</p>}

        <p className="text-center text-xs text-slate-400">
          Just want to try it without an account?{" "}
          <a href="/demo" className="underline">
            Open the no-login demo
          </a>
        </p>
      </div>
    </main>
  );
}
