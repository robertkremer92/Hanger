"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getSession, userMessage } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";
import { env } from "@/lib/env";
import type { ActionState, Listing, Order } from "@/lib/types";

const schema = z.object({
  listingId: z.string().uuid(),
  shipping: z.enum(["postnl", "dhl", "pickup"], { message: "Kies hoe je het wilt ontvangen." }),
});

export async function startCheckout(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = schema.safeParse({ listingId: form.get("listingId"), shipping: form.get("shipping") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { listingId, shipping } = parsed.data;

  const session = await getSession();
  if (!session) redirect(`/login?next=/artikel/${listingId}`);
  const { supabase, user } = session;

  // De database controleert beschikbaarheid, reserveert en berekent het bedrag.
  const { data: order, error } = await supabase.rpc("create_order", { p_listing: listingId, p_shipping: shipping }).single<Order>();
  if (error || !order) return { error: userMessage(error) };

  const { data: listing } = await supabase.from("listings").select("title, brand").eq("id", listingId).single<Pick<Listing, "title" | "brand">>();
  const site = env.siteUrl();

  let url: string | null = null;
  try {
    const checkout = await stripe().checkout.sessions.create(
      {
        mode: "payment",
        locale: "nl",
        customer_email: user.email ?? undefined,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "eur",
              unit_amount: order.price_cents + order.fee_cents,
              product_data: {
                name: [listing?.brand, listing?.title].filter(Boolean).join(", ") || "Artikel",
                description: "Inclusief betaling, bescherming en support",
              },
            },
          },
          ...(order.shipping_cents > 0
            ? [{ quantity: 1, price_data: { currency: "eur", unit_amount: order.shipping_cents, product_data: { name: shipping === "dhl" ? "Verzending DHL" : "Verzending PostNL" } } }]
            : []),
        ],
        metadata: { order_id: order.id },
        payment_intent_data: { transfer_group: order.id, metadata: { order_id: order.id } },
        expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
        success_url: `${site}/orders/${order.id}?betaald=1`,
        cancel_url: `${site}/api/checkout/cancel?order=${order.id}`,
      },
      { idempotencyKey: `checkout-${order.id}` },
    );
    url = checkout.url;
    await createAdminClient().from("orders").update({ stripe_checkout_session_id: checkout.id }).eq("id", order.id);
  } catch (err) {
    console.error("checkout", (err as Error).message);
    await createAdminClient().rpc("expire_order", { p_order: order.id });
    return { error: "Afrekenen lukt nu niet. Het artikel is weer vrijgegeven. Probeer het over een paar minuten opnieuw." };
  }

  if (!url) return { error: "Afrekenen lukt nu niet. Probeer het opnieuw." };
  redirect(url);
}
