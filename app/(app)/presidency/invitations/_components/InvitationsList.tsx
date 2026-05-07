"use client";

import { useMemo, useState, useTransition } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate, formatRelativeTime } from "@/lib/format";
import {
  ROLE_LABEL,
  type InvitationRole,
} from "@/lib/validation/invitation";
import { resendInvitation, revokeInvitation } from "../actions";

type InvitationRow = {
  id: string;
  email: string;
  role: InvitationRole;
  calling_title: string | null;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

type Props = {
  invitations: InvitationRow[];
};

type Bucket = "pending" | "accepted" | "revoked";

function classify(row: InvitationRow): Bucket {
  if (row.revoked_at) return "revoked";
  if (row.accepted_at) return "accepted";
  if (new Date(row.expires_at).getTime() < Date.now()) return "revoked";
  return "pending";
}

export function InvitationsList({ invitations }: Props) {
  const grouped = useMemo(() => {
    const pending: InvitationRow[] = [];
    const accepted: InvitationRow[] = [];
    const revoked: InvitationRow[] = [];
    for (const r of invitations) {
      const b = classify(r);
      if (b === "pending") pending.push(r);
      else if (b === "accepted") accepted.push(r);
      else revoked.push(r);
    }
    return { pending, accepted, revoked };
  }, [invitations]);

  return (
    <div className="flex flex-col gap-6">
      <Section
        title="Pending"
        count={grouped.pending.length}
        defaultOpen
        emptyDescription="Invite a leader using the form above."
      >
        {grouped.pending.length === 0 ? null : (
          <ul className="flex flex-col gap-3">
            {grouped.pending.map((row) => (
              <PendingRow key={row.id} row={row} />
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Accepted"
        count={grouped.accepted.length}
        emptyDescription="Accepted invitations will appear here."
      >
        {grouped.accepted.length === 0 ? null : (
          <ul className="flex flex-col gap-2">
            {grouped.accepted.map((row) => (
              <li key={row.id} className="text-sm text-slate-700">
                <span className="font-medium text-slate-900">{row.email}</span>{" "}
                <Badge variant="combined">{ROLE_LABEL[row.role]}</Badge>
                {row.accepted_at ? (
                  <span className="text-xs text-slate-500">
                    {" · accepted "}
                    {formatRelativeTime(row.accepted_at)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Revoked or expired"
        count={grouped.revoked.length}
        emptyDescription="Revoked or expired invitations will appear here."
      >
        {grouped.revoked.length === 0 ? null : (
          <ul className="flex flex-col gap-2">
            {grouped.revoked.map((row) => (
              <li key={row.id} className="text-sm text-slate-500">
                <span className="font-medium text-slate-700">{row.email}</span>{" "}
                <Badge variant="neutral">{ROLE_LABEL[row.role]}</Badge>
                {row.revoked_at ? (
                  <span className="text-xs">
                    {" · revoked "}
                    {formatRelativeTime(row.revoked_at)}
                  </span>
                ) : (
                  <span className="text-xs">
                    {" · expired "}
                    {formatDate(row.expires_at, "short")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  count,
  defaultOpen = false,
  emptyDescription,
  children,
}: {
  title: string;
  count: number;
  defaultOpen?: boolean;
  emptyDescription: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-baseline justify-between text-left"
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
          {title}
        </h2>
        <span className="text-xs font-medium text-slate-500">
          {count} · {open ? "hide" : "show"}
        </span>
      </button>
      {open ? (
        count === 0 ? (
          <EmptyState title="None yet" description={emptyDescription} />
        ) : (
          children
        )
      ) : null}
    </section>
  );
}

function PendingRow({ row }: { row: InvitationRow }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const expiresInDays = Math.max(
    0,
    Math.ceil(
      (new Date(row.expires_at).getTime() - Date.now()) /
        (24 * 60 * 60 * 1000),
    ),
  );

  function onRevoke() {
    if (!window.confirm(`Revoke invitation for ${row.email}?`)) return;
    setError(null);
    startTransition(async () => {
      const result = await revokeInvitation(row.id);
      if (!result.ok) setError(result.error);
    });
  }

  function onResend() {
    setError(null);
    startTransition(async () => {
      const result = await resendInvitation(row.id);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <li>
      <Card className="flex flex-col gap-2">
        <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-base font-semibold text-slate-900">{row.email}</p>
            <p className="text-xs text-slate-500">
              <Badge variant="combined">{ROLE_LABEL[row.role]}</Badge>
              {row.calling_title ? (
                <span className="ml-2 italic">{row.calling_title}</span>
              ) : null}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Expires in {expiresInDays} day{expiresInDays === 1 ? "" : "s"} ·{" "}
              {formatDate(row.expires_at, "short")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onResend}
              disabled={pending}
            >
              {pending ? "…" : "Extend"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onRevoke}
              disabled={pending}
              className="text-red-700 hover:bg-red-50"
            >
              Revoke
            </Button>
          </div>
        </div>
        {error ? (
          <p className="text-xs text-red-700">{error}</p>
        ) : null}
      </Card>
    </li>
  );
}
