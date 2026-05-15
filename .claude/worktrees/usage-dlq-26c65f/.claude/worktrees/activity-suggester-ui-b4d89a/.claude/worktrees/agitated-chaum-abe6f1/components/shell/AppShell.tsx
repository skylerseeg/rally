"use client";

// components/shell/AppShell.tsx

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { NavLink } from "./NavLink";
import { UnitSwitcher } from "./UnitSwitcher";
import { UserMenu } from "./UserMenu";
import type { AccessibleUnit } from "@/lib/auth/units";

type ShellUser = { id: string; email: string | null };

type Props = {
  user: ShellUser;
  memberships: AccessibleUnit[];
  activeUnit: AccessibleUnit;
  children: ReactNode;
};

type NavItem = {
  href: string;
  label: string;
  presidencyOnly?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard" },
  { href: "/members", label: "Members" },
  { href: "/activities", label: "Activities" },
  { href: "/lessons", label: "Lessons" },
  { href: "/presidency", label: "Presidency" },
  { href: "/presidency/invitations", label: "Invitations", presidencyOnly: true },
];

export function AppShell({ user, memberships, activeUnit, children }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const isPresidency =
    activeUnit.role === "presidency" || activeUnit.role === "admin";
  const visibleNavItems = NAV_ITEMS.filter(
    (item) => !item.presidencyOnly || isPresidency,
  );

  // Close mobile menu on Escape.
  useEffect(() => {
    if (!mobileOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMobileOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="sticky top-0 z-40 border-b border-slate-800 bg-slate-900 text-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <Link
            href="/"
            className="text-lg font-semibold tracking-tight text-white"
          >
            Rally
          </Link>

          <div className="hidden flex-1 items-center justify-center md:flex">
            <div className="flex items-center gap-1">
              {visibleNavItems.map((item) => (
                <NavLink key={item.href} href={item.href}>
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <UnitSwitcher
              memberships={memberships}
              activeUnit={activeUnit}
            />
            <UserMenu user={user} />
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-200 hover:bg-slate-800 md:hidden"
              aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? (
                <X className="h-5 w-5" aria-hidden />
              ) : (
                <Menu className="h-5 w-5" aria-hidden />
              )}
            </button>
          </div>
        </div>

        {mobileOpen ? (
          <div className="border-t border-slate-800 bg-slate-900 md:hidden">
            <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3">
              {visibleNavItems.map((item) => (
                <NavLink
                  key={item.href}
                  href={item.href}
                  onSelect={() => setMobileOpen(false)}
                  className="block"
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        ) : null}
      </nav>

      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
