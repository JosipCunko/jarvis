"use client";

import toast, { Toaster, type Toast } from "react-hot-toast";
import { AlertCircle, Check, Info, X } from "lucide-react";
import { cn } from "@/app/_lib/cn";

type Tone = "success" | "error" | "info";

const toastChrome = {
  background: "transparent",
  boxShadow: "none",
  padding: 0,
} as const;

function ToastCard({
  t,
  message,
  tone,
}: {
  t: Toast;
  message: string;
  tone: Tone;
}) {
  const Icon = tone === "success" ? Check : tone === "error" ? AlertCircle : Info;
  return (
    <div
      className={cn(
        "flex min-w-0 max-w-88 items-start gap-3 rounded-xl border bg-panel px-4 py-3 shadow-[0_0_24px_rgba(0,212,255,0.12)]",
        t.visible
          ? "pointer-events-auto animate-[jarvis-toast-in_0.28s_ease]"
          : "pointer-events-none animate-[jarvis-toast-out_0.48s_cubic-bezier(0.22,1,0.36,1)_forwards]",
        tone === "success" && "border-cyan/40",
        tone === "error" && "border-danger/50",
        tone === "info" && "border-line",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          tone === "success" && "bg-cyan/15 text-cyan",
          tone === "error" && "bg-danger/15 text-danger",
          tone === "info" && "bg-panel-2 text-muted",
        )}
      >
        <Icon size={16} strokeWidth={2.2} className="min-h-4 min-w-4 shrink-0" />
      </span>
      <p className="flex-1 pt-1.5 text-sm leading-5 text-ink">{message}</p>
      <button
        type="button"
        className="mt-1 rounded-full p-1 text-muted transition hover:bg-panel-2 hover:text-ink"
        onClick={() => toast.dismiss(t.id)}
        aria-label="Dismiss"
      >
        <X size={14} className="min-h-[14px] min-w-[14px] shrink-0" />
      </button>
    </div>
  );
}

function show(message: string, tone: Tone) {
  toast.custom((t) => <ToastCard t={t} message={message.replace(/\.+$/, "")} tone={tone} />, {
    duration: tone === "error" ? 4200 : 3000,
    removeDelay: 520,
    style: toastChrome,
  });
}

export function notifySuccess(message: string) {
  show(message, "success");
}

export function notifyError(message: string) {
  show(message, "error");
}

export function notifyInfo(message: string) {
  show(message, "info");
}

export function AppToaster() {
  return (
    <Toaster
      position="top-center"
      gutter={12}
      containerStyle={{ top: 18, zIndex: 100000, overflow: "visible" }}
      toastOptions={{
        duration: 3000,
        style: toastChrome,
      }}
    />
  );
}
