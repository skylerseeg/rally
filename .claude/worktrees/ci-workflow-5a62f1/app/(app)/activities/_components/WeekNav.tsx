"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { formatWeekRange, isoSunday, startOfWeek } from "@/lib/format";

type Props = {
  weekStart: string; // ISO YYYY-MM-DD (Sunday)
};

function shiftWeek(weekStart: string, deltaDays: number): string {
  const [y, m, d] = weekStart.split("-").map((n) => parseInt(n, 10));
  const base = new Date(y!, (m! - 1), d!);
  base.setDate(base.getDate() + deltaDays);
  return isoSunday(base);
}

export function WeekNav({ weekStart }: Props) {
  const router = useRouter();
  const todayWeek = isoSunday(new Date());
  const isThisWeek = weekStart === todayWeek;

  const [y, m, d] = weekStart.split("-").map((n) => parseInt(n, 10));
  const startDate = startOfWeek(new Date(y!, (m! - 1), d!));
  const label = formatWeekRange(startDate);

  function go(target: string) {
    if (target === todayWeek) {
      router.push("/activities");
    } else {
      router.push(`/activities?week=${target}`);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => go(shiftWeek(weekStart, -7))}
        aria-label="Previous week"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </Button>
      <span className="min-w-[10rem] text-center text-sm font-medium text-slate-700">
        {label}
      </span>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => go(shiftWeek(weekStart, 7))}
        aria-label="Next week"
      >
        <ChevronRight className="h-4 w-4" aria-hidden />
      </Button>
      {!isThisWeek ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => go(todayWeek)}
        >
          This week
        </Button>
      ) : null}
    </div>
  );
}
