import type Stripe from "stripe";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cryptoProvider, stripe } from "@/lib/stripe";
import { env } from "@/lib/env";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Geen handtekening" }, { status: 400 });

  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = await stripe().webhooks.constructEventAsync(body, signature, env.stripeWebhookSecret(), undefined, cryptoProvider);
  } catch {
    return NextResponse.json({ error: "Ongeldige handtekening" }, { status: 400 });
  }

  const db = createAdminClient();

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object;
        if (session.payment_status !== "paid") break; // bv. bankoverschrijving: wacht op async_payment_succeeded
        const orderId = session.metadata?.order_id;
        const piId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
        if (!orderId || !piId) break;
        const pi = await stripe().paymentIntents.retrieve(piId);
        const chargeId = typeof pi.latest_charge === "string" ? pi.latest_charge : pi.latest_charge?.id ?? null;
        const { error } = await db.rpc("mark_order_paid", { p_order: orderId, p_payment_intent: piId, p_charge: chargeId });
        if (error) throw new Error(error.message);
        break;
      }
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed": {
        const orderId = event.data.object.metadata?.order_id;
        if (orderId) {
          const { error } = await db.rpc("expire_order", { p_order: orderId });
          if (error) throw new Error(error.message);
        }
        break;
      }
      case "account.updated": {
        const account = event.data.object;
        const enabled = Boolean(account.details_submitted && account.payouts_enabled && account.capabilities?.transfers === "active");
        const { error } = await db.from("profiles").update({ payouts_enabled: enabled }).eq("stripe_account_id", account.id);
        if (error) throw new Error(error.message);
        break;
      }
      default:
        break;
    }
  } catch (err) {
    // 500 laat Stripe het later opnieuw proberen. Onze functies zijn idempotent.
    console.error("stripe webhook", event.type, (err as Error).message);
    return NextResponse.json({ error: "Verwerken mislukt" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
