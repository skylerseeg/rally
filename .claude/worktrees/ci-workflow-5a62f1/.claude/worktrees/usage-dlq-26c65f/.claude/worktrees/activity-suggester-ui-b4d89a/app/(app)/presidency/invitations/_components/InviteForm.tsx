"use client";

import {
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import {
  INVITATION_ROLES,
  ROLE_LABEL,
  type InvitationRole,
} from "@/lib/validation/invitation";
import type { ActionResult } from "../actions";

type Props = {
  action: (formData: FormData) => Promise<ActionResult>;
  signInUrl: string;
};

type Sent = { email: string; role: InvitationRole };

export function InviteForm({ action, signInUrl }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [sent, setSent] = useState<Sent | null>(null);
  const [copied, setCopied] = useState(false);

  function fieldError(name: string): ReactNode {
    const msgs = fieldErrors[name];
    if (!msgs || msgs.length === 0) return null;
    return <p className="text-xs text-red-700">{msgs[0]}</p>;
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setCopied(false);
    const fd = new FormData(formRef.current!);
    const email = String(fd.get("email") ?? "").trim().toLowerCase();
    const role = String(fd.get("role") ?? "leader") as InvitationRole;

    startTransition(async () => {
      const result = await action(fd);
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      setSent({ email, role });
      formRef.current?.reset();
    });
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(signInUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="md:col-span-2 flex flex-col gap-1">
          <Label htmlFor="email">Email *</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="off"
            required
            placeholder="leader@example.com"
          />
          {fieldError("email")}
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="role">Role *</Label>
          <select
            id="role"
            name="role"
            required
            defaultValue="leader"
            className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
          >
            {INVITATION_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          {fieldError("role")}
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="calling_title">Calling title</Label>
          <Input
            id="calling_title"
            name="calling_title"
            placeholder="e.g. Deacons Quorum Adviser"
          />
          {fieldError("calling_title")}
        </div>
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {sent ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-medium">
            Invitation created for{" "}
            <span className="font-semibold">{sent.email}</span> ({ROLE_LABEL[sent.role]}).
          </p>
          <p className="mt-1 text-xs">
            They&rsquo;ll get access automatically on their next sign-in. Until
            email delivery ships, share this sign-in link with them:
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="block flex-1 truncate rounded bg-white px-2 py-1 text-xs">
              {signInUrl}
            </code>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={copyLink}
            >
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>
        </div>
      ) : null}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Inviting…" : "Send invitation"}
        </Button>
      </div>
    </form>
  );
}
