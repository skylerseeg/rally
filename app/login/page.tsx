// app/login/page.tsx

import { redirect } from "next/navigation";

import { getOptionalUser } from "@/lib/auth/guards";
import { signInWithMagicLink } from "./actions";

type Props = {
  searchParams: Promise<{
    sent?: string;
    email?: string;
    error?: string;
  }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const user = await getOptionalUser();
  if (user) redirect("/");

  const params = await searchParams;
  const sent = params.sent === "true";
  const sentEmail = params.email ?? "";
  const errorMessage = params.error;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-16">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Rally
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Plan activities, track attendance, lead with intent.
        </p>

        {sent ? (
          <div className="mt-8 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            Check your email — we sent a sign-in link to{" "}
            <span className="font-medium">{sentEmail || "your address"}</span>.
          </div>
        ) : (
          <form action={signInWithMagicLink} className="mt-8 space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-slate-700"
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                placeholder="you@example.com"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
            >
              Send magic link
            </button>
            {errorMessage ? (
              <p className="text-sm text-red-700">{errorMessage}</p>
            ) : null}
          </form>
        )}
      </div>
    </main>
  );
}
