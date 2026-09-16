"use client";

import { type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cn } from "@/app/_lib/cn";

const sizes = {
  sm: {
    circle: "h-9 w-9 text-xs",
    pill: "h-9 gap-1.5 px-3 text-xs",
  },
  md: {
    circle: "h-11 w-11 text-sm",
    pill: "h-11 gap-1.5 px-3.5 text-xs",
  },
} as const;

export type ButtonShape = "circle" | "pill";
export type ButtonSize = keyof typeof sizes;
export type ButtonVariant = "outline" | "solid" | "ghost";
export type ButtonTone = "cyan" | "ok" | "danger";

type SharedProps = {
  shape?: ButtonShape;
  size?: ButtonSize;
  variant?: ButtonVariant;
  tone?: ButtonTone;
  active?: boolean;
  className?: string;
  children?: ReactNode;
};

type ButtonAsButton = SharedProps &
  Omit<ComponentPropsWithoutRef<"button">, "href"> & {
    href?: undefined;
  };

type ButtonAsLink = SharedProps &
  Omit<ComponentPropsWithoutRef<"a">, "href"> & {
    href: string;
  };

export type ButtonProps = ButtonAsButton | ButtonAsLink;

const toneHover = {
  cyan: "hover:border-cyan/70 hover:bg-cyan/10 hover:text-cyan hover:shadow-[0_0_18px_rgba(0,212,255,0.32)]",
  ok: "hover:border-ok/70 hover:bg-ok/10 hover:text-ok hover:shadow-[0_0_18px_rgba(61,255,176,0.28)]",
  danger:
    "hover:border-danger/70 hover:bg-danger/10 hover:text-danger hover:shadow-[0_0_18px_rgba(255,93,115,0.28)]",
} as const;

const toneActive = {
  cyan: "border-cyan bg-cyan/15 text-cyan shadow-[0_0_18px_rgba(0,212,255,0.45)]",
  ok: "border-ok bg-ok/15 text-ok shadow-[0_0_18px_rgba(61,255,176,0.35)]",
  danger: "border-danger bg-danger/15 text-danger shadow-[0_0_18px_rgba(255,93,115,0.35)]",
} as const;

const toneSolid = {
  cyan: "border-cyan bg-cyan text-hud hover:bg-cyan-2 hover:shadow-[0_0_18px_rgba(0,212,255,0.45)]",
  ok: "border-ok bg-ok text-hud hover:shadow-[0_0_18px_rgba(61,255,176,0.4)]",
  danger: "border-danger bg-danger text-hud hover:shadow-[0_0_18px_rgba(255,93,115,0.4)]",
} as const;

const toneGhost = {
  cyan: "text-muted hover:border-line hover:bg-cyan/10 hover:text-cyan",
  ok: "text-ok hover:border-ok/40 hover:bg-ok/10",
  danger: "text-muted hover:border-danger/40 hover:bg-danger/10 hover:text-danger",
} as const;

const toneOutlineRest = {
  cyan: "border-line bg-hud/50 text-muted",
  ok: "border-ok/40 bg-hud/50 text-ok",
  danger: "border-danger/40 bg-hud/50 text-danger",
} as const;

export function Button({
  shape = "circle",
  size = "md",
  variant = "outline",
  tone = "cyan",
  active = false,
  className,
  children,
  ...props
}: ButtonProps) {
  const classNames = cn(
    "hud-btn inline-flex items-center justify-center rounded-full border font-medium select-none",
    "transition-[scale,translate,background-color,border-color,color,box-shadow] duration-200 ease-out",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/45",
    "disabled:pointer-events-none disabled:opacity-50",
    "motion-safe:hover:-translate-y-px motion-safe:hover:scale-105",
    "motion-safe:active:translate-y-0 motion-safe:active:scale-95",
    sizes[size][shape],
    shape === "circle" && "shrink-0",
    variant === "outline" && !active && toneOutlineRest[tone],
    variant === "outline" && !active && toneHover[tone],
    variant === "outline" && active && toneActive[tone],
    variant === "solid" && toneSolid[tone],
    variant === "ghost" && "border-transparent bg-transparent",
    variant === "ghost" && (active ? toneActive[tone] : toneGhost[tone]),
    active && "hud-btn-live",
    className,
  );

  if ("href" in props && props.href) {
    const { href, ...linkProps } = props;
    return (
      <a
        href={href}
        className={classNames}
        data-active={active ? "true" : undefined}
        {...linkProps}
      >
        {children}
      </a>
    );
  }

  const { type = "button", ...buttonProps } = props as ComponentPropsWithoutRef<"button">;
  return (
    <button
      type={type}
      className={classNames}
      aria-pressed={active || undefined}
      data-active={active ? "true" : undefined}
      {...buttonProps}
    >
      {children}
    </button>
  );
}
