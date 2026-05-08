// app/login/actions.ts
"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { log } from "@/lib/log";

const SignInSchema = z.object({
  email: z.email(),
});

function buildOrigin(host: string | null, proto: string | null): string {
  const safeHost = host ?? "localhost:3000";
  const safeProto = proto ?? (safeHost.startsWith("localhost") ? "http" : "https");
  return `${safeProto}://${safeHost}`;
}

async function callbackOrigin(): Promise<string> {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const h = await headers();
  return buildOrigin(
    h.get("x-forwarded-host") ?? h.get("host"),
    h.get("x-forwarded-proto"),
  );
}

export async function signInWithMagicLink(formData: FormData): Promise<void> {
  const raw = { email: formData.get("email") };
  const parsed = SignInSchema.safeParse(raw);
  if (!parsed.success) {
    redirect(`/login?error=${encodeURIComponent("Enter a valid email address.")}`);
  }
  const { email } = parsed.data;

  const origin = await callbackOrigin();

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) {
    log.warn({ event: "magic_link_send_failed", reason: error.message });
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/login?sent=true&email=${encodeURIComponent(email)}`);
}

export async function signInWithGoogle(): Promise<void> {
  const origin = await callbackOrigin();
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback`,
      // Force Google to show the account chooser. Avoids silent
      // re-auth into a wrong account when leaders share devices.
      queryParams: { prompt: "select_account" },
    },
  });

  if (error || !data?.url) {
    log.warn({
      event: "oauth_init_failed",
      provider: "google",
      reason: error?.message ?? "no_url_returned",
    });
    redirect(
      `/login?error=${encodeURIComponent(
        error?.message ?? "Could not start Google sign-in.",
      )}`,
    );
  }

  // Hand the browser off to Google's consent screen. Google will redirect
  // back to <origin>/auth/callback?code=... when done.
  redirect(data.url);
}
