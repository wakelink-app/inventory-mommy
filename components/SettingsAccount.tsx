"use client";

import { Check, KeyRound, LogOut, Pencil, X } from "lucide-react";
import { FormEvent, useRef, useState } from "react";

export function SettingsAccount({ initialEmail }: { initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [draft, setDraft] = useState(initialEmail);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const newPasswordRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setDraft(email);
    setError("");
    setEditing(true);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }

  function cancelEdit() {
    setDraft(email);
    setError("");
    setEditing(false);
  }

  function startPasswordChange() {
    setNewPassword("");
    setConfirmPassword("");
    setPasswordError("");
    setPasswordSuccess("");
    setChangingPassword(true);
    requestAnimationFrame(() => newPasswordRef.current?.focus());
  }

  function cancelPasswordChange() {
    setNewPassword("");
    setConfirmPassword("");
    setPasswordError("");
    setPasswordSuccess("");
    setChangingPassword(false);
  }

  async function saveEmail(event?: FormEvent) {
    event?.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: draft }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        email?: string;
      };
      if (!response.ok) {
        setError(data.error || "Could not update email");
        return;
      }
      const next = data.email || draft;
      setEmail(next);
      setDraft(next);
      setEditing(false);
    } catch {
      setError("Could not reach the server");
    } finally {
      setSaving(false);
    }
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");

    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match");
      return;
    }

    setSavingPassword(true);
    try {
      const response = await fetch("/api/account/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setPasswordError(data.error || "Could not change password");
        return;
      }
      setPasswordSuccess("Password updated");
      setNewPassword("");
      setConfirmPassword("");
      setChangingPassword(false);
    } catch {
      setPasswordError("Could not reach the server");
    } finally {
      setSavingPassword(false);
    }
  }

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch("/api/logout", { method: "POST" });
      window.location.href = "/login";
    } catch {
      setSigningOut(false);
    }
  }

  const canSavePassword =
    newPassword.length >= 4 &&
    confirmPassword.length >= 4 &&
    newPassword === confirmPassword;

  return (
    <div className="mx-auto w-full max-w-md pt-2">
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--card)] px-5 py-6 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
          Account
        </p>

        {!editing ? (
          <div className="mt-3 flex items-center gap-2">
            <h1 className="min-w-0 flex-1 truncate text-2xl font-semibold tracking-tight text-[var(--ink)]">
              {email}
            </h1>
            <button
              type="button"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--muted)] transition hover:bg-[var(--wash)] hover:text-[var(--ink)]"
              aria-label="Edit email"
              title="Edit email"
              onClick={startEdit}
            >
              <Pencil size={16} strokeWidth={1.75} />
            </button>
          </div>
        ) : (
          <form onSubmit={saveEmail} className="mt-3 space-y-3">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                className="field"
                type="email"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                autoComplete="email"
                spellCheck={false}
                disabled={saving}
                aria-label="Email"
              />
              <button
                type="submit"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)] text-white transition hover:bg-[var(--accent-dark)] disabled:opacity-50"
                aria-label="Save email"
                disabled={saving || !draft.includes("@")}
              >
                <Check size={18} strokeWidth={2} />
              </button>
              <button
                type="button"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--muted)] transition hover:bg-[var(--wash)] hover:text-[var(--ink)] disabled:opacity-50"
                aria-label="Cancel"
                disabled={saving}
                onClick={cancelEdit}
              >
                <X size={18} strokeWidth={1.75} />
              </button>
            </div>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
          </form>
        )}

        <div className="mt-6 border-t border-[var(--line)] pt-5">
          {!changingPassword ? (
            <button
              type="button"
              className="btn-secondary w-full"
              onClick={startPasswordChange}
            >
              <KeyRound size={18} strokeWidth={1.75} />
              Change password
            </button>
          ) : (
            <form onSubmit={savePassword} className="space-y-3">
              <p className="text-sm font-medium text-[var(--ink)]">Change password</p>
              <input
                ref={newPasswordRef}
                className="field"
                type="password"
                autoComplete="new-password"
                placeholder="New password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={savingPassword}
              />
              <input
                className="field"
                type="password"
                autoComplete="new-password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={savingPassword}
              />
              {passwordError ? <p className="text-sm text-red-600">{passwordError}</p> : null}
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="btn-primary flex-1"
                  disabled={savingPassword || !canSavePassword}
                >
                  {savingPassword ? "Saving…" : "Save password"}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={savingPassword}
                  onClick={cancelPasswordChange}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
          {passwordSuccess ? (
            <p className="mt-3 text-sm text-[var(--accent-dark)]">{passwordSuccess}</p>
          ) : null}
        </div>

        <div className="mt-4 border-t border-[var(--line)] pt-5">
          <button
            type="button"
            className="btn-secondary w-full"
            disabled={signingOut}
            onClick={() => void signOut()}
          >
            <LogOut size={18} strokeWidth={1.75} />
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>
    </div>
  );
}
