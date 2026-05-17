"use client";

import { useRouter, useSearchParams } from "next/navigation";

type Props = {
  showInactive: boolean;
};

export function InactiveToggle({ showInactive }: Props) {
  const router = useRouter();
  const sp = useSearchParams();

  function toggle(next: boolean) {
    const params = new URLSearchParams(sp?.toString() ?? "");
    if (next) params.set("inactive", "1");
    else params.delete("inactive");
    const qs = params.toString();
    router.push(qs ? `?${qs}` : "?");
  }

  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        checked={showInactive}
        onChange={(e) => toggle(e.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
      />
      Show inactive
    </label>
  );
}
