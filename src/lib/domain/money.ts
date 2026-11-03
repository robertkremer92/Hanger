// Bedragen zijn altijd hele centen (integers). Deze regels moeten gelijk blijven
// aan public.fee_cents en public.shipping_cents in de database; tests/parity.test.ts
// controleert dat.

export type ShippingMethod = "postnl" | "dhl" | "pickup";

/** Platformbijdrage: 6% + € 0,50, afgerond op hele centen (half naar boven). */
export function feeCents(priceCents: number): number {
  assertCents(priceCents);
  return Math.floor((priceCents * 6 + 50) / 100) + 50;
}

/** Wat de koper ziet op het prijskaartje: prijs + bijdrage, zonder verzending. */
export function allInCents(priceCents: number): number {
  return priceCents + feeCents(priceCents);
}

export const SHIPPING: Record<ShippingMethod, { label: string; detail: string; cents: number }> = {
  postnl: { label: "PostNL, naar een pakketpunt", detail: "Binnen 1–2 werkdagen", cents: 395 },
  dhl: { label: "DHL, aan de deur", detail: "Binnen 1–2 werkdagen", cents: 525 },
  pickup: { label: "Zelf ophalen", detail: "Jullie spreken af via berichten", cents: 0 },
};

export function shippingCents(method: ShippingMethod): number {
  return SHIPPING[method].cents;
}

const eur = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });

export function formatEuro(cents: number): string {
  return eur.format(cents / 100);
}

/** "12,50", "12.5", "€ 12" -> 1250. Geeft null bij ongeldige invoer. */
export function parseEuroInput(input: string): number | null {
  const cleaned = input.replace(/[€\s]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

function assertCents(n: number) {
  if (!Number.isInteger(n) || n < 0) throw new Error(`Ongeldig bedrag in centen: ${n}`);
}
