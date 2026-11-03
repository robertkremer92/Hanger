import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";

/** Terug van Stripe-onboarding: status direct bijwerken, niet op de webhook wachten. */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.profile.stripe_account_id) return NextResponse.redirect(new URL("/profiel", request.url));
  try {
    const account = await stripe().accounts.retrieve(session.profile.stripe_account_id);
    const enabled = Boolean(account.details_submitted && account.payouts_enabled && account.capabilities?.transfers === "active");
    await createAdminClient().from("profiles").update({ payouts_enabled: enabled }).eq("id", session.user.id);
    return NextResponse.redirect(new URL(`/profiel?stripe=${enabled ? "klaar" : "bezig"}`, request.url));
  } catch {
    return NextResponse.redirect(new URL("/profiel?stripe=bezig", request.url));
  }
}
