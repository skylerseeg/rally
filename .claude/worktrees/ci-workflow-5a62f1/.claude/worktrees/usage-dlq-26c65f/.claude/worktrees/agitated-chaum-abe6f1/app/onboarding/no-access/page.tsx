// app/onboarding/no-access/page.tsx

import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/guards";
import { log } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";

export default async function NoAccessPage() {
  const user = await requireUser();
  const supabase = await createClient();

  // Pull pending invitations for this user's email. The RPC is
  // idempotent — safe to call on every render of this page. Handles
  // the case where a leader was invited *after* their first failed
  // sign-in: they reload, memberships materialise, and we redirect.
  const { error: rpcError } = await supabase.rpc("accept_pending_invitations");
  if (rpcError) {
    log.error({
      event: "accept_pending_invitations_failed",
      where: "no_access_page",
      reason: rpcError.message,
    });
  }

  // If the user actually has memberships, they shouldn't be here.
  const { data: memberships } = await supabase
    .from("unit_memberships")
    .select("id")
    .eq("user_id", user.id)
    .limit(1);

  if (memberships && memberships.length > 0) {
    redirect("/");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-16">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Rally
        </h1>
        <p className="mt-6 text-sm text-slate-700">
          You&rsquo;re signed in, but you haven&rsquo;t been assigned to a quorum
          or class yet.
        </p>
        <p className="mt-4 text-sm text-slate-700">
          Ask your YM/YW president, advisor, or bishop to invite you. Share
          this email so they can add you:
        </p>
        <p className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-900">
          {user.email}
        </p>

        <form action="/sign-out" method="post" className="mt-8">
          <button
            type="submit"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2"
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
