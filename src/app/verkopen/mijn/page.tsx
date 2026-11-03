import type { Metadata } from "next";
import { many } from "@/lib/db";
import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { allInCents, formatEuro } from "@/lib/domain/money";
import { CATEGORY_TINT, Photo, Pill, TopBar } from "@/components/ui";
import type { Listing } from "@/lib/types";
import { removeListing } from "../actions";

export const metadata: Metadata = { title: "Mijn advertenties" };

type Row = Listing & { listing_photos: { path: string; position: number }[] };

const STATUS: Record<Listing["status"], { text: string; tone: "good" | "warn" | "neutral" }> = {
  draft: { text: "Concept", tone: "neutral" },
  active: { text: "Online", tone: "good" },
  reserved: { text: "Wordt afgerekend", tone: "warn" },
  sold: { text: "Verkocht", tone: "neutral" },
  removed: { text: "Verwijderd", tone: "neutral" },
};

export default async function MijnAdvertenties() {
  const { supabase, user } = await requireSession("/verkopen/mijn");
  const { data } = await many<Row>(supabase
    .from("listings")
    .select("*, listing_photos(path, position)")
    .eq("seller_id", user.id)
    .eq("listing_photos.kind", "main")
    .neq("status", "removed")
    .order("created_at", { ascending: false }));
  const rows = data ?? [];

  return (
    <>
      <TopBar title="Mijn advertenties" back="/verkopen" />
      <main className="stack">
        {rows.length ? (
          <div className="olist">
            {rows.map((l) => {
              const main = [...l.listing_photos].sort((a, b) => a.position - b.position)[0];
              const s = STATUS[l.status];
              return (
                <div key={l.id} className="orow">
                  <Photo path={main?.path} color={CATEGORY_TINT[l.category]} />
                  <span className="info">
                    <Link href={`/artikel/${l.id}`} className="link" style={{ textDecoration: "none" }}><b>{l.brand ? `${l.brand}, ` : ""}{l.title}</b></Link>
                    <span className="small muted num">Je ontvangt {formatEuro(l.price_cents)}. Kopers zien {formatEuro(allInCents(l.price_cents))}.</span>
                    <Pill tone={s.tone}>{s.text}</Pill>
                  </span>
                  {l.status === "draft" || l.status === "active" ? (
                    <form action={removeListing.bind(null, l.id)}>
                      <button className="btn ghost small" type="submit">Verwijderen</button>
                    </form>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty">
            <b>Je hebt nog geen advertenties.</b>
            <Link className="btn secondary" href="/verkopen">Plaats een artikel</Link>
          </div>
        )}
      </main>
    </>
  );
}
