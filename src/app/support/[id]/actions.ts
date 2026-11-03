"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSupport, userMessage } from "@/lib/auth";
import { parseEuroInput } from "@/lib/domain/money";
import { processMoney } from "@/lib/money";
import type { ActionState } from "@/lib/types";

const schema = z.object({
  decision: z.enum(["release_to_seller", "refund_full", "refund_partial", "refund_after_return"], { message: "Kies een besluit." }),
  refund: z.string().optional(),
  motivation: z.string().trim().min(30, "Schrijf een motivatie van minstens 30 tekens. De partijen lezen deze tekst."),
  rule: z.string().trim().min(1, "Kies de regel waarop het besluit is gebaseerd."),
});

export async function decide(disputeId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const parsed = schema.safeParse({
    decision: form.get("decision"), refund: form.get("refund") ?? undefined,
    motivation: form.get("motivation"), rule: form.get("rule"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const refundCents = parsed.data.decision === "refund_partial" ? parseEuroInput(parsed.data.refund ?? "") : null;
  if (parsed.data.decision === "refund_partial" && !refundCents) return { error: "Vul het bedrag van de gedeeltelijke terugbetaling in." };

  const { supabase } = await requireSupport();
  const { error } = await supabase.rpc("decide_dispute", {
    p_dispute: disputeId, p_decision: parsed.data.decision, p_refund_cents: refundCents,
    p_motivation: parsed.data.motivation, p_rule: parsed.data.rule,
  });
  if (error) return { error: userMessage(error) };
  await processMoney(5).catch(() => undefined); // alleen relevant als het een beroep was
  revalidatePath("/support");
  redirect(`/geschil/${disputeId}`);
}
