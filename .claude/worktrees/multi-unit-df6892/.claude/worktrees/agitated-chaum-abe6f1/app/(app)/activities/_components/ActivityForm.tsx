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
import { ACTIVITY_CATEGORIES, type ActivityCategory } from "@/lib/validation/activity";
import { formatActivityCategory, toDateTimeLocalInput } from "@/lib/format";

export type ActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export type ActivityFormInitial = {
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  category: ActivityCategory;
};

type Props = {
  action: (formData: FormData) => Promise<ActionResult>;
  initial?: ActivityFormInitial;
  cancelHref: string;
  submitLabel?: string;
};

export function ActivityForm({
  action,
  initial,
  cancelHref,
  submitLabel = "Save activity",
}: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    const fd = new FormData(formRef.current!);
    startTransition(async () => {
      const result = await action(fd);
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
      }
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
        <div className="md:col-span-2 flex flex-col gap-1">
          <Label htmlFor="title">Title *</Label>
          <Input
            id="title"
            name="title"
            required
            defaultValue={initial?.title ?? ""}
            placeholder="Mid-week mutual"
          />
          {fieldError("title")}
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="category">Category *</Label>
          <select
            id="category"
            name="category"
            required
            defaultValue={initial?.category ?? "social"}
            className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
          >
            {ACTIVITY_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {formatActivityCategory(c)}
              </option>
            ))}
          </select>
          {fieldError("category")}
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="location">Location</Label>
          <Input
            id="location"
            name="location"
            defaultValue={initial?.location ?? ""}
            placeholder="Cultural hall, Maple Park, etc."
          />
          {fieldError("location")}
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="starts_at">Starts at *</Label>
          <Input
            id="starts_at"
            name="starts_at"
            type="datetime-local"
            required
            defaultValue={
              initial?.starts_at ? toDateTimeLocalInput(initial.starts_at) : ""
            }
          />
          {fieldError("starts_at")}
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="ends_at">Ends at</Label>
          <Input
            id="ends_at"
            name="ends_at"
            type="datetime-local"
            defaultValue={
              initial?.ends_at ? toDateTimeLocalInput(initial.ends_at) : ""
            }
          />
          {fieldError("ends_at")}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="description">Description</Label>
        <textarea
          id="description"
          name="description"
          rows={4}
          defaultValue={initial?.description ?? ""}
          placeholder="What's planned, anything attendees should bring, etc."
          className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
        />
        {fieldError("description")}
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
