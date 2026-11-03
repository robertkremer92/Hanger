"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import type { ActionState } from "@/lib/types";

const schema = z.object({
  email: z.string().trim().email("Vul een geldig e-mailadres in."),
  next: z.string().optional(),
});

export async function sendLoginLink(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = schema.safeParse({ email: form.get("email"), next: form.get("next") ?? undefined });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const next = parsed.data.next?.startsWith("/") && !parsed.data.next.startsWith("//") ? parsed.data.next : "/";
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { emailRedirectTo: `${env.siteUrl()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error) {
    return { error: error.status === 429 ? "Te veel pogingen. Wacht een minuut en probeer het opnieuw." : "De inloglink kon niet worden verstuurd. Probeer het opnieuw." };
  }
  return { ok: `We hebben een inloglink gestuurd naar ${parsed.data.email}. Open hem op dit apparaat.` };
}
