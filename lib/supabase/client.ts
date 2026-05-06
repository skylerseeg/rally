// lib/supabase/client.ts
//
// Browser Supabase client. Use from "use client" components.
//
// Per CLAUDE.md, this is one of exactly TWO files allowed to import
// from @supabase/ssr or @supabase/supabase-js.

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/supabase/types";

export function createClient(): SupabaseClient<Database> {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
