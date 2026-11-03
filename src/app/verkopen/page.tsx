import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { TopBar } from "@/components/ui";
import { IconShield } from "@/components/icons";
import { SellForm } from "./SellForm";

export const metadata: Metadata = { title: "Verkopen" };

export default async function Verkopen() {
  const { profile, user } = await requireSession("/verkopen");
  const isNew = Date.now() - new Date(profile.created_at).getTime() < 14 * 864e5;

  return (
    <>
      <TopBar title="Verkopen" right={<Link className="btn ghost" href="/verkopen/mijn">Mijn advertenties</Link>} />
      <main className="stack">
        {profile.payouts_enabled ? (
          <div className="note"><IconShield /><span>Je identiteit is gecontroleerd, dus je kunt direct verkopen.{isNew ? " De eerste 14 dagen kun je artikelen tot € 250 plaatsen." : ""}</span></div>
        ) : (
          <div className="panel stack" style={{ gap: 12 }}>
            <h3 style={{ margin: 0 }}>Eerst je identiteit controleren</h3>
            <p className="small">Voordat je iets verkoopt, controleert onze betaalpartner Stripe wie je bent en naar welke rekening je geld gaat. Dat duurt een paar minuten. Daarna staat je geld nooit vast door een ontbrekende check.</p>
            <Link className="btn" href="/profiel#uitbetalen">Identiteit controleren</Link>
          </div>
        )}
        <SellForm userId={user.id} disabled={!profile.payouts_enabled} />
      </main>
    </>
  );
}
