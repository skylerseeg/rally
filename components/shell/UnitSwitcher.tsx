"use client";

// components/shell/UnitSwitcher.tsx

import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/cn";
import { formatCallingTitle, formatUnitName } from "@/lib/format";
import type { AccessibleUnit } from "@/lib/auth/units";

type Props = {
  memberships: AccessibleUnit[];
  activeUnit: AccessibleUnit;
};

export function UnitSwitcher({ memberships, activeUnit }: Props) {
  if (memberships.length <= 1) {
    return (
      <span className="text-sm font-medium text-slate-100">
        {formatUnitName(activeUnit.unit)}
      </span>
    );
  }
  return (
    <UnitSwitcherDropdown
      memberships={memberships}
      activeUnit={activeUnit}
    />
  );
}

function UnitSwitcherDropdown({ memberships, activeUnit }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setError(null);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setError(null);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function focusItem(index: number) {
    const el = itemRefs.current[index];
    if (el) el.focus();
  }

  function onMenuKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!open) return;
    const count = memberships.length;
    const current = itemRefs.current.findIndex(
      (el) => el === document.activeElement,
    );
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusItem(current < count - 1 ? current + 1 : 0);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusItem(current > 0 ? current - 1 : count - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusItem(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusItem(count - 1);
    }
  }

  async function selectUnit(unitId: string) {
    if (unitId === activeUnit.unit.id) {
      setOpen(false);
      setError(null);
      return;
    }
    setPendingId(unitId);
    setError(null);
    try {
      const res = await fetch("/api/active-unit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unit_id: unitId }),
      });
      if (!res.ok) {
        // Try to surface the route's structured error; fall back to a
        // status-derived message so the leader at least sees that the
        // switch didn't take effect.
        let message = `Couldn't switch units (HTTP ${res.status}).`;
        try {
          const body = (await res.json()) as { error?: unknown };
          if (typeof body.error === "string" && body.error.length > 0) {
            message = body.error;
          }
        } catch {
          // Body wasn't JSON; keep the status-derived fallback.
        }
        console.error("UnitSwitcher: failed to set active unit", message);
        setError(message);
        return;
      }
      setOpen(false);
      setError(null);
      router.refresh();
    } catch (err) {
      const message =
        err instanceof Error
          ? `Couldn't reach the server: ${err.message}`
          : "Couldn't reach the server.";
      console.error("UnitSwitcher: network error", err);
      setError(message);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative"
      onKeyDown={onMenuKeyDown}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-2 rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-100",
          "hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400",
        )}
      >
        <span className="max-w-[12rem] truncate">
          {formatUnitName(activeUnit.unit)}
        </span>
        <ChevronDown className="h-4 w-4 opacity-70" aria-hidden />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-72 origin-top-right rounded-md border border-slate-200 bg-white p-1 shadow-lg"
        >
          {error ? (
            <p
              role="alert"
              className="mx-1 mb-1 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800"
            >
              {error}
            </p>
          ) : null}
          {memberships.map((m, i) => {
            const isActive = m.unit.id === activeUnit.unit.id;
            return (
              <button
                key={m.unit.id}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                role="menuitem"
                type="button"
                onClick={() => selectUnit(m.unit.id)}
                disabled={pendingId !== null}
                className={cn(
                  "flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left text-sm",
                  "hover:bg-slate-100 focus:outline-none focus-visible:bg-slate-100",
                  isActive ? "bg-slate-50" : "",
                )}
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900">
                    {formatUnitName(m.unit)}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    {m.role}
                  </span>
                </span>
                {m.calling_title ? (
                  <span className="text-xs italic text-slate-500">
                    {formatCallingTitle(m.calling_title, m.role)}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
