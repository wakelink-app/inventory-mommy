"use client";

import { FormEvent, useEffect, useState } from "react";
import { AlertCircle, KeyRound, Loader2, Mail, Sparkles } from "lucide-react";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "register" | "setup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/auth/status");
        const data = (await response.json()) as { needsSetup?: boolean; authed?: boolean };
        if (cancelled) return;
        if (data.authed) {
          window.location.replace("/");
          return;
        }
        setMode(data.needsSetup ? "setup" : "login");
      } catch {
        if (!cancelled) setMode("login");
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function switchMode(next: "login" | "register") {
    setError("");
    setMode(next);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const endpoint = mode === "register" ? "/api/register" : "/api/login";
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error || "Could not sign in");
        return;
      }
      window.location.href = "/";
    } catch {
      setError("Could not reach the server");
    } finally {
      setSubmitting(false);
    }
  }

  if (!ready) {
    return (
      <div className="auth-loading">
        <div className="auth-spinner" aria-hidden="true" />
        <p className="text-sm text-[var(--muted)]">Loading…</p>
      </div>
    );
  }

  const isRegister = mode === "register" || mode === "setup";
  const title = mode === "setup" ? "Welcome" : isRegister ? "Create account" : "Welcome back";
  const subtitle =
    mode === "setup"
      ? "Set up your account. Your inventory, bins, and labels stay right where they are."
      : isRegister
        ? "Start a fresh catalog with its own inventory and bins."
        : "Sign in to manage your inventory, listings, and bins.";

  return (
    <main className="auth-page">
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png?v=2" alt="" width={56} height={56} className="object-contain" />
            <p className="auth-brand-name">Inventory Mommy</p>
            <p className="auth-brand-tagline">Identify, price, and catalog your items</p>
          </div>

          <div className="auth-heading">
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>

          {mode !== "setup" && (
            <div className="auth-tabs" role="tablist" aria-label="Account mode">
              <button
                type="button"
                role="tab"
                aria-selected={mode === "login"}
                className={`auth-tab${mode === "login" ? " is-active" : ""}`}
                onClick={() => switchMode("login")}
              >
                Sign in
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "register"}
                className={`auth-tab${mode === "register" ? " is-active" : ""}`}
                onClick={() => switchMode("register")}
              >
                Create account
              </button>
            </div>
          )}

          <form onSubmit={onSubmit} className="auth-form">
            <div className="auth-field">
              <label className="auth-label" htmlFor="auth-email">
                Email
              </label>
              <div className="auth-input-wrap">
                <Mail size={17} strokeWidth={1.75} className="auth-input-icon" aria-hidden="true" />
                <input
                  id="auth-email"
                  className="field"
                  autoFocus
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={submitting}
                />
              </div>
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="auth-password">
                Password
              </label>
              <div className="auth-input-wrap">
                <KeyRound size={17} strokeWidth={1.75} className="auth-input-icon" aria-hidden="true" />
                <input
                  id="auth-password"
                  className="field"
                  type="password"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  placeholder={isRegister ? "At least 4 characters" : "Your password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting}
                />
              </div>
            </div>

            {error ? (
              <div className="auth-error" role="alert">
                <AlertCircle size={16} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            ) : null}

            <button
              type="submit"
              className="btn-primary auth-submit w-full"
              disabled={submitting || !email.includes("@") || password.length < 4}
            >
              {submitting ? (
                <>
                  <Loader2 size={18} strokeWidth={2} className="animate-spin" aria-hidden="true" />
                  {isRegister ? "Creating account…" : "Signing in…"}
                </>
              ) : isRegister ? (
                <>
                  <Sparkles size={18} strokeWidth={1.75} aria-hidden="true" />
                  Create account
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>

          {mode === "setup" ? (
            <p className="auth-footnote">This is a one-time setup for your existing data.</p>
          ) : mode === "register" ? (
            <p className="auth-footnote">Each account gets its own separate catalog.</p>
          ) : (
            <p className="auth-footnote">Use the email and password from your account settings.</p>
          )}
        </div>
      </div>
    </main>
  );
}
