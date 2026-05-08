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

## Setting up Google OAuth (one-time)

The login page renders a "Continue with Google" button. The button works only after these three setups are done. Order matters: Google → Supabase → app config.

### 1. Google Cloud Console

1. Open <https://console.cloud.google.com/>. Create a new project (or pick an existing one) and select it.
2. **APIs & Services → OAuth consent screen.**
   - User type: **External** (unless you're on Google Workspace and limiting to your org — then **Internal**).
   - App name: `Rally`. User support email: yours. Developer contact: yours.
   - Scopes: leave at the defaults (the SDK requests `openid email profile`).
   - Test users: while the app is in "Testing" mode, only listed test users can sign in. Add the emails you'll be testing with. Or "Publish app" to allow any Google user — fine for v1.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID.**
   - Application type: **Web application**.
   - Name: `Rally web client`.
   - **Authorized redirect URIs** (add all):
     - `https://<your-supabase-project-ref>.supabase.co/auth/v1/callback` — find this URL in the Supabase dashboard under **Authentication → Providers → Google**.
     - `http://127.0.0.1:54321/auth/v1/callback` — only if you'll wire Google into the local Supabase stack (optional; magic-link Inbucket is usually enough for local).
   - Save. Copy the **Client ID** and **Client secret** — you'll need them next.

### 2. Supabase Dashboard

1. **Authentication → Providers → Google.**
2. Toggle **Enable Sign in with Google** on. Paste the Client ID and Client secret from Google. Save.
3. **Authentication → URL Configuration:**
   - **Site URL**: `https://<your-prod-domain>` (e.g. `https://rally-two-coral.vercel.app`).
   - **Redirect URLs** (add all):
     - `https://<your-prod-domain>/auth/callback`
     - `http://localhost:3000/auth/callback` (for local dev)
     - Any Vercel preview URLs you want to test against — Supabase supports glob, e.g. `https://rally-*.vercel.app/auth/callback`.

### 3. App config

Set `NEXT_PUBLIC_SITE_URL` in **Vercel → Settings → Environment Variables → Production** (and Preview, if you use previews) to your prod domain — e.g. `https://rally-two-coral.vercel.app`. The login action prefers this over the request `host` header so the OAuth redirect is stable behind any proxy or alias.

For local dev, you can set the same in `.env.local`:

```bash
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Without `NEXT_PUBLIC_SITE_URL`, the app falls back to `x-forwarded-host` / `host` headers, which works on most setups but is brittle behind unusual proxies.

### Verifying the flow

1. Hit `/login` → click **Continue with Google**.
2. Google's account chooser opens (we pass `prompt=select_account` so it always shows, even if there's only one signed-in Google account on the device).
3. After consent, Google redirects to `<your-domain>/auth/callback?code=...`.
4. The callback exchanges the code for a session (same handler that magic link uses), runs `accept_pending_invitations()`, and redirects to `/`.
5. Verify in the Supabase dashboard: **Authentication → Users** should show the new user with `Provider: google`.

### Common failure modes

- **"redirect_uri_mismatch"** from Google: the URI you set in Google Cloud's Authorized redirect URIs doesn't match the one Supabase is using. The Google Cloud entry needs the **Supabase callback URL**, not your app's `/auth/callback`. Supabase shows the exact URL on its provider page.
- **Lands on `/login?error=auth`**: code exchange failed. Check Supabase **Logs → Auth** for the underlying error.
- **Lands on `/onboarding/no-access`**: signed in successfully but no `unit_memberships` row exists. Either insert one manually or invite the email via `/presidency/invitations` first — the invitations RPC runs on every callback and will materialise the membership when the user signs back in.
