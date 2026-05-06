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

export async function signInWithMagicLink(formData: FormData): Promise<void> {
  const raw = { email: formData.get("email") };
  const parsed = SignInSchema.safeParse(raw);
  if (!parsed.success) {
    redirect(`/login?error=${encodeURIComponent("Enter a valid email address.")}`);
  }
  const { email } = parsed.data;

  const h = await headers();
  const origin = buildOrigin(
    h.get("x-forwarded-host") ?? h.get("host"),
    h.get("x-forwarded-proto"),
  );

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
