// lib/supabase/middleware.ts
//
// Session-cookie refresh, run from middleware.ts on every request.
// Pattern follows the @supabase/ssr Next.js guide: build a NextResponse,
// instantiate a server client wired to the request/response cookies,
// touch auth.getUser() to trigger the refresh, return the response.

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { Database } from "@/supabase/types";

export async function updateSession(
  request: NextRequest,
): Promise<NextResponse> {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options as CookieOptions);
          }
        },
      },
    },
  );

  // Touching getUser() forces the server client to refresh the session
  // cookie if needed. The result is intentionally ignored here.
  await supabase.auth.getUser();

  return response;
}
