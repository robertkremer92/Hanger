import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

/** Huidige gebruiker en profiel, of null. Eén keer per request opgehaald. */
export const getSession = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single<Profile>();
  if (!profile) return null;
  return { user, profile, supabase };
});

export async function requireSession(next = "/") {
  const s = await getSession();
  if (!s) redirect(`/login?next=${encodeURIComponent(next)}`);
  return s;
}

export async function requireSupport() {
  const s = await requireSession("/support");
  if (!s.profile.is_support) redirect("/");
  return s;
}

/** Postgres-fouten uit onze functies zijn al in gewone taal geschreven. */
export function userMessage(error: { message?: string; code?: string } | null | undefined): string {
  if (!error) return "Er ging iets mis. Probeer het opnieuw.";
  if (error.code === "P0001" && error.message) return error.message;
  if (error.message?.includes("row-level security")) return "Dat mag je niet doen.";
  return "Er ging iets mis. Probeer het opnieuw.";
}
