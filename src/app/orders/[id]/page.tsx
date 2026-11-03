import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { SHIPPING, formatEuro } from "@/lib/domain/money";
import { buildTimeline, statusLabel } from "@/lib/domain/order-view";
import { formatWhen } from "@/lib/domain/dates";
import type { Category } from "@/lib/domain/rules";
import { CATEGORY_TINT, Notice, Photo, Pill, Timeline, TopBar } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { IconLock } from "@/components/icons";
import type { Dispute, Order, PublicProfile } from "@/lib/types";
import { confirmOrder, leaveReview, markShipped } from "./actions";

export const metadata: Metadata = { title: "Order" };

type Row = Order & { listings: { id: string; title: string; brand: string; category: Category; listing_photos: { path: string; position: number }[] } };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ betaald?: string }> }) {
  const { id } = await params;
  const { betaald } = await searchParams;
  const { supabase, user } = await requireSession(`/orders/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const { data: o } = await supabase
    .from("orders")
    .select("*, listings(id, title, brand, category, listing_photos(path, position))")
    .eq("id", id)
    .eq("listings.listing_photos.kind", "main")
    .maybeSingle<Row>();
  if (!o) notFound();

  const role = o.buyer_id === user.id ? "buyer" : "seller";
  const otherId = role === "buyer" ? o.seller_id : o.buyer_id;
  const [{ data: other }, { data: dispute }, { data: myReview }] = await Promise.all([
    supabase.from("public_profiles").select("*").eq("id", otherId).maybeSingle<PublicProfile>(),
    supabase.from("disputes").select("*").eq("order_id", o.id).maybeSingle<Dispute>(),
    supabase.from("reviews").select("id").eq("order_id", o.id).eq("author_id", user.id).maybeSingle(),
  ]);

  const s = statusLabel(o, role);
  const main = [...(o.listings?.listing_photos ?? [])].sort((a, b) => a.position - b.position)[0];
  const steps = buildTimeline(o, role, formatWhen, formatEuro);
  const otherName = other?.display_name || (role === "buyer" ? "de verkoper" : "de koper");

  return (
    <>
      <TopBar title={`Order #${o.number}`} back={role === "seller" ? "/orders?soort=verkocht" : "/orders"} />
      <main className="stack">
        {betaald && o.status === "pending_payment" ? (
          <Notice>We verwerken je betaling. Ververs deze pagina over een paar seconden.</Notice>
        ) : betaald && o.status === "paid" ? (
          <Notice tone="success" icon={<IconLock />}>Betaald. Je geld staat vast tot je het artikel hebt en goedkeurt.</Notice>
        ) : null}

        <Link className="orow" href={`/artikel/${o.listings?.id}`}>
          <Photo path={main?.path} color={CATEGORY_TINT[o.listings?.category ?? "dames"]} />
          <span className="info">
            <b>{o.listings?.brand ? `${o.listings.brand}, ` : ""}{o.listings?.title}</b>
            <span className="small muted">{role === "buyer" ? "Verkoper" : "Koper"} {otherName}. {SHIPPING[o.shipping_method].label}</span>
            <Pill tone={s.tone}>{s.text}</Pill>
          </span>
        </Link>

        {dispute ? (
          <Link className="note" href={`/geschil/${dispute.id}`} style={{ textDecoration: "none" }}>
            <IconLock /><span><b>Er loopt een geschil.</b> Het geld blijft vastgezet tot het is opgelost. <span className="link">Bekijk geschil</span></span>
          </Link>
        ) : null}

        <section className="panel"><Timeline steps={steps} /></section>

        {role === "seller" && o.status === "paid" ? (
          <section className="panel">
            <h3>{o.shipping_method === "pickup" ? "Overdracht" : "Versturen"}</h3>
            <ActionForm action={markShipped.bind(null, o.id)}>
              {o.shipping_method === "pickup" ? (
                <p className="small">Spreek via berichten af met {otherName}. Markeer de order pas als overgedragen als de koper het artikel heeft.</p>
              ) : (
                <div className="field">
                  <label htmlFor="tracking">Track & trace-code</label>
                  <input id="tracking" name="tracking" className="input" autoComplete="off" autoCapitalize="characters" placeholder="3SABCD1234567" />
                  <span className="hint">Maak een foto van het ingepakte artikel voordat je het dichtplakt. Bij een geschil helpt dat.</span>
                </div>
              )}
              <SubmitButton pending="Opslaan">{o.shipping_method === "pickup" ? "Overgedragen" : "Verstuurd"}</SubmitButton>
            </ActionForm>
          </section>
        ) : null}

        {role === "buyer" && o.status === "shipped" ? (
          <div className="stack" style={{ gap: 10 }}>
            <ActionForm action={confirmOrder.bind(null, o.id)}>
              <SubmitButton pending="Afronden">Alles klopt, rond af</SubmitButton>
            </ActionForm>
            <Link className="btn danger block" href={`/orders/${o.id}/probleem`}>Er is een probleem</Link>
          </div>
        ) : null}

        {(o.status === "completed" || o.status === "refunded") && !myReview ? (
          <section className="panel">
            <h3>Hoe ging het met {otherName}?</h3>
            <ActionForm action={leaveReview.bind(null, o.id)}>
              <fieldset className="stars-input" style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="sr">Score</legend>
                {[1, 2, 3, 4, 5].map((n) => (
                  <label key={n}><input type="radio" name="rating" value={n} /><span>{n}</span></label>
                ))}
              </fieldset>
              <div className="field">
                <label htmlFor="body">Toelichting (optioneel)</label>
                <textarea id="body" name="body" className="input" maxLength={1000} style={{ minHeight: 80 }} />
              </div>
              <SubmitButton className="btn secondary block" pending="Opslaan">Review plaatsen</SubmitButton>
            </ActionForm>
          </section>
        ) : null}

        {role === "buyer" ? (
          <div className="lines panel" style={{ margin: 0 }}>
            <div className="spread"><span>Artikel, alles-in</span><span>{formatEuro(o.price_cents + o.fee_cents)}</span></div>
            <div className="spread"><span>Verzending</span><span>{o.shipping_cents ? formatEuro(o.shipping_cents) : "Gratis"}</span></div>
            <div className="spread total"><span>Betaald</span><span>{formatEuro(o.total_cents)}</span></div>
            {o.refund_cents > 0 ? <div className="spread"><span>Terugbetaald{o.stripe_refund_id ? "" : " (wordt verwerkt)"}</span><span>{formatEuro(o.refund_cents)}</span></div> : null}
          </div>
        ) : (
          <div className="lines panel" style={{ margin: 0 }}>
            <div className="spread total"><span>Jij ontvangt</span><span>{formatEuro(o.payout_cents || o.price_cents)}</span></div>
            {o.payout_due_at ? <div className="spread"><span>Status</span><span>{o.stripe_transfer_id ? "Overgemaakt naar je Stripe-saldo" : "Wordt verwerkt"}</span></div> : null}
          </div>
        )}

        <Link className="btn secondary block" href={`/berichten/${o.listing_id}/${o.buyer_id}`}>Bericht aan {otherName}</Link>
      </main>
    </>
  );
}
