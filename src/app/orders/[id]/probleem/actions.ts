"use server";

import { z } from "zod";
import { requireSession, userMessage } from "@/lib/auth";

const schema = z.object({
  orderId: z.string().uuid(),
  reason: z.enum(["not_received", "damaged", "not_as_described", "counterfeit", "wrong_item", "fit"], { message: "Kies wat er mis is." }),
  description: z.string().trim().min(20, "Beschrijf het probleem in minstens 20 tekens.").max(3000),
});

export async function openDispute(input: { orderId: string; reason: string; description: string }): Promise<{ id?: string; error?: string; field?: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return { error: i?.message, field: String(i?.path[0] ?? "") };
  }
  const { supabase } = await requireSession(`/orders/${parsed.data.orderId}`);
  const { data, error } = await supabase
    .rpc("open_dispute", { p_order: parsed.data.orderId, p_reason: parsed.data.reason, p_description: parsed.data.description })
    .single<{ id: string }>();
  if (error || !data) return { error: userMessage(error) };
  return { id: data.id };
}
