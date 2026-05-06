# Auth & Environment

## Auth flow

1. Leader visits a protected route. Middleware (`middleware.ts`) checks the Supabase session cookie and refreshes it.
2. Unauthenticated → redirect to `/login`. The login page offers two providers for v1: email magic link and Google OAuth.
3. After successful sign-in, Supabase sets the session cookie. Server components read the user via `createServerClient` from `lib/supabase/server.ts`.
4. `requireLeader()` in `lib/auth/guards.ts` returns the authenticated user + their `unit_memberships`. It throws if the user has no memberships. The guard is provider-agnostic — only the login UI knows which providers exist.
5. `requireUnitAccess(unitId, role?)` enforces per-unit role requirements (`leader` < `presidency` < `admin`).

Church account SSO is post-v1. When it lands, it plugs in as an additional provider with no changes to the guards.

## Roles

| Role         | Can                                                                 |
|--------------|---------------------------------------------------------------------|
| `leader`     | Read members, create/edit activities and attendance, run agents     |
| `presidency` | All of leader + manage members, change quorum/class assignments, export data |
| `admin`      | Cross-unit access. Internal only. Not assignable from the UI.       |

Roles are stored on `unit_memberships.role`, per-unit. A user with a `presidency` role in unit A can still only have `leader` in unit B.

## Environment variables

See `.env.example` for the canonical list. Quick map:

| Var                              | Where used              | Notes                                     |
|----------------------------------|-------------------------|-------------------------------------------|
| `NEXT_PUBLIC_SUPABASE_URL`       | client + server         | Public                                    |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`  | client + server         | Public, RLS-bounded                       |
| `SUPABASE_SERVICE_ROLE_KEY`      | `workers/`, admin only  | Bypasses RLS — never import from `app/`   |
| `ANTHROPIC_API_KEY`              | `agents/`, `workers/`   | Server only                               |
| `RALLY_ENCRYPTION_KEY`           | `lib/crypto.ts`         | App-level encryption for at-rest secrets  |
| `RALLY_USAGE_HASH_SALT`          | `lib/anthropic/withUsage.ts` | Salt for the SHA-256 user hash       |

Local development uses the Supabase CLI defaults from `supabase start`. Hosted env vars live in the deployment platform; never commit a `.env` file.
