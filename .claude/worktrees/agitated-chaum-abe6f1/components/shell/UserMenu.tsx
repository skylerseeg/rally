"use client";

// components/shell/UserMenu.tsx

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/cn";

type Props = {
  user: { id: string; email: string | null };
};

function initialsFromEmail(email: string | null): string {
  if (!email) return "?";
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0]!.charAt(0) + parts[1]!.charAt(0)).toUpperCase();
  }
  return (local.charAt(0) || "?").toUpperCase();
}

export function UserMenu({ user }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const initials = initialsFromEmail(user.email);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Open user menu"
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-full bg-slate-700 text-sm font-semibold text-slate-100",
          "hover:bg-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400",
        )}
      >
        {initials}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-64 origin-top-right rounded-md border border-slate-200 bg-white p-1 shadow-lg"
        >
          <div className="px-3 py-2 text-xs text-slate-500">
            Signed in as
            <div className="truncate font-medium text-slate-900">
              {user.email ?? "unknown"}
            </div>
          </div>
          <div className="my-1 h-px bg-slate-100" />
          <form action="/sign-out" method="post">
            <button
              type="submit"
              className="flex w-full items-center rounded-md px-3 py-2 text-left text-sm text-slate-900 hover:bg-slate-100"
              role="menuitem"
            >
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
