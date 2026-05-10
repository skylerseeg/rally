// lib/supabase/admin.ts
//
// Service-role client. Only importable from workers/ or files under
// app/api/admin/. Never import from app/ (other than app/api/admin/) or
// from components/. This client bypasses RLS — treat every call site as
// a privileged operation.
//
// Per CLAUDE.md the import-source rule: only this file, lib/supabase/
// server.ts, and lib/supabase/client.ts may import from
// @supabase/supabase-js or @supabase/ssr. ESLint enforcement is a
// follow-up; for v1 this is a documented convention.

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/supabase/types";

export function createAdminClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "createAdminClient: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.",
    );
  }

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
