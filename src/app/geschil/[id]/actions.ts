"use server";

import { revalidatePath } from "next/cache";
import { requireSession, userMessage } from "@/lib/auth";
import { processMoney } from "@/lib/money";
import type { ActionState } from "@/lib/types";

async function run(disputeId: string, fn: string, args: Record<string, unknown>, ok: string, money = false): Promise<ActionState> {
  const { supabase } = await requireSession(`/geschil/${disputeId}`);
  const { error } = await supabase.rpc(fn, args);
  if (error) return { error: userMessage(error) };
  if (money) await processMoney(5).catch(() => undefined);
  revalidatePath(`/geschil/${disputeId}`);
  return { ok };
}

export async function respond(id: string, _: ActionState, form: FormData) {
  return run(id, "respond_dispute", { p_dispute: id, p_response: String(form.get("response") ?? "") }, "Je reactie staat in het dossier. Een medewerker beslist binnen 2 werkdagen.");
}

export async function acceptRefund(id: string, _: ActionState) {
  return run(id, "seller_accept_refund", { p_dispute: id }, "Opgelost. De koper krijgt alles terug.", true);
}

export async function appeal(id: string, _: ActionState, form: FormData) {
  return run(id, "appeal_dispute", { p_dispute: id, p_text: String(form.get("appeal") ?? "") }, "Beroep ingediend. Een andere medewerker beoordeelt het binnen 2 werkdagen.");
}

export async function submitReturn(id: string, _: ActionState, form: FormData) {
  const tracking = String(form.get("tracking") ?? "").trim().toUpperCase().replace(/\s+/g, "");
  return run(id, "submit_return", { p_dispute: id, p_tracking: tracking }, "Retour vastgelegd. Je krijgt je geld zodra de verkoper het heeft, uiterlijk 7 dagen na verzending.");
}

export async function confirmReturn(id: string, _: ActionState) {
  return run(id, "confirm_return", { p_dispute: id }, "Bevestigd. De koper krijgt het geld terug.", true);
}
