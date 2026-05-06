// components/ui/Badge.tsx

import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export type BadgeVariant =
  | "spiritual"
  | "service"
  | "social"
  | "physical"
  | "skill"
  | "combined"
  | "neutral";

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  spiritual: "bg-blue-50 text-blue-800 ring-1 ring-inset ring-blue-200",
  service: "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200",
  social: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200",
  physical: "bg-red-50 text-red-800 ring-1 ring-inset ring-red-200",
  skill: "bg-violet-50 text-violet-800 ring-1 ring-inset ring-violet-200",
  combined: "bg-slate-100 text-slate-800 ring-1 ring-inset ring-slate-200",
  neutral: "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200",
};

type Props = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
};

export function Badge({ className, variant = "neutral", ...rest }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        VARIANT_CLASSES[variant],
        className,
      )}
      {...rest}
    />
  );
}
