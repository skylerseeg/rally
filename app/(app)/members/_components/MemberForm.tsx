"use client";

import Link from "next/link";
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
import type { ParentContact } from "@/lib/validation/member";
import { ParentContactsEditor } from "./ParentContactsEditor";

export type ActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export type MemberFormInitial = {
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  birthdate: string;
  parent_contacts: ParentContact[];
  notes: { general?: string } | null;
};

type Props = {
  action: (formData: FormData) => Promise<ActionResult>;
  initial?: MemberFormInitial;
  cancelHref: string;
  submitLabel?: string;
};

export function MemberForm({
  action,
  initial,
  cancelHref,
  submitLabel = "Save member",
}: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [parentContacts, setParentContacts] = useState<ParentContact[]>(
    initial?.parent_contacts ?? [],
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    const fd = new FormData(formRef.current!);
    fd.set("parent_contacts_json", JSON.stringify(parentContacts));
    startTransition(async () => {
      const result = await action(fd);
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
      }
      // Success path → server action redirects, this branch never runs.
    });
  }

  function fieldError(name: string): ReactNode {
    const msgs = fieldErrors[name];
    if (!msgs || msgs.length === 0) return null;
    return <p className="text-xs text-red-700">{msgs[0]}</p>;
  }

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      className="flex flex-col gap-6"
      noValidate
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="first_name">First name *</Label>
          <Input
            id="first_name"
            name="first_name"
            required
            defaultValue={initial?.first_name ?? ""}
            autoComplete="given-name"
          />
          {fieldError("first_name")}
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="last_name">Last name *</Label>
          <Input
            id="last_name"
            name="last_name"
            required
            defaultValue={initial?.last_name ?? ""}
            autoComplete="family-name"
          />
          {fieldError("last_name")}
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="preferred_name">Preferred name</Label>
          <Input
            id="preferred_name"
            name="preferred_name"
            defaultValue={initial?.preferred_name ?? ""}
            placeholder="How they like to be addressed"
          />
          {fieldError("preferred_name")}
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="birthdate">Birthdate *</Label>
          <Input
            id="birthdate"
            name="birthdate"
            type="date"
            required
            defaultValue={initial?.birthdate ?? ""}
          />
          {fieldError("birthdate")}
        </div>
      </div>

      <ParentContactsEditor
        value={parentContacts}
        onChange={setParentContacts}
      />
      {fieldError("parent_contacts")}

      <div className="flex flex-col gap-1">
        <Label htmlFor="notes_general">Notes</Label>
        <textarea
          id="notes_general"
          name="notes_general"
          rows={5}
          defaultValue={initial?.notes?.general ?? ""}
          placeholder="Context for leaders. Avoid sensitive details that don't need to be stored."
          className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
        />
        <p className="text-xs text-slate-500">
          Notes are dropped before any AI call unless an agent explicitly opts in.
        </p>
        {fieldError("notes_general")}
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Link
          href={cancelHref}
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
