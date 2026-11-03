"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession, userMessage } from "@/lib/auth";
import { parseEuroInput } from "@/lib/domain/money";

const listingSchema = z.object({
  title: z.string().trim().min(3, "Geef je artikel een naam van minstens 3 tekens.").max(60, "Gebruik maximaal 60 tekens voor de naam."),
  brand: z.string().trim().max(40),
  size: z.string().trim().min(1, "Vul een maat in, of ‘One size’.").max(20),
  category: z.enum(["dames", "heren", "tassen", "schoenen", "vintage"], { message: "Kies een categorie." }),
  condition: z.enum(["nieuw_met_label", "zo_goed_als_nieuw", "goed", "gedragen"], { message: "Kies de staat." }),
  description: z.string().trim().max(2000, "Gebruik maximaal 2000 tekens."),
  price: z.string(),
  allowsFitReturns: z.boolean(),
  allowsPickup: z.boolean(),
  pickupCity: z.string().trim().max(60),
});

export type DraftResult = { error?: string; field?: string; id?: string };

/** Stap 1: concept aanmaken. Foto's worden daarna vanuit de browser geüpload. */
export async function createDraft(input: Record<string, unknown>): Promise<DraftResult> {
  const parsed = listingSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: issue?.message, field: String(issue?.path[0] ?? "") };
  }
  const v = parsed.data;
  const cents = parseEuroInput(v.price);
  if (cents === null || cents < 100) return { error: "Vul een prijs in van minstens € 1.", field: "price" };
  if (cents > 1_000_000) return { error: "De prijs kan maximaal € 10.000 zijn.", field: "price" };
  if (v.allowsPickup && !v.pickupCity) return { error: "Vul de plaats in waar het opgehaald kan worden.", field: "pickupCity" };

  const { supabase, user, profile } = await requireSession("/verkopen");
  if (!profile.payouts_enabled) return { error: "Rond eerst de identiteitscheck af bij Profiel. Daarna kun je verkopen." };

  const { data, error } = await supabase
    .from("listings")
    .insert({
      seller_id: user.id, title: v.title, brand: v.brand, size: v.size, category: v.category, condition: v.condition,
      description: v.description, price_cents: cents, allows_fit_returns: v.allowsFitReturns,
      allows_pickup: v.allowsPickup, pickup_city: v.allowsPickup ? v.pickupCity : "",
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) return { error: userMessage(error) };
  return { id: data.id };
}

/** Stap 2: plaatsen. De database controleert foto's, merkregels en limieten. */
export async function publishDraft(id: string): Promise<{ error?: string }> {
  const { supabase } = await requireSession("/verkopen");
  const { error } = await supabase.rpc("publish_listing", { p_listing: id });
  if (error) return { error: userMessage(error) };
  revalidatePath("/");
  return {};
}

export async function removeListing(id: string): Promise<void> {
  const { supabase } = await requireSession("/verkopen/mijn");
  await supabase.rpc("remove_listing", { p_listing: id });
  revalidatePath("/verkopen/mijn");
  revalidatePath("/");
}
