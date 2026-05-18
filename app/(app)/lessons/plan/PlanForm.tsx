"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";

import {
  generatePlan,
  useThisPlan,
  type GenerateOk,
  type GenerateResult,
} from "./actions";

type Props = {
  defaultDate: string;
  deepEnabled: boolean;
};

export function PlanForm({ defaultDate, deepEnabled }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [mode, setMode] = useState<"standard" | "deep">("standard");

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(formRef.current!);
    const manual_reference = String(fd.get("manual_reference") ?? "").trim();
    const lesson_date = String(fd.get("lesson_date") ?? "");
    const teacher_context = String(fd.get("teacher_context") ?? "").trim();

    setResult(null);
    startTransition(async () => {
      const r = await generatePlan({
        manual_reference,
        lesson_date,
        mode,
        teacher_context: teacher_context || undefined,
      });
      setResult(r);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <form
          ref={formRef}
          onSubmit={onSubmit}
          className="flex flex-col gap-4"
          noValidate
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2 flex flex-col gap-1">
              <Label htmlFor="manual_reference">Manual reference *</Label>
              <Input
                id="manual_reference"
                name="manual_reference"
                required
                placeholder="e.g. D&C 76:50–70 or Mosiah 4"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="lesson_date">Lesson date *</Label>
              <Input
                id="lesson_date"
                name="lesson_date"
                type="date"
                required
                defaultValue={defaultDate}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="mode">Mode</Label>
              <div
                role="radiogroup"
                aria-label="Planning mode"
                className="flex h-9 items-stretch rounded-md border border-slate-300 bg-white text-sm"
              >
                <ModeChip
                  active={mode === "standard"}
                  onClick={() => setMode("standard")}
                  disabled={false}
                >
                  Standard
                </ModeChip>
                <ModeChip
                  active={mode === "deep"}
                  onClick={() => deepEnabled && setMode("deep")}
                  disabled={!deepEnabled}
                  title={
                    deepEnabled
                      ? "Use Opus for deeper doctrinal reasoning. Slower and more expensive."
                      : "Deep mode is in pilot — ask Skyler to enable for your unit."
                  }
                >
                  Deep
                </ModeChip>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="teacher_context">Teacher context (optional)</Label>
            <textarea
              id="teacher_context"
              name="teacher_context"
              rows={3}
              maxLength={800}
              placeholder="e.g. First time teaching, has been quiet in lessons, was sick last week."
              className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
            />
          </div>

          <div>
            <Button type="submit" disabled={pending}>
              {pending ? "Planning…" : "Generate plan"}
            </Button>
          </div>
        </form>
      </Card>

      <div className="mx-auto w-full max-w-[760px]">
        {pending ? <SkeletonPlan /> : null}
        {!pending && result ? (
          <ResultsArea
            result={result}
            onReset={() => {
              setResult(null);
              formRef.current?.reset();
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

function ModeChip({
  active,
  disabled,
  onClick,
  title,
  children,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={
        "flex flex-1 items-center justify-center px-3 text-sm font-medium first:rounded-l-md last:rounded-r-md " +
        (active
          ? "bg-slate-900 text-white"
          : disabled
            ? "cursor-not-allowed bg-slate-50 text-slate-400"
            : "bg-white text-slate-900 hover:bg-slate-50")
      }
    >
      {children}
    </button>
  );
}

function ResultsArea({
  result,
  onReset,
}: {
  result: GenerateResult;
  onReset: () => void;
}) {
  if (!result.ok) {
    return (
      <Card className="flex flex-col gap-3">
        <p className="text-sm text-red-800">{result.message}</p>
        <div>
          <Button variant="secondary" onClick={onReset}>
            Reset and try again
          </Button>
        </div>
      </Card>
    );
  }
  return <PlanCard result={result} />;
}

function PlanCard({ result }: { result: GenerateOk }) {
  const { plan } = result;
  return (
    <Card className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-semibold text-slate-900">{plan.title}</h2>
          <Badge variant={result.tier === "deep" ? "spiritual" : "neutral"}>
            {result.tier === "deep" ? "Opus" : "Sonnet"}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {plan.scripture_focus.map((s, i) => (
            <Badge key={i} variant="spiritual">
              {s}
            </Badge>
          ))}
          {plan.themes.map((t, i) => (
            <Badge key={`t${i}`} variant="neutral">
              {t}
            </Badge>
          ))}
        </div>
      </header>

      <section className="rounded-md border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          Opening question
        </p>
        <p className="mt-1 text-sm text-slate-900">{plan.opening_question}</p>
      </section>

      <ol className="flex flex-col gap-3">
        {plan.outline.map((section, i) => (
          <li
            key={i}
            className="flex flex-col gap-2 rounded-md border border-slate-200 bg-white p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-base font-semibold text-slate-900">
                {i + 1}. {section.section_title}
              </h3>
              <Badge variant="neutral">{section.duration_minutes} min</Badge>
            </div>
            <ul className="list-disc pl-5 text-sm text-slate-700">
              {section.discussion_questions.map((q, j) => (
                <li key={j}>{q}</li>
              ))}
            </ul>
            <p className="text-sm italic text-slate-600">
              {section.teaching_notes}
            </p>
            {section.scripture_or_quote ? (
              <p className="text-xs text-slate-500">
                Scripture / quote: {section.scripture_or_quote}
              </p>
            ) : null}
          </li>
        ))}
      </ol>

      <section className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          Closing invitation
        </p>
        <p className="text-sm text-slate-900">{plan.closing_invitation}</p>
      </section>

      <details className="rounded-md border border-slate-200 bg-slate-50 p-3">
        <summary className="cursor-pointer text-sm font-medium text-slate-700">
          Teacher prep notes
        </summary>
        <p className="mt-2 whitespace-pre-line text-sm text-slate-700">
          {plan.teacher_prep_notes}
        </p>
      </details>

      <p className="text-xs italic text-slate-500">
        Age adaptation — {plan.age_adaptation_notes}
      </p>

      <form action={useThisPlan}>
        <input
          type="hidden"
          name="suggestion_id"
          value={result.suggestion_id}
        />
        <input type="hidden" name="lesson_date" value={result.lesson_date} />
        <Button type="submit">Use this plan</Button>
      </form>
    </Card>
  );
}

function SkeletonPlan() {
  return (
    <Card className="flex flex-col gap-4">
      <div className="h-6 w-2/3 animate-pulse rounded bg-slate-200" />
      <div className="flex gap-2">
        <div className="h-5 w-20 animate-pulse rounded-full bg-slate-200" />
        <div className="h-5 w-24 animate-pulse rounded-full bg-slate-200" />
      </div>
      <div className="h-12 w-full animate-pulse rounded bg-slate-200" />
      <div className="h-32 w-full animate-pulse rounded bg-slate-200" />
      <div className="h-32 w-full animate-pulse rounded bg-slate-200" />
      <div className="h-32 w-full animate-pulse rounded bg-slate-200" />
    </Card>
  );
}
