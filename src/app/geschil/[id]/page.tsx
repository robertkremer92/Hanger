import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { formatEuro } from "@/lib/domain/money";
import { formatWhen, timeLeft } from "@/lib/domain/dates";
import { DECISIONS, DISPUTE_REASONS, RULES } from "@/lib/domain/rules";
import { formatGrams, type TimelineStep } from "@/lib/domain/order-view";
import { Notice, Pill, Timeline, TopBar } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { IconLock, IconScale } from "@/components/icons";
import type { Dispute, Evidence, Order, PublicProfile } from "@/lib/types";
import { EvidenceAdder } from "./EvidenceAdder";
import { acceptRefund, appeal, confirmReturn, respond, submitReturn } from "./actions";

export const metadata: Metadata = { title: "Geschil" };

export default async function Geschil({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ gemeld?: string; upload?: string }> }) {
  const { id } = await params;
  const { gemeld, upload } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, user } = await requireSession(`/geschil/${id}`);

  const { data: d } = await supabase.from("disputes").select("*").eq("id", id).maybeSingle<Dispute>();
  if (!d) notFound();
  const { data: o } = await supabase.from("orders").select("*, listings(title, brand)").eq("id", d.order_id).single<Order & { listings: { title: string; brand: string } }>();
  if (!o) notFound();

  const role = o.buyer_id === user.id ? "buyer" : o.seller_id === user.id ? "seller" : "support";
  const deciders = [d.decided_by, d.appeal_decided_by].filter(Boolean) as string[];
  const [{ data: evidence }, { data: people }] = await Promise.all([
    supabase.from("dispute_evidence").select("*").eq("dispute_id", id).order("created_at").returns<Evidence[]>(),
    supabase.from("public_profiles").select("id, display_name").in("id", [o.buyer_id, o.seller_id, ...deciders]).returns<Pick<PublicProfile, "id" | "display_name">[]>(),
  ]);
  const name = (uid: string | null) => people?.find((p) => p.id === uid)?.display_name || "onbekend";
  const signed = evidence?.length
    ? (await supabase.storage.from("evidence").createSignedUrls(evidence.map((e) => e.path), 3600)).data ?? []
    : [];
  const urlFor = (path: string) => signed.find((s) => s.path === path)?.signedUrl ?? null;

  const open = ["awaiting_seller", "awaiting_review", "appealed"].includes(d.status);
  const ruleText = (no: string | null) => RULES.find((r) => r.no === no)?.text;

  const steps: TimelineStep[] = [
    { title: "Melding ingediend", state: "done", at: d.created_at, detail: `${DISPUTE_REASONS[d.reason].label}.` },
    d.seller_responded_at
      ? { title: "Verkoper heeft gereageerd", state: "done", at: d.seller_responded_at }
      : d.status === "awaiting_seller"
        ? { title: "Verkoper reageert", state: "now", detail: `Uiterlijk ${formatWhen(d.seller_respond_by)} (${timeLeft(d.seller_respond_by)}).` }
        : { title: "Verkoper reageerde niet binnen 3 dagen", state: "done", at: d.seller_respond_by },
    d.decided_at
      ? { title: "Medewerker heeft besloten", state: "done", at: d.decided_at }
      : { title: "Medewerker beslist", state: d.status === "awaiting_review" ? "now" : "todo", detail: d.decide_by ? `Uiterlijk ${formatWhen(d.decide_by)}.` : "Binnen 2 werkdagen nadat de verkoper heeft gereageerd." },
  ];
  if (d.status === "decided" && d.appeal_until) steps.push({ title: "Beroep mogelijk", state: "now", detail: `Tot ${formatWhen(d.appeal_until)}. Tijdens deze termijn wordt er geen geld bewogen.` });
  if (d.status === "appealed") steps.push({ title: "Beroep wordt beoordeeld", state: "now", detail: `Door een andere medewerker, uiterlijk ${d.decide_by ? formatWhen(d.decide_by) : "binnen 2 werkdagen"}.` });
  if (d.finalized_at) steps.push({ title: "Besluit definitief", state: "done", at: d.finalized_at });

  return (
    <>
      <TopBar title={`Geschil bij #${o.number}`} back={role === "support" ? "/support" : `/orders/${o.id}`} />
      <main className="stack">
        {gemeld ? <Notice tone="success">Gemeld. De verkoper heeft 3 dagen om te reageren.</Notice> : null}
        {upload === "mislukt" ? <Notice tone="error">Je melding staat, maar het bewijs kon niet worden geüpload. Voeg het hieronder opnieuw toe.</Notice> : null}

        <div className="orow">
          <span className="info">
            <b>{o.listings.brand ? `${o.listings.brand}, ` : ""}{o.listings.title}</b>
            <span className="small muted">Koper {name(o.buyer_id)}. Verkoper {name(o.seller_id)}.</span>
            {open ? <Pill tone="bad">Loopt</Pill> : d.status === "decided" ? <Pill tone="warn">Besloten, beroep mogelijk</Pill> : <Pill tone="good">Definitief</Pill>}
          </span>
        </div>

        <Notice icon={<IconLock />}>
          {o.status === "refunded" ? `De koper krijgt ${formatEuro(o.refund_cents)} terug.` :
           o.status === "completed" ? "Afgerond volgens het besluit." :
           `${formatEuro(o.total_cents)} blijft vastgezet tot dit is opgelost.`}
        </Notice>

        {d.decision ? (
          <section className="decision" aria-label="Besluit">
            <div className="who">
              <div className="avatar" aria-hidden><IconScale width={20} height={20} /></div>
              <div>
                <b>{name(d.appeal_decided_by ?? d.decided_by)}</b>
                <div className="small muted">{d.appeal_decided_at ? "Beroep, team geschillen" : "Team geschillen"}. {formatWhen(d.appeal_decided_at ?? d.decided_at ?? d.created_at)}</div>
              </div>
            </div>
            <div>
              <div className="label" style={{ marginBottom: 4 }}>Besluit</div>
              <p><b>{DECISIONS[d.decision]}</b>{d.decision === "refund_partial" && d.decision_refund_cents ? `: ${formatEuro(d.decision_refund_cents)}` : ""}.</p>
            </div>
            <blockquote>{d.appeal_motivation ?? d.decision_motivation}</blockquote>
            {d.decision_rule ? (
              <p className="rule">Gebaseerd op <Link href={`/regels#regel-${d.decision_rule}`}>regel {d.decision_rule}</Link>{ruleText(d.decision_rule) ? `: ${ruleText(d.decision_rule)}` : "."}</p>
            ) : null}
          </section>
        ) : null}

        <section className="panel"><Timeline steps={steps} /></section>

        {/* Acties per rol */}
        {role === "seller" && d.status === "awaiting_seller" ? (
          <section className="panel stack" style={{ gap: 12 }}>
            <h3 style={{ margin: 0 }}>Jouw reactie</h3>
            <ActionForm action={respond.bind(null, d.id)}>
              <div className="field">
                <label htmlFor="response">Wat is jouw kant van het verhaal?</label>
                <textarea id="response" name="response" className="input" maxLength={3000} placeholder="Bijvoorbeeld: de scheur zat er bij verzending niet in, zie mijn inpakfoto." />
                <span className="hint">Voeg hieronder je inpakfoto&apos;s toe als je die hebt.</span>
              </div>
              <SubmitButton pending="Versturen">Reactie versturen</SubmitButton>
            </ActionForm>
            <ActionForm action={acceptRefund.bind(null, d.id)}>
              <p className="small muted">Ben je het met de koper eens? Dan kun je het direct oplossen. De koper krijgt alles terug en houdt het artikel.</p>
              <SubmitButton className="btn secondary block" pending="Verwerken">Volledig terugbetalen</SubmitButton>
            </ActionForm>
          </section>
        ) : null}

        {(role === "buyer" || role === "seller") && d.status === "decided" && d.appeal_until && new Date(d.appeal_until) > new Date() ? (
          <section className="panel">
            <h3>Niet eens met het besluit?</h3>
            <ActionForm action={appeal.bind(null, d.id)}>
              <div className="field">
                <label htmlFor="appeal">Waarom niet?</label>
                <textarea id="appeal" name="appeal" className="input" maxLength={3000} />
                <span className="hint">Een andere medewerker kijkt opnieuw. Dat besluit is definitief.</span>
              </div>
              <SubmitButton className="btn secondary block" pending="Versturen">In beroep gaan</SubmitButton>
            </ActionForm>
          </section>
        ) : null}

        {role === "buyer" && o.status === "return_pending" && !d.return_shipped_at ? (
          <section className="panel">
            <h3>Stuur het artikel terug</h3>
            <ActionForm action={submitReturn.bind(null, d.id)}>
              <p className="small">Verstuur het binnen 7 dagen naar de verkoper en vul de track & trace-code in. Het adres staat in je berichten. Daarna krijg je {formatEuro(o.total_cents)} terug.</p>
              <div className="field">
                <label htmlFor="tracking">Track & trace-code van de retour</label>
                <input id="tracking" name="tracking" className="input" autoComplete="off" />
              </div>
              <SubmitButton pending="Opslaan">Retour verstuurd</SubmitButton>
            </ActionForm>
          </section>
        ) : null}

        {role === "seller" && o.status === "return_pending" && d.return_shipped_at ? (
          <section className="panel">
            <h3>Retour onderweg</h3>
            <ActionForm action={confirmReturn.bind(null, d.id)}>
              <p className="small">Track & trace {d.return_tracking_code}. Bevestig als je het artikel terug hebt. Doe je niets, dan krijgt de koper 7 dagen na verzending automatisch het geld terug.</p>
              <SubmitButton pending="Bevestigen">Artikel ontvangen</SubmitButton>
            </ActionForm>
          </section>
        ) : null}

        <section className="panel stack" style={{ gap: 12 }}>
          <h3 style={{ margin: 0 }}>Dossier</h3>
          <div className="stack" style={{ gap: 4 }}>
            <span className="label">Melding van {name(d.opened_by)}</span>
            <p className="small" style={{ whiteSpace: "pre-line" }}>{d.description}</p>
          </div>
          {d.seller_response ? (
            <div className="stack" style={{ gap: 4 }}>
              <span className="label">Reactie van {name(o.seller_id)}</span>
              <p className="small" style={{ whiteSpace: "pre-line" }}>{d.seller_response}</p>
            </div>
          ) : null}
          {d.appeal_text ? (
            <div className="stack" style={{ gap: 4 }}>
              <span className="label">Beroep van {name(d.appealed_by)}</span>
              <p className="small" style={{ whiteSpace: "pre-line" }}>{d.appeal_text}</p>
            </div>
          ) : null}
          <div className="proof">
            {(evidence ?? []).map((e) => {
              const url = urlFor(e.path);
              return (
                <figure key={e.id}>
                  {e.kind === "video"
                    ? (url ? <video src={url} controls width={176} style={{ borderRadius: 10 }} /> : <span>Video</span>)
                    : (url ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={`Bewijs van ${name(e.uploaded_by)}`} /></a> : null)}
                  <figcaption>{name(e.uploaded_by)}</figcaption>
                </figure>
              );
            })}
            {!evidence?.length ? <p className="small muted">Nog geen foto&apos;s of video&apos;s.</p> : null}
          </div>
          <dl className="kv">
            {o.tracking_code ? <><dt>Track & trace</dt><dd>{o.tracking_code}</dd></> : null}
            {o.carrier_weight_grams ? <><dt>Gewicht bij afgifte</dt><dd>{formatGrams(o.carrier_weight_grams)}</dd></> : null}
            {o.shipped_at ? <><dt>Verstuurd</dt><dd>{formatWhen(o.shipped_at)}</dd></> : null}
          </dl>
          {open && role !== "support" ? <EvidenceAdder disputeId={d.id} userId={user.id} /> : null}
        </section>
      </main>
    </>
  );
}
