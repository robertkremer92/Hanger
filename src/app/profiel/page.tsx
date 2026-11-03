import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { formatDay } from "@/lib/domain/dates";
import { Notice, TopBar } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { IconBank, IconCheck, IconId, IconMail, IconRight, IconScale } from "@/components/icons";
import type { PublicProfile } from "@/lib/types";
import { openStripeDashboard, startOnboarding, updateProfile } from "./actions";

export const metadata: Metadata = { title: "Profiel" };

export default async function Profiel({ searchParams }: { searchParams: Promise<{ stripe?: string }> }) {
  const { stripe: stripeState } = await searchParams;
  const { supabase, user, profile } = await requireSession("/profiel");
  const { data: pub } = await supabase.from("public_profiles").select("*").eq("id", user.id).maybeSingle<PublicProfile>();

  return (
    <>
      <TopBar title="Profiel" />
      <main className="stack">
        {stripeState === "klaar" ? <Notice tone="success">Je identiteit is gecontroleerd. Je kunt nu verkopen.</Notice> : null}
        {stripeState === "bezig" ? <Notice>Stripe controleert je gegevens nog. Dat duurt meestal een paar minuten. Je krijgt bericht als het klaar is.</Notice> : null}
        {stripeState === "opnieuw" ? <Notice tone="error">De link is verlopen. Start de identiteitscheck opnieuw.</Notice> : null}

        <div className="seller">
          <div className="avatar" style={{ width: 56, height: 56, fontSize: 20 }} aria-hidden>{(profile.display_name || "?").slice(0, 1).toUpperCase()}</div>
          <div>
            <b style={{ fontSize: 18 }}>{profile.display_name || "Naamloos"}</b>
            <div className="small muted">
              {profile.city ? `${profile.city}. ` : ""}Lid sinds {formatDay(profile.created_at)}.
              {pub?.rating ? ` ${String(pub.rating).replace(".", ",")} uit ${pub.review_count} reviews.` : ""}
            </div>
          </div>
        </div>

        <section className="panel stack" id="uitbetalen" style={{ gap: 12 }}>
          <h3 style={{ margin: 0 }}>Uitbetalen</h3>
          {profile.payouts_enabled ? (
            <>
              <p className="small">Na elke afgeronde verkoop zetten we het geld door naar je Stripe-saldo. Stripe maakt het automatisch over naar je bankrekening.</p>
              <ActionForm action={openStripeDashboard}><SubmitButton className="btn secondary block" pending="Openen">Saldo en uitbetalingen bekijken</SubmitButton></ActionForm>
            </>
          ) : (
            <>
              <p className="small">Om te verkopen controleert onze betaalpartner Stripe wie je bent en naar welke rekening je geld gaat. Dit doen we vóór je eerste verkoop, zodat je geld daarna nooit vastzit door een ontbrekende check.</p>
              <ActionForm action={startOnboarding}><SubmitButton pending="Doorsturen naar Stripe">{profile.stripe_account_id ? "Identiteitscheck afronden" : "Identiteit controleren"}</SubmitButton></ActionForm>
            </>
          )}
        </section>

        <section className="panel">
          <h3>Controles</h3>
          <div className="list">
            <div className="li"><IconMail /><span style={{ flex: 1 }}>{user.email}</span><span className="ok"><IconCheck /></span></div>
            <div className="li"><IconId /><span style={{ flex: 1 }}>Identiteit</span>{profile.payouts_enabled ? <span className="ok"><IconCheck /></span> : <span className="small muted">Nog niet</span>}</div>
            <div className="li"><IconBank /><span style={{ flex: 1 }}>Bankrekening</span>{profile.payouts_enabled ? <span className="ok"><IconCheck /></span> : <span className="small muted">Nog niet</span>}</div>
          </div>
        </section>

        <section className="panel">
          <h3>Gegevens</h3>
          <ActionForm action={updateProfile}>
            <div className="field"><label htmlFor="display_name">Naam die anderen zien</label><input id="display_name" name="display_name" className="input" defaultValue={profile.display_name} maxLength={40} /></div>
            <div className="field"><label htmlFor="city">Plaats</label><input id="city" name="city" className="input" defaultValue={profile.city} maxLength={60} /></div>
            <SubmitButton className="btn secondary block" pending="Opslaan">Opslaan</SubmitButton>
          </ActionForm>
        </section>

        <Link className="orow" href="/regels">
          <span className="avatar" aria-hidden style={{ width: 40, height: 40 }}><IconScale width={20} height={20} /></span>
          <span className="info"><b>Zo beslissen wij</b><span className="small muted">Beslisregels en termijnen</span></span>
          <span className="muted" style={{ width: 18 }} aria-hidden><IconRight /></span>
        </Link>
        {profile.is_support ? (
          <Link className="orow" href="/support">
            <span className="avatar" aria-hidden style={{ width: 40, height: 40 }}><IconScale width={20} height={20} /></span>
            <span className="info"><b>Supportdashboard</b><span className="small muted">Geschillen beoordelen</span></span>
            <span className="muted" style={{ width: 18 }} aria-hidden><IconRight /></span>
          </Link>
        ) : null}

        <form action="/auth/signout" method="post"><button className="signout" type="submit">Uitloggen</button></form>
      </main>
    </>
  );
}
