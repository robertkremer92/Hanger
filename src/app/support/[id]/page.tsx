import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSupport } from "@/lib/auth";
import { formatEuro } from "@/lib/domain/money";
import { formatWhen, timeLeft } from "@/lib/domain/dates";
import { DECISIONS, DISPUTE_REASONS, RULES } from "@/lib/domain/rules";
import { Notice, TopBar } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import type { Dispute, Order } from "@/lib/types";
import { decide } from "./actions";

export const metadata: Metadata = { title: "Besluit" };

type Stats = { orders_as_buyer: number; disputes_opened_90d: number; orders_as_seller: number; disputes_against_90d: number; account_age_days: number };

export default async function Beslissen({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, user } = await requireSupport();
  const { data: d } = await supabase.from("disputes").select("*").eq("id", id).maybeSingle<Dispute>();
  if (!d) notFound();
  const { data: o } = await supabase.from("orders").select("*, listings(title, brand, description, allows_fit_returns)").eq("id", d.order_id)
    .single<Order & { listings: { title: string; brand: string; description: string; allows_fit_returns: boolean } }>();
  if (!o) notFound();
  const [buyerRes, sellerRes] = await Promise.all([
    supabase.rpc("party_stats", { p_user: o.buyer_id }),
    supabase.rpc("party_stats", { p_user: o.seller_id }),
  ]);
  const buyer = (buyerRes.data ?? null) as Stats | null;
  const seller = (sellerRes.data ?? null) as Stats | null;

  const isAppeal = d.status === "appealed";
  const ownDecision = isAppeal && d.decided_by === user.id;
  const canDecide = (d.status === "awaiting_review" || isAppeal) && !ownDecision;

  return (
    <>
      <TopBar title={`Besluit #${o.number}`} back="/support" />
      <main className="stack">
        {ownDecision ? <Notice tone="error">Je hebt het eerste besluit genomen. Een collega beoordeelt dit beroep.</Notice> : null}
        {!canDecide && !ownDecision ? <Notice>Dit geschil wacht niet op een besluit. <Link className="link" href={`/geschil/${d.id}`}>Bekijk dossier</Link></Notice> : null}

        <section className="panel stack" style={{ gap: 10 }}>
          <h3 style={{ margin: 0 }}>{DISPUTE_REASONS[d.reason].label}</h3>
          <dl className="kv">
            <dt>Artikel</dt><dd>{o.listings.brand ? `${o.listings.brand}, ` : ""}{o.listings.title}</dd>
            <dt>Totaal betaald</dt><dd>{formatEuro(o.total_cents)}</dd>
            <dt>Verkoper ontvangt</dt><dd>{formatEuro(o.price_cents)}</dd>
            <dt>Retour bij niet passen</dt><dd>{o.listings.allows_fit_returns ? "Ja" : "Nee"}</dd>
            {d.decide_by ? <><dt>Beslissen vóór</dt><dd>{formatWhen(d.decide_by)} ({timeLeft(d.decide_by)})</dd></> : null}
          </dl>
          <details><summary className="small muted">Advertentietekst</summary><p className="small" style={{ whiteSpace: "pre-line" }}>{o.listings.description || "Geen beschrijving."}</p></details>
          <Link className="btn secondary block" href={`/geschil/${d.id}`}>Volledig dossier met bewijs</Link>
        </section>

        <section className="panel">
          <h3>Signalen</h3>
          <dl className="kv">
            <dt>Koper</dt><dd>{buyer?.disputes_opened_90d ?? 0} meldingen in 90 dagen bij {buyer?.orders_as_buyer ?? 0} aankopen. Account {buyer?.account_age_days ?? 0} dagen oud.</dd>
            <dt>Verkoper</dt><dd>{seller?.disputes_against_90d ?? 0} geschillen in 90 dagen bij {seller?.orders_as_seller ?? 0} verkopen. Account {seller?.account_age_days ?? 0} dagen oud.</dd>
          </dl>
          <p className="small muted" style={{ marginTop: 8 }}>Signalen zijn een reden om beter te kijken, nooit op zichzelf een reden om te beslissen.</p>
        </section>

        {isAppeal && d.decision ? (
          <section className="panel">
            <h3>Eerste besluit</h3>
            <p className="small"><b>{DECISIONS[d.decision]}</b>. {d.decision_motivation}</p>
            <h3 style={{ marginTop: 12 }}>Beroep</h3>
            <p className="small" style={{ whiteSpace: "pre-line" }}>{d.appeal_text}</p>
          </section>
        ) : null}

        {canDecide ? (
          <section className="panel">
            <h3>{isAppeal ? "Besluit op beroep (definitief)" : "Besluit"}</h3>
            <ActionForm action={decide.bind(null, d.id)}>
              <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="sr">Besluit</legend>
                {(Object.keys(DECISIONS) as (keyof typeof DECISIONS)[]).map((k) => (
                  <label key={k} className="choice"><input type="radio" name="decision" value={k} /><span className="t">{DECISIONS[k]}</span></label>
                ))}
              </fieldset>
              <div className="field">
                <label htmlFor="refund">Bedrag bij gedeeltelijke terugbetaling</label>
                <div className="prefix"><span>€</span><input id="refund" name="refund" className="input num" inputMode="decimal" placeholder="0" /></div>
              </div>
              <div className="field">
                <label htmlFor="rule">Regel</label>
                <select id="rule" name="rule" className="input" defaultValue="">
                  <option value="" disabled>Kies een regel</option>
                  {RULES.map((r) => <option key={r.no} value={r.no}>{r.no}: {r.text.slice(0, 60)}…</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="motivation">Motivatie</label>
                <textarea id="motivation" name="motivation" className="input" maxLength={2000} placeholder="Wat laat het bewijs zien, en waarom leidt dat tot dit besluit?" />
                <span className="hint">Beide partijen lezen dit, met jouw naam erbij. Schrijf feitelijk en in gewone taal.</span>
              </div>
              <SubmitButton pending="Vastleggen">Besluit vastleggen</SubmitButton>
            </ActionForm>
          </section>
        ) : null}
      </main>
    </>
  );
}
