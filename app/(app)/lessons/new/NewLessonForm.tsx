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

import { createLesson, type CreateResult } from "./actions";

const QUORUM_OPTIONS = [
  { value: "deacons", label: "Deacons" },
  { value: "teachers", label: "Teachers" },
  { value: "priests", label: "Priests" },
  { value: "yw_12_13", label: "YW 12–13" },
  { value: "yw_14_15", label: "YW 14–15" },
  { value: "yw_16_17", label: "YW 16–17" },
  { value: "sunday_school", label: "Sunday School" },
] as const;

export type NewLessonInitial = {
  title: string;
  manual: string;
  manual_reference: string;
  taught_on: string;
  quorum_class: (typeof QUORUM_OPTIONS)[number]["value"];
  outline_json: string;
  source_suggestion_id: string | null;
};

type Props = {
  initial: NewLessonInitial;
};

export function NewLessonForm({ initial }: Props) {
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
      const result: CreateResult = await createLesson(fd);
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
      {initial.source_suggestion_id ? (
        <input
          type="hidden"
          name="source_suggestion_id"
          value={initial.source_suggestion_id}
        />
      ) : null}
      <input type="hidden" name="outline_json" value={initial.outline_json} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="md:col-span-2 flex flex-col gap-1">
          <Label htmlFor="title">Title *</Label>
          <Input
            id="title"
            name="title"
            required
            defaultValue={initial.title}
            placeholder="e.g. Looking Beyond the Mark"
          />
          {fieldError("title")}
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="manual_reference">Manual reference *</Label>
          <Input
            id="manual_reference"
            name="manual_reference"
            required
            defaultValue={initial.manual_reference}
            placeholder="e.g. Jacob 4:14"
          />
          {fieldError("manual_reference")}
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="manual">Manual *</Label>
          <Input
            id="manual"
            name="manual"
            required
            defaultValue={initial.manual}
            placeholder={`come_follow_me_${new Date().getFullYear()}`}
          />
          {fieldError("manual")}
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="taught_on">Taught on *</Label>
          <Input
            id="taught_on"
            name="taught_on"
            type="date"
            required
            defaultValue={initial.taught_on}
          />
          {fieldError("taught_on")}
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="quorum_class">Quorum / class *</Label>
          <select
            id="quorum_class"
            name="quorum_class"
            required
            defaultValue={initial.quorum_class}
            className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
          >
            {QUORUM_OPTIONS.map((q) => (
              <option key={q.value} value={q.value}>
                {q.label}
              </option>
            ))}
          </select>
          {fieldError("quorum_class")}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="notes_extra">Notes</Label>
        <textarea
          id="notes_extra"
          name="notes_extra"
          rows={3}
          placeholder="Additional context — what to remember, what the class responded well to, etc."
          className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
        />
        {fieldError("notes_extra")}
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save lesson"}
        </Button>
        <Link
          href="/lessons"
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
