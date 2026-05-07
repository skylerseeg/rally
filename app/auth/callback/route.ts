// app/auth/callback/route.ts

import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { log } from "@/lib/log";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=auth", request.url));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    log.warn({ event: "auth_code_exchange_failed", reason: error.message });
    return NextResponse.redirect(new URL("/login?error=auth", request.url));
  }

  // Materialise any pending invitations for this user's email. Idempotent
  // and non-fatal: a failure here still lets the user in; the no-access
  // page is the fallback.
  const { error: rpcError } = await supabase.rpc("accept_pending_invitations");
  if (rpcError) {
    log.error({
      event: "accept_pending_invitations_failed",
      where: "auth_callback",
      reason: rpcError.message,
    });
  }

  return NextResponse.redirect(new URL("/", request.url));
}
