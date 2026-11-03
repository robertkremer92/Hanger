import Link from "next/link";
import type { CSSProperties } from "react";
import { many } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { allInCents, formatEuro } from "@/lib/domain/money";
import { CATEGORIES, type Category } from "@/lib/domain/rules";
import { CATEGORY_TINT, Photo, PriceTag } from "@/components/ui";
import { CategoryGlyph, Hook, IconScale, IconSearch, Wordmark } from "@/components/icons";

type Row = {
  id: string; title: string; brand: string; size: string; price_cents: number; category: Category;
  listing_photos: { path: string; position: number }[];
};

const mainPhoto = (l: Row) => [...l.listing_photos].sort((a, b) => a.position - b.position)[0]?.path;

export default async function Ontdek({ searchParams }: { searchParams: Promise<{ q?: string; cat?: string }> }) {
  const { q = "", cat } = await searchParams;
  const category = cat && cat in CATEGORIES ? (cat as Category) : null;
  const term = q.replace(/[,()%*\\]/g, " ").trim().slice(0, 60);
  const filtering = Boolean(term || category);

  const supabase = await createClient();
  let query = supabase
    .from("listings")
    .select("id, title, brand, size, price_cents, category, listing_photos(path, position)")
    .eq("status", "active")
    .eq("listing_photos.kind", "main")
    .order("published_at", { ascending: false })
    .limit(60);
  if (category) query = query.eq("category", category);
  if (term) query = query.or(`title.ilike.%${term}%,brand.ilike.%${term}%`);
  const { data: listings, error } = await many<Row>(query);

  // Op het rek hangen de nieuwste stukken; daaronder de rest.
  const rack = filtering ? [] : listings.slice(0, 8);
  const rest = filtering ? listings : listings.slice(8);

  const href = (value: Category | null) => {
    const params = new URLSearchParams();
    if (term) params.set("q", term);
    if (value && value !== category) params.set("cat", value);
    const qs = params.toString();
    return qs ? `/?${qs}` : "/";
  };

  return (
    <>
      <section className="band">
        <div className="row">
          <div className="wordmark"><Wordmark /><span>hanger</span></div>
          <Link className="iconbtn" href="/regels" aria-label="Zo beslissen wij"><IconScale /></Link>
        </div>
        <h1>Kleding met een tweede leven.</h1>
        <Link className="sticker" href="/regels">Bij gedoe beslist een mens</Link>
        <form className="search" action="/" role="search">
          <IconSearch />
          <label htmlFor="q" className="sr">Zoeken</label>
          <input id="q" name="q" type="search" placeholder="Zoek merk, maat of stijl" defaultValue={term} autoComplete="off" />
          {category ? <input type="hidden" name="cat" value={category} /> : null}
        </form>
      </section>

      <main className="stack" style={{ gap: 22, paddingTop: 16 }}>
        <nav className="tiles" aria-label="Categorie">
          {(Object.keys(CATEGORIES) as Category[]).map((c) => (
            <Link key={c} href={href(c)} className={`tile t-${c}`} aria-current={category === c ? "page" : undefined}>
              <CategoryGlyph category={c} />
              {c === "schoenen" ? "Schoen" : CATEGORIES[c]}
            </Link>
          ))}
        </nav>

        {error ? <p className="note error">De artikelen konden niet laden. Ververs de pagina.</p> : null}

        {rack.length ? (
          <section className="stack" style={{ gap: 12 }} aria-labelledby="rek">
            <div className="spread">
              <h2 id="rek" className="section-title">Net aan het rek</h2>
            </div>
            <div className="rail-wrap">
              <div className="rail" style={{ "--rail-w": `${rack.length * 166 + 32}px` } as CSSProperties}>
                {rack.map((l) => (
                  <Link key={l.id} href={`/artikel/${l.id}`} className="hanging" aria-label={`${l.brand} ${l.title}, ${formatEuro(allInCents(l.price_cents))}`}>
                    <Hook />
                    <div style={{ position: "relative" }}>
                      <Photo path={mainPhoto(l)} color={CATEGORY_TINT[l.category]} />
                      <div className="swing" aria-hidden><span>{formatEuro(allInCents(l.price_cents)).replace(",00", "")}</span></div>
                    </div>
                    <span className="meta">
                      <span className="brand">{l.brand || "Zonder merk"}</span>
                      <span className="title">{l.title}, {l.size}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {!filtering ? (
          <Link className="trust" href="/regels">
            <b>2</b>
            <span>werkdagen, maximaal. Dan heeft een medewerker je probleem beslist, met naam en uitleg.</span>
          </Link>
        ) : null}

        {rest.length ? (
          <section className="stack" style={{ gap: 12 }} aria-labelledby="alles">
            <div className="spread">
              <h2 id="alles" className="section-title">
                {filtering ? (category && !term ? CATEGORIES[category] : `Resultaten${term ? ` voor “${term}”` : ""}`) : "Meer om te ontdekken"}
              </h2>
              {filtering ? <Link className="btn ghost" href="/">Wissen</Link> : null}
            </div>
            <div className="grid">
              {rest.map((l) => (
                <Link key={l.id} className="card" href={`/artikel/${l.id}`}>
                  <div style={{ position: "relative" }}>
                    <Photo path={mainPhoto(l)} color={CATEGORY_TINT[l.category]} />
                    <PriceTag cents={allInCents(l.price_cents)} color={CATEGORY_TINT[l.category]} />
                  </div>
                  <span className="meta">
                    <span className="brand">{l.brand || "Zonder merk"}</span>
                    <span className="title">{l.title}</span>
                    <span className="size">Maat {l.size}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {!listings.length && !error ? (
          <div className="empty">
            <h2 className="section-title">{filtering ? "Niets gevonden." : "Het rek is nog leeg."}</h2>
            <span className="muted">{filtering ? "Probeer een merknaam of kies een andere categorie." : "Hang er als eerste iets aan: plaats wat je niet meer draagt."}</span>
            <Link className="btn" href={filtering ? "/" : "/verkopen"}>{filtering ? "Alles tonen" : "Plaats een artikel"}</Link>
          </div>
        ) : null}
      </main>
    </>
  );
}
