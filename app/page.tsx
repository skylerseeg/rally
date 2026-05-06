// app/page.tsx
//
// Placeholder dashboard. Behind requireLeader(); replaced by the real
// dashboard in a later prompt.

import { requireLeader } from "@/lib/auth/guards";
import { getAccessibleUnits, getActiveUnit } from "@/lib/auth/units";

export default async function HomePage() {
  const { user } = await requireLeader();
  const accessible = await getAccessibleUnits();
  const active = await getActiveUnit();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-col gap-1 border-b border-slate-200 pb-4">
        <p className="text-xs font-medium uppercase tracking-widest text-slate-500">
          Rally
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          {active.unit.name}
        </h1>
        <p className="text-sm text-slate-600">
          Signed in as <span className="font-medium">{user.email}</span>
        </p>
      </header>

      <section className="flex flex-col gap-2">
        <p className="text-sm text-slate-700">
          You have access to {accessible.length} unit
          {accessible.length === 1 ? "" : "s"}:
        </p>
        <ul className="space-y-1 text-sm text-slate-800">
          {accessible.map(({ unit, role, calling_title }) => (
            <li
              key={unit.id}
              className="rounded-md border border-slate-200 bg-white px-3 py-2"
            >
              <span className="font-medium">{unit.name}</span>
              <span className="text-slate-500"> — {role}</span>
              {calling_title ? (
                <span className="text-slate-500"> · {calling_title}</span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <form action="/sign-out" method="post" className="mt-2">
        <button
          type="submit"
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
        >
          Sign out
        </button>
      </form>
    </main>
  );
}
