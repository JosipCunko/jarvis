"use client";

import { FormEvent, useState } from "react";
import { useSession } from "next-auth/react";
import { format } from "date-fns";
import { Button } from "@/app/_components/Button";
import { notifyError, notifySuccess } from "@/app/_components/notify";
import { changeOperatorPassword, updateOperatorName } from "@/app/_lib/auth-client";
import type { AuthProvider } from "@/app/_types/jarvis";

const fieldClass =
  "rounded-lg border border-line bg-hud px-3 py-2 text-sm text-ink outline-none focus:border-cyan disabled:text-muted";

export function AccountView({
  displayName,
  email,
  provider,
  createdAt,
  googleConfigured,
  googleEmail,
  onDisconnectGoogle,
  onNameSaved,
}: {
  displayName: string;
  email: string;
  provider: AuthProvider;
  createdAt: number;
  googleConfigured: boolean;
  googleEmail: string | null;
  onDisconnectGoogle: () => void;
  onNameSaved: (displayName: string) => void;
}) {
  const { update } = useSession();
  const demo = provider !== "firebase";
  const [name, setName] = useState(displayName);
  const [nameSource, setNameSource] = useState(displayName);
  if (displayName !== nameSource) {
    setNameSource(displayName);
    setName(displayName);
  }
  const [savingName, setSavingName] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  const memberSince = Number.isFinite(createdAt)
    ? format(new Date(createdAt), "d MMMM yyyy")
    : "Unknown";

  async function saveName(event: FormEvent) {
    event.preventDefault();
    const next = name.trim();
    if (!next || demo || savingName) return;
    setSavingName(true);
    try {
      await updateOperatorName(next);
      const response = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: next }),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!response.ok) {
        throw new Error(data?.error?.message ?? "Could not save that name");
      }
      await update({ name: next });
      onNameSaved(next);
      notifySuccess("Name updated");
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Could not save that name");
    } finally {
      setSavingName(false);
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    if (demo || changingPassword) return;
    if (nextPassword.length < 6) {
      notifyError("Use at least 6 characters");
      return;
    }
    if (nextPassword !== confirmPassword) {
      notifyError("New passwords do not match");
      return;
    }
    setChangingPassword(true);
    try {
      await changeOperatorPassword(currentPassword, nextPassword);
      setCurrentPassword("");
      setNextPassword("");
      setConfirmPassword("");
      notifySuccess("Password changed");
    } catch (error) {
      notifyError(error instanceof Error ? error.message : "Could not change the password");
    } finally {
      setChangingPassword(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-[1600px] gap-3 xl:grid-cols-2">
      <section className="hud-panel rounded-xl p-4">
        <h2 className="font-mono text-[10px] tracking-[0.28em] text-muted">ACCOUNT</h2>
        <p className="mt-1 text-sm text-ink/90">Operator identity</p>
        {demo ? (
          <p className="mt-3 rounded-lg border border-line bg-hud px-3 py-2 text-sm text-muted">
            Demo mode has no real account.
          </p>
        ) : null}
        <form className="mt-4 grid gap-4" onSubmit={(event) => void saveName(event)}>
          <label className="grid gap-1 text-xs tracking-widest text-muted uppercase">
            Callsign
            <input
              className={fieldClass}
              value={name}
              maxLength={80}
              disabled={demo}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-xs tracking-widest text-muted uppercase">
            Email
            <input className={fieldClass} value={email || "—"} readOnly disabled />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs tracking-widest text-muted uppercase">Provider</p>
              <p className="mt-1 text-sm">{demo ? "Demo" : "Firebase"}</p>
            </div>
            <div>
              <p className="text-xs tracking-widest text-muted uppercase">Member since</p>
              <p className="mt-1 text-sm">{memberSince}</p>
            </div>
          </div>
          <div>
            <Button
              type="submit"
              shape="pill"
              size="sm"
              variant="solid"
              disabled={demo || savingName || !name.trim() || name.trim() === displayName}
            >
              {savingName ? "Saving…" : "Save name"}
            </Button>
          </div>
        </form>
      </section>

      <section className="hud-panel rounded-xl p-4">
        <h2 className="font-mono text-[10px] tracking-[0.28em] text-muted">PASSWORD</h2>
        <p className="mt-1 text-sm text-ink/90">Set a new password while you are signed in</p>
        <form className="mt-4 grid gap-4" onSubmit={(event) => void changePassword(event)}>
          <label className="grid gap-1 text-xs tracking-widest text-muted uppercase">
            Current password
            <input
              className={fieldClass}
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              disabled={demo}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-xs tracking-widest text-muted uppercase">
            New password
            <input
              className={fieldClass}
              type="password"
              autoComplete="new-password"
              minLength={6}
              value={nextPassword}
              disabled={demo}
              onChange={(event) => setNextPassword(event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-xs tracking-widest text-muted uppercase">
            Confirm new password
            <input
              className={fieldClass}
              type="password"
              autoComplete="new-password"
              minLength={6}
              value={confirmPassword}
              disabled={demo}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </label>
          <div>
            <Button
              type="submit"
              shape="pill"
              size="sm"
              variant="solid"
              disabled={
                demo ||
                changingPassword ||
                !currentPassword ||
                !nextPassword ||
                !confirmPassword
              }
            >
              {changingPassword ? "Updating…" : "Change password"}
            </Button>
          </div>
        </form>
      </section>

      <section className="hud-panel rounded-xl p-4 xl:col-span-2">
        <h2 className="font-mono text-[10px] tracking-[0.28em] text-muted">GOOGLE</h2>
        <p className="mt-1 text-sm text-ink/90">Calendar and Gmail</p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line/70 px-3 py-3">
          <div>
            <p className="text-sm">{googleEmail ?? "Not linked"}</p>
            <p className="mt-1 font-mono text-[10px] tracking-widest text-muted">
              {googleEmail
                ? "Connected"
                : googleConfigured
                  ? "Not linked"
                  : "Set GOOGLE_CLIENT_ID"}
            </p>
          </div>
          {googleEmail ? (
            <Button shape="pill" size="sm" tone="danger" onClick={onDisconnectGoogle}>
              Disconnect
            </Button>
          ) : googleConfigured ? (
            <Button href="/api/google/connect" shape="pill" size="sm">
              Connect
            </Button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
