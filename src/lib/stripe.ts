import "server-only";
import Stripe from "stripe";
import { env } from "@/lib/env";

let client: Stripe | null = null;

/** Stripe via fetch, zodat het ook op Cloudflare Workers werkt. */
export function stripe(): Stripe {
  client ??= new Stripe(env.stripeSecret(), {
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 2,
  });
  return client;
}

export const cryptoProvider = Stripe.createSubtleCryptoProvider();
