import type { Metadata } from "next";
import { many } from "@/lib/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { SHIPPING, allInCents, feeCents, formatEuro } from "@/lib/domain/money";
import { CONDITIONS } from "@/lib/domain/rules";
import { CATEGORY_TINT, Photo, TopBar } from "@/components/ui";
import { IconCheck, IconChevron, IconClock, IconLock, IconPerson } from "@/components/icons";
import type { Listing, ListingPhoto, PublicProfile } from "@/lib/types";
import { BuySheet } from "./BuySheet";

type Props = { params: Promise<{ id: string }> };

async function load(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data: listing } = await supabase.from("listings").select("*").eq("id", id).maybeSingle<Listing>();
  if (!listing) return null;
  const [{ data: photos }, { data: seller }] = await Promise.all([
    many<ListingPhoto>(supabase.from("listing_photos").select("*").eq("listing_id", id).order("kind").order("position")),
    supabase.from("public_profiles").select("*").eq("id", listing.seller_id).maybeSingle<PublicProfile>(),
  ]);
  return { listing, photos: photos ?? [], seller };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await load((await params).id);
  return { title: data ? `${data.listing.brand} ${data.listing.title}`.trim() : "Artikel" };
}

export default async function Artikel({ params }: Props) {
  const { id } = await params;
  const data = await load(id);
  if (!data) notFound();
  const { listing: l, photos, seller } = data;
  const session = await getSession();
  const mine = session?.user.id === l.seller_id;
  const color = CATEGORY_TINT[l.category];
  const main = photos.filter((p) => p.kind === "main");
  const proof = photos.filter((p) => p.kind !== "main");
  const available = l.status === "active";

  return (
    <>
      <TopBar title={l.brand || "Artikel"} back="/" />
      <main className="stack" style={{ paddingBottom: available && !mine ? 200 : 120 }}>
        <div className="hero-wrap">
          <div className={`gallery ${main.length > 1 ? "multi" : ""}`}>
            {main.map((p, i) => <Photo key={p.id} path={p.path} color={color} className="hero" alt={i === 0 ? l.title : ""} />)}
          </div>
          {available ? <div className="swing big" aria-hidden><span>{formatEuro(allInCents(l.price_cents))}</span></div> : null}
        </div>

        <div className="stack" style={{ gap: 10 }}>
          <div>
            <div className="muted small" style={{ fontWeight: 600 }}>{l.brand || "Zonder merk"}</div>
            <h2 className="h1">{l.title}</h2>
          </div>
          <div className="facts">
            <span className="fact">Maat {l.size}</span>
            <span className="fact">{CONDITIONS[l.condition]}</span>
            {l.allows_pickup ? <span className="fact">Ophalen in {l.pickup_city}</span> : null}
          </div>
        </div>

        {available ? (
          <div className="stack" style={{ gap: 8 }}>
            <p style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-.03em" }} className="num">{formatEuro(allInCents(l.price_cents))}</p>
            <details className="price">
              <summary>Alles-in prijs, verzending vanaf {formatEuro(SHIPPING.postnl.cents)} <IconChevron /></summary>
              <div className="lines">
                <div className="spread"><span>Verkoper ontvangt</span><span>{formatEuro(l.price_cents)}</span></div>
                <div className="spread"><span>Betaling, bescherming en support (6% + € 0,50)</span><span>{formatEuro(feeCents(l.price_cents))}</span></div>
                <div className="spread total"><span>Jij betaalt</span><span>{formatEuro(allInCents(l.price_cents))}</span></div>
              </div>
            </details>
          </div>
        ) : (
          <p className="note">{l.status === "reserved" ? "Iemand is dit artikel nu aan het afrekenen." : l.status === "sold" ? "Dit artikel is verkocht." : "Dit artikel is niet meer beschikbaar."}</p>
        )}

        {l.risk_brand || l.allows_fit_returns ? (
          <div className="stack" style={{ gap: 8 }}>
            {l.risk_brand ? <div className="badge"><IconCheck /><span>De verkoper heeft het label en de serie- of datumcode gefotografeerd. Je ziet ze hieronder.</span></div> : null}
            {l.allows_fit_returns ? <div className="badge"><IconCheck /><span>Verkoper neemt het terug als het niet past. Jij betaalt dan de retour.</span></div> : null}
          </div>
        ) : null}

        {l.description ? <p style={{ whiteSpace: "pre-line" }}>{l.description}</p> : null}

        {proof.length ? (
          <div className="proof">
            {proof.map((p) => (
              <figure key={p.id}>
                <img src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/listing-photos/${p.path}`} alt={p.kind === "label" ? "Label" : "Serie- of datumcode"} />
                <figcaption>{p.kind === "label" ? "Label" : "Code"}</figcaption>
              </figure>
            ))}
          </div>
        ) : null}

        {seller ? (
          <div className="panel seller">
            <div className="avatar" aria-hidden>{(seller.display_name || "?").slice(0, 1).toUpperCase()}</div>
            <div style={{ flex: 1 }}>
              <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                <b>{seller.display_name || "Verkoper"}</b>
                {seller.id_verified ? <span className="pill good" style={{ padding: "1px 8px" }}>ID gecontroleerd</span> : null}
              </div>
              <div className="small muted">
                {seller.rating ? <><span className="stars">{String(seller.rating).replace(".", ",")}</span> uit {seller.review_count} reviews. </> : "Nog geen reviews. "}
                {seller.sales} verkopen.{seller.city ? ` ${seller.city}.` : ""}
              </div>
            </div>
          </div>
        ) : null}

        <div className="panel promise">
          <h3>Zo ben je beschermd</h3>
          <ul>
            <li><IconLock /><span>Je geld staat vast bij onze betaalpartner. De verkoper krijgt het pas als jij het artikel goed hebt ontvangen.</span></li>
            <li><IconClock /><span>Verstuurt de verkoper niet binnen 3 dagen, dan krijg je automatisch alles terug.</span></li>
            <li><IconPerson /><span>Klopt er iets niet? Een medewerker beslist binnen 2 werkdagen en legt uit waarom. <Link className="link" href="/regels">Zo beslissen wij</Link></span></li>
          </ul>
        </div>
      </main>

      {available && !mine ? (
        <div className="actionbar">
          <Link className="btn secondary" href={session ? `/berichten/${l.id}/${session.user.id}` : `/login?next=/artikel/${l.id}`}>Stuur bericht</Link>
          <BuySheet listingId={l.id} priceCents={l.price_cents} pickupCity={l.allows_pickup ? l.pickup_city : null} loggedIn={Boolean(session)} />
        </div>
      ) : null}
      {mine ? (
        <div className="actionbar"><Link className="btn secondary" href="/verkopen/mijn">Bekijk je advertenties</Link></div>
      ) : null}
    </>
  );
}
