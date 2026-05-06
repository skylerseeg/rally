"use client";

// components/shell/NavLink.tsx

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type Props = {
  href: string;
  children: ReactNode;
  className?: string;
  onSelect?: () => void;
};

export function NavLink({ href, children, className, onSelect }: Props) {
  const pathname = usePathname();
  const isActive =
    pathname === href || (href !== "/" && pathname?.startsWith(`${href}/`));

  return (
    <Link
      href={href}
      onClick={onSelect}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        isActive
          ? "bg-slate-800 text-white"
          : "text-slate-300 hover:bg-slate-800 hover:text-white",
        className,
      )}
    >
      {children}
    </Link>
  );
}
