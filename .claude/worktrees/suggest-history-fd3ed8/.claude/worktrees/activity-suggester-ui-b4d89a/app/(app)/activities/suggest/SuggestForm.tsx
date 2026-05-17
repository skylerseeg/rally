"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";

import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { formatActivityCategory } from "@/lib/format";
import {
  ACTIVITY_CATEGORIES,
  type ActivityCategory,
} from "@/lib/validation/activity";

import {
  generateSuggestions,
  useThisSuggestion,
  type GenerateOk,
  type GenerateResult,
} from "./actions";

type Props = {
  defaultDate: string;
};

const CATEGORY_VARIANT: Record<ActivityCategory, BadgeVariant> = {
  spiritual: "spiritual",
  service: "service",
  social: "social",
  physical: "physical",
  skill: "skill",
};

export function SuggestForm({ defaultDate }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<GenerateResult | null>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(formRef.current!);
    const target_date = String(fd.get("target_date") ?? "");
    const categoryRaw = String(fd.get("category") ?? "any");
    const constraints = String(fd.get("constraints") ?? "");

    setResult(null);
    startTransition(async () => {
      const r = await generateSuggestions({
        target_date,
        category: categoryRaw === "any" ? "any" : (categoryRaw as ActivityCategory),
        constraints: constraints || undefined,
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
            <div className="flex flex-col gap-1">
              <Label htmlFor="target_date">Target date</Label>
              <Input
                id="target_date"
                name="target_date"
                type="date"
                required
                defaultValue={defaultDate}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="category">Category</Label>
              <select
                id="category"
                name="category"
                defaultValue="any"
                className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              >
                <option value="any">Any</option>
                {ACTIVITY_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {formatActivityCategory(c)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="constraints">Constraints</Label>
            <textarea
              id="constraints"
              name="constraints"
              rows={3}
              maxLength={500}
              placeholder="Budget under $20, indoor only, must include service component, etc."
              className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
            />
          </div>

          <div>
            <Button type="submit" disabled={pending}>
              {pending ? "Generating…" : "Generate suggestions"}
            </Button>
          </div>
        </form>
      </Card>

      <div className="mx-auto w-full max-w-[720px]">
        {pending ? <SkeletonResults /> : null}
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
  if (result.suggestions.length === 0) {
    return (
      <Card className="flex flex-col gap-3">
        <p className="text-sm text-slate-700">
          Claude couldn't generate suggestions for these constraints. Try
          widening them.
        </p>
        <div>
          <Button variant="secondary" onClick={onReset}>
            Reset
          </Button>
        </div>
      </Card>
    );
  }
  return (
    <ul className="flex flex-col gap-4">
      {result.suggestions.map((s, i) => (
        <li key={`${result.suggestion_id}:${i}`}>
          <SuggestionCard
            suggestionId={result.suggestion_id}
            index={i}
            targetDate={result.target_date}
            suggestion={s}
          />
        </li>
      ))}
    </ul>
  );
}

function SuggestionCard({
  suggestionId,
  index,
  targetDate,
  suggestion,
}: {
  suggestionId: string;
  index: number;
  targetDate: string;
  suggestion: GenerateOk["suggestions"][number];
}) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-900">
          {suggestion.title}
        </h3>
        <Badge variant={CATEGORY_VARIANT[suggestion.category]}>
          {formatActivityCategory(suggestion.category)}
        </Badge>
      </div>
      <p className="text-sm text-slate-700">{suggestion.description}</p>

      <p className="text-xs text-slate-500">
        ~{suggestion.duration_minutes} min · ~${suggestion.estimated_cost_usd}
      </p>

      {suggestion.supply_list.length > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            Supplies
          </p>
          <ul className="list-disc pl-5 text-sm text-slate-700">
            {suggestion.supply_list.map((it, j) => (
              <li key={j}>{it}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {suggestion.prep_checklist.length > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            Prep checklist
          </p>
          <ul className="list-disc pl-5 text-sm text-slate-700">
            {suggestion.prep_checklist.map((it, j) => (
              <li key={j}>{it}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {suggestion.faith_framing ? (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            Why this fits
          </p>
          <p className="text-sm italic text-slate-600">
            {suggestion.faith_framing}
          </p>
        </div>
      ) : null}

      <form action={useThisSuggestion}>
        <input type="hidden" name="suggestion_id" value={suggestionId} />
        <input type="hidden" name="index" value={index} />
        <input type="hidden" name="target_date" value={targetDate} />
        <Button type="submit">Use this</Button>
      </form>
    </Card>
  );
}

function SkeletonResults() {
  return (
    <ul className="flex flex-col gap-4">
      {[0, 1, 2].map((i) => (
        <li key={i}>
          <Card className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="h-5 w-2/3 animate-pulse rounded bg-slate-200" />
              <div className="h-5 w-16 animate-pulse rounded-full bg-slate-200" />
            </div>
            <div className="h-4 w-full animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-slate-200" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-slate-200" />
            <div className="h-9 w-24 animate-pulse rounded-md bg-slate-200" />
          </Card>
        </li>
      ))}
    </ul>
  );
}
