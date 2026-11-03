import Link from "next/link";
import { many } from "@/lib/db";
import { createClient } from "@/lib/supabase/server";
import { allInCents } from "@/lib/domain/money";
import { CATEGORIES, type Category } from "@/lib/domain/rules";
import { CATEGORY_TINT, Photo, PriceTag } from "@/components/ui";
import { IconPerson, IconScale, IconSearch, Wordmark } from "@/components/icons";

type Row = {
  id: string; title: string; brand: string; size: string; price_cents: number; category: Category;
  listing_photos: { path: string; position: number }[];
};

export default async function Ontdek({ searchParams }: { searchParams: Promise<{ q?: string; cat?: string }> }) {
  const { q = "", cat } = await searchParams;
  const category = cat && cat in CATEGORIES ? (cat as Category) : null;
  const term = q.replace(/[,()%*\\]/g, " ").trim().slice(0, 60);

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
  const { data, error } = await many<Row>(query);
  const listings = data ?? [];

  const chip = (value: Category | null, label: string) => {
    const params = new URLSearchParams();
    if (term) params.set("q", term);
    if (value) params.set("cat", value);
    const qs = params.toString();
    return (
      <Link key={label} className="chip" href={qs ? `/?${qs}` : "/"} aria-current={category === value ? "page" : undefined} style={{ textDecoration: "none" }}>
        {label}
      </Link>
    );
  };

  return (
    <>
      <header className="top">
        <div className="wordmark"><Wordmark /><span>hanger</span></div>
        <Link className="iconbtn" href="/regels" aria-label="Zo beslissen wij"><IconScale /></Link>
      </header>
      <main className="stack">
        <form className="search" action="/" role="search">
          <IconSearch />
          <label htmlFor="q" className="sr">Zoeken</label>
          <input id="q" name="q" type="search" placeholder="Zoek op merk of artikel" defaultValue={term} autoComplete="off" />
          {category ? <input type="hidden" name="cat" value={category} /> : null}
        </form>
        <nav className="chips" aria-label="Categorie">
          {chip(null, "Alles")}
          {(Object.keys(CATEGORIES) as Category[]).map((c) => chip(c, CATEGORIES[c]))}
        </nav>
        <Link className="note" href="/regels" style={{ textDecoration: "none" }}>
          <IconPerson />
          <span><b>Bij een probleem beslist een mens.</b> Binnen 2 werkdagen, met naam en uitleg. <span className="muted">Zo beslissen wij</span></span>
        </Link>

        {error ? <p className="err">De artikelen konden niet laden. Ververs de pagina.</p> : null}

        {listings.length ? (
          <div className="grid">
            {listings.map((l) => {
              const main = [...l.listing_photos].sort((a, b) => a.position - b.position)[0];
              return (
                <Link key={l.id} className="card" href={`/artikel/${l.id}`}>
                  <div style={{ position: "relative" }}>
                    <Photo path={main?.path} color={CATEGORY_TINT[l.category]} alt="" />
                    <PriceTag cents={allInCents(l.price_cents)} color={CATEGORY_TINT[l.category]} />
                  </div>
                  <span className="meta">
                    <span className="brand">{l.brand || "Zonder merk"}</span>
                    <span className="title">{l.title}</span>
                    <span className="size">Maat {l.size}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="empty">
            <b>{term || category ? "Niets gevonden." : "Er staan nog geen artikelen online."}</b>
            <span className="muted">{term || category ? "Probeer een merknaam of kies een andere categorie." : "Wees de eerste: plaats iets wat je niet meer draagt."}</span>
            <Link className="btn secondary" href={term || category ? "/" : "/verkopen"}>{term || category ? "Alles tonen" : "Plaats een artikel"}</Link>
          </div>
        )}
      </main>
    </>
  );
}
