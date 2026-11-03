"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession, userMessage } from "@/lib/auth";
import { processMoney } from "@/lib/money";
import type { ActionState } from "@/lib/types";

export async function markShipped(orderId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const { supabase } = await requireSession(`/orders/${orderId}`);
  const tracking = String(form.get("tracking") ?? "").trim().toUpperCase().replace(/\s+/g, "");
  const { error } = await supabase.rpc("mark_shipped", { p_order: orderId, p_tracking: tracking });
  if (error) return { error: userMessage(error) };
  revalidatePath(`/orders/${orderId}`);
  return { ok: "Gemarkeerd als verstuurd. De koper krijgt bericht." };
}

export async function confirmOrder(orderId: string, _: ActionState): Promise<ActionState> {
  const { supabase } = await requireSession(`/orders/${orderId}`);
  const { error } = await supabase.rpc("confirm_order", { p_order: orderId });
  if (error) return { error: userMessage(error) };
  // Direct uitbetalen; lukt dat nu niet, dan pakt de cron het op.
  await processMoney(5).catch(() => undefined);
  revalidatePath(`/orders/${orderId}`);
  return { ok: "Afgerond. Het geld gaat nu naar de verkoper." };
}

const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1, "Kies een score.").max(5),
  body: z.string().trim().max(1000),
});

export async function leaveReview(orderId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const parsed = reviewSchema.safeParse({ rating: form.get("rating") ?? 0, body: form.get("body") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { supabase } = await requireSession(`/orders/${orderId}`);
  const { error } = await supabase.rpc("leave_review", { p_order: orderId, p_rating: parsed.data.rating, p_body: parsed.data.body });
  if (error) return { error: userMessage(error) };
  revalidatePath(`/orders/${orderId}`);
  return { ok: "Bedankt. Je review is zichtbaar zodra de ander er ook een geeft, of na 14 dagen." };
}
