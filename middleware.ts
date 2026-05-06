// middleware.ts
//
// Refreshes the Supabase session cookie on every page request.
// Excludes static assets and /api/* (API routes handle their own auth).

import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Match all paths except:
    //   /_next/static, /_next/image  (build assets)
    //   /favicon.ico                  (browser quirk)
    //   /api/*                        (route handlers self-auth)
    //   any path with a file extension (public/, images, etc.)
    "/((?!_next/static|_next/image|favicon\\.ico|api/|.*\\.[^/]*$).*)",
  ],
};
