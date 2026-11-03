import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";

/** Koper breekt het afrekenen af: sessie direct laten verlopen, zodat het artikel vrijkomt. */
export async function GET(request: NextRequest) {
  const orderId = request.nextUrl.searchParams.get("order");
  const supabase = await createClient();
  const { data: order } = await supabase
    .from("orders")
    .select("id, listing_id, status, stripe_checkout_session_id")
    .eq("id", orderId ?? "")
    .maybeSingle();

  if (order?.status === "pending_payment" && order.stripe_checkout_session_id) {
    try {
      await stripe().checkout.sessions.expire(order.stripe_checkout_session_id);
    } catch {
      // Al verlopen of betaald: de webhook regelt de rest.
    }
  }
  const target = order ? `/artikel/${order.listing_id}` : "/";
  return NextResponse.redirect(new URL(target, request.url));
}
