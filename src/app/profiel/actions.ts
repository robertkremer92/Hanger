"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSession, userMessage } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";
import { env } from "@/lib/env";
import type { ActionState } from "@/lib/types";

const profileSchema = z.object({
  display_name: z.string().trim().min(2, "Je naam moet minstens 2 tekens zijn.").max(40),
  city: z.string().trim().max(60),
});

export async function updateProfile(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = profileSchema.safeParse({ display_name: form.get("display_name"), city: form.get("city") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { supabase, user } = await requireSession("/profiel");
  const { error } = await supabase.from("profiles").update(parsed.data).eq("id", user.id);
  if (error) return { error: userMessage(error) };
  revalidatePath("/profiel");
  return { ok: "Opgeslagen." };
}

/** Start of hervat de identiteitscheck bij Stripe (Express-account voor uitbetalingen). */
export async function startOnboarding(_: ActionState): Promise<ActionState> {
  const { user, profile } = await requireSession("/profiel");
  const site = env.siteUrl();
  let accountId = profile.stripe_account_id;
  let url: string;
  try {
    if (!accountId) {
      const account = await stripe().accounts.create(
        {
          type: "express",
          country: "NL",
          email: user.email ?? undefined,
          business_type: "individual",
          capabilities: { transfers: { requested: true } },
          business_profile: { product_description: "Verkoop van eigen tweedehands kleding via Hanger" },
          metadata: { user_id: user.id },
        },
        { idempotencyKey: `account-${user.id}` },
      );
      accountId = account.id;
      const { error } = await createAdminClient().from("profiles").update({ stripe_account_id: accountId }).eq("id", user.id);
      if (error) throw new Error(error.message);
    }
    const link = await stripe().accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      refresh_url: `${site}/profiel?stripe=opnieuw`,
      return_url: `${site}/api/stripe/return`,
    });
    url = link.url;
  } catch (err) {
    console.error("onboarding", (err as Error).message);
    return { error: "De identiteitscheck kon niet starten. Probeer het over een paar minuten opnieuw." };
  }
  redirect(url);
}

export async function openStripeDashboard(_: ActionState): Promise<ActionState> {
  const { profile } = await requireSession("/profiel");
  if (!profile.stripe_account_id) return { error: "Je hebt nog geen uitbetaalaccount." };
  let url: string;
  try {
    url = (await stripe().accounts.createLoginLink(profile.stripe_account_id)).url;
  } catch {
    return { error: "Het Stripe-overzicht kon niet openen. Rond eerst de identiteitscheck af." };
  }
  redirect(url);
}
