"use server";

import { z } from "zod";
import { requireSession, userMessage } from "@/lib/auth";
import { checkMessage } from "@/lib/domain/rules";
import type { Message } from "@/lib/types";

const schema = z.object({
  listingId: z.string().uuid(),
  buyerId: z.string().uuid(),
  body: z.string().trim().min(1, "Schrijf een bericht.").max(1000, "Een bericht is maximaal 1000 tekens."),
});

export async function sendMessage(input: { listingId: string; buyerId: string; body: string }): Promise<{ error?: string; message?: Message }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const check = checkMessage(parsed.data.body);
  if (check.kind === "blocked") return { error: check.reason };
  const { supabase, user } = await requireSession(`/berichten/${parsed.data.listingId}/${parsed.data.buyerId}`);
  const { data, error } = await supabase
    .from("messages")
    .insert({ listing_id: parsed.data.listingId, buyer_id: parsed.data.buyerId, sender_id: user.id, body: parsed.data.body })
    .select("*")
    .single<Message>();
  if (error || !data) return { error: userMessage(error) };
  return { message: data };
}
