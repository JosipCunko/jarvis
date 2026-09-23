"use client";

import {
  BookOpen,
  Briefcase,
  Bug,
  CalendarDays,
  Camera,
  Car,
  Code2,
  Coffee,
  Dumbbell,
  FileText,
  Flag,
  HeartPulse,
  Home,
  Leaf,
  Mail,
  MessageSquare,
  Mic,
  Music,
  PenLine,
  Phone,
  Plane,
  Rocket,
  Shield,
  ShoppingCart,
  Sparkles,
  Stethoscope,
  Target,
  Users,
  UtensilsCrossed,
  Wallet,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/app/_lib/cn";
import {
  resolveTaskAppearance,
  taskSwatch,
  type TaskIconId,
} from "@/app/_lib/task-appearance";

const ICONS: Record<TaskIconId, LucideIcon> = {
  target: Target,
  rocket: Rocket,
  code: Code2,
  bug: Bug,
  mail: Mail,
  calendar: CalendarDays,
  phone: Phone,
  cart: ShoppingCart,
  home: Home,
  heart: HeartPulse,
  stethoscope: Stethoscope,
  book: BookOpen,
  pen: PenLine,
  users: Users,
  briefcase: Briefcase,
  zap: Zap,
  flag: Flag,
  coffee: Coffee,
  car: Car,
  plane: Plane,
  music: Music,
  camera: Camera,
  dumbbell: Dumbbell,
  leaf: Leaf,
  shield: Shield,
  wrench: Wrench,
  spark: Sparkles,
  message: MessageSquare,
  file: FileText,
  wallet: Wallet,
  mic: Mic,
  utensils: UtensilsCrossed,
};

export function TaskGlyph({
  title,
  icon,
  color,
  size = 16,
  className,
}: {
  title: string;
  icon?: string;
  color?: string;
  size?: number;
  className?: string;
}) {
  const look = resolveTaskAppearance({ title, icon, color });
  const swatch = taskSwatch(look.color);
  const Icon = ICONS[look.icon];
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-xl border",
        className,
      )}
      style={{
        width: size + 18,
        height: size + 18,
        color: swatch.hex,
        borderColor: `${swatch.hex}88`,
        background: `${swatch.hex}18`,
        boxShadow: `0 0 16px ${swatch.hex}33`,
      }}
    >
      <Icon size={size} />
    </span>
  );
}
