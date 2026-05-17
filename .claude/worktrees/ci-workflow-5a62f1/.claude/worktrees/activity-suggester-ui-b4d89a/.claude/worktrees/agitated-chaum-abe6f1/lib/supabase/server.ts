// lib/supabase/server.ts
//
// Cookies-aware Supabase client for server components, server actions,
// and route handlers. RLS-respecting (uses the user's session).
//
// Per CLAUDE.md, this is one of exactly TWO files allowed to import
// from @supabase/ssr or @supabase/supabase-js. The other is
// lib/supabase/client.ts (browser). Service-role usage lives in
// lib/supabase/admin.ts.

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import type { Database } from "@/supabase/types";

// Re-export so the rest of the app imports auth types from here rather
// than from @supabase/supabase-js directly. Keeps the import-source
// rule clean.
export type { User };

export async function createClient(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options as CookieOptions);
            }
          } catch {
            // setAll throws when called from a Server Component (cookies
            // are read-only there). Middleware already refreshes the
            // session cookie on every request, so this is safe to ignore.
          }
        },
      },
    },
  );
}
