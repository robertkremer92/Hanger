// Zet een order om in wat de gebruiker ziet: een statuslabel en een tijdlijn.
// Puur en zonder afhankelijkheden, zodat het getest kan worden.

export type OrderStatus =
  | "pending_payment" | "expired" | "paid" | "shipped" | "completed"
  | "cancelled" | "disputed" | "return_pending" | "refunded";

export type Role = "buyer" | "seller";

export interface OrderLike {
  status: OrderStatus;
  shipping_method: "postnl" | "dhl" | "pickup";
  total_cents: number;
  price_cents: number;
  tracking_code: string | null;
  carrier_weight_grams: number | null;
  paid_at: string | null;
  ship_by: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  inspect_until: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
}

export type Tone = "good" | "warn" | "bad" | "neutral";

export function statusLabel(o: Pick<OrderLike, "status">, role: Role): { text: string; tone: Tone } {
  switch (o.status) {
    case "pending_payment": return { text: "Wacht op betaling", tone: "neutral" };
    case "expired": return { text: "Niet betaald", tone: "neutral" };
    case "paid": return role === "seller" ? { text: "Nog versturen", tone: "warn" } : { text: "Wacht op verzending", tone: "neutral" };
    case "shipped": return role === "buyer" ? { text: "Onderweg of controleren", tone: "warn" } : { text: "Verstuurd", tone: "neutral" };
    case "completed": return { text: "Afgerond", tone: "good" };
    case "cancelled": return { text: "Geannuleerd, terugbetaald", tone: "neutral" };
    case "disputed": return { text: "Geschil loopt", tone: "bad" };
    case "return_pending": return { text: "Retour", tone: "warn" };
    case "refunded": return { text: "Terugbetaald", tone: "neutral" };
  }
}

export interface TimelineStep {
  title: string;
  state: "done" | "now" | "todo";
  detail?: string;
  at?: string;
}

export function formatGrams(g: number): string {
  return `${(g / 1000).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;
}

/** Tijdlijn voor de normale route: betaald, verstuurd, bezorgd, afgerond. */
export function buildTimeline(o: OrderLike, role: Role, fmt: (iso: string) => string, euro: (c: number) => string): TimelineStep[] {
  const buyer = role === "buyer";
  const pickup = o.shipping_method === "pickup";
  const steps: TimelineStep[] = [];

  steps.push(o.paid_at
    ? { title: "Betaald", state: "done", at: o.paid_at,
        detail: buyer ? `${euro(o.total_cents)} staat vast bij onze betaalpartner.` : `De koper heeft betaald. Je krijgt ${euro(o.price_cents)} na afronding.` }
    : { title: "Betaald", state: "now", detail: "Wacht op betaling." });

  if (o.status === "cancelled") {
    steps.push({ title: "Geannuleerd", state: "done", at: o.cancelled_at ?? undefined,
      detail: "Niet op tijd verstuurd. De koper krijgt alles terug." });
    return steps;
  }

  const shippedTitle = pickup ? "Overgedragen" : "Verstuurd";
  if (o.shipped_at) {
    const parts = [o.tracking_code ? `Track & trace ${o.tracking_code}.` : ""];
    if (o.carrier_weight_grams) parts.push(`Gewogen: ${formatGrams(o.carrier_weight_grams)}. Dit telt mee als bewijs.`);
    steps.push({ title: shippedTitle, state: "done", at: o.shipped_at, detail: parts.filter(Boolean).join(" ") || undefined });
  } else if (o.paid_at) {
    steps.push({ title: shippedTitle, state: "now",
      detail: o.ship_by ? `${buyer ? "De verkoper moet" : "Verstuur"} vóór ${fmt(o.ship_by)}${buyer ? " versturen" : ""}. Anders annuleren we automatisch en krijgt de koper alles terug.` : undefined });
  } else {
    steps.push({ title: shippedTitle, state: "todo" });
  }

  if (o.delivered_at) {
    steps.push({ title: "Bezorgd", state: "done", at: o.delivered_at });
  }

  const finished = o.status === "completed" || o.status === "refunded";
  if (finished) {
    steps.push({ title: o.status === "refunded" ? "Terugbetaald" : "Afgerond", state: "done", at: o.completed_at ?? undefined,
      detail: o.status === "refunded" ? "Het geld is teruggestort naar de koper." : buyer ? "Het geld is vrijgegeven aan de verkoper." : `${euro(o.price_cents)} wordt naar je rekening overgemaakt.` });
  } else if (o.status === "disputed" || o.status === "return_pending") {
    steps.push({ title: "Geschil", state: "now", detail: "Het geld blijft vastgezet tot dit is opgelost." });
  } else if (o.status === "shipped") {
    steps.push({ title: "Controleren en afronden", state: "now",
      detail: o.inspect_until
        ? buyer ? `Controleer het artikel. Meld een probleem vóór ${fmt(o.inspect_until)}, daarna ronden we automatisch af.` : `De koper kan controleren tot ${fmt(o.inspect_until)}.`
        : undefined });
  } else {
    steps.push({ title: "Afgerond", state: "todo" });
  }
  return steps;
}
