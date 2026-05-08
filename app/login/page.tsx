// app/login/page.tsx

import { redirect } from "next/navigation";

import { getOptionalUser } from "@/lib/auth/guards";
import { signInWithGoogle, signInWithMagicLink } from "./actions";

function GoogleLogo() {
  return (
    <svg
      aria-hidden
      width="18"
      height="18"
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.614z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  );
}

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
          <div className="mt-8 space-y-4">
            <form action={signInWithGoogle}>
              <button
                type="submit"
                className="flex w-full items-center justify-center gap-3 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
              >
                <GoogleLogo />
                Continue with Google
              </button>
            </form>

            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-slate-200" />
              <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                or
              </span>
              <span className="h-px flex-1 bg-slate-200" />
            </div>

            <form action={signInWithMagicLink} className="space-y-4">
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
            </form>

            {errorMessage ? (
              <p className="text-sm text-red-700">{errorMessage}</p>
            ) : null}
          </div>
        )}
      </div>
    </main>
  );
}
