import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { formatWhen } from "@/lib/domain/dates";
import { TopBar } from "@/components/ui";
import { IconRight } from "@/components/icons";
import type { Message, PublicProfile } from "@/lib/types";

export const metadata: Metadata = { title: "Berichten" };

type Row = Message & { listings: { title: string; brand: string; seller_id: string } };

export default async function Berichten() {
  const { supabase, user } = await requireSession("/berichten");
  const { data } = await supabase
    .from("messages")
    .select("*, listings(title, brand, seller_id)")
    .order("created_at", { ascending: false })
    .limit(300)
    .returns<Row[]>();

  const threads = new Map<string, Row>();
  for (const m of data ?? []) {
    const key = `${m.listing_id}/${m.buyer_id}`;
    if (!threads.has(key)) threads.set(key, m);
  }
  const list = [...threads.values()];
  const others = [...new Set(list.map((m) => (m.buyer_id === user.id ? m.listings.seller_id : m.buyer_id)))];
  const { data: people } = others.length
    ? await supabase.from("public_profiles").select("id, display_name").in("id", others).returns<Pick<PublicProfile, "id" | "display_name">[]>()
    : { data: [] };
  const name = (id: string) => people?.find((p) => p.id === id)?.display_name || "Gebruiker";

  return (
    <>
      <TopBar title="Berichten" back="/orders" />
      <main className="stack">
        {list.length ? (
          <div className="olist">
            {list.map((m) => {
              const other = m.buyer_id === user.id ? m.listings.seller_id : m.buyer_id;
              return (
                <Link key={`${m.listing_id}/${m.buyer_id}`} className="orow" href={`/berichten/${m.listing_id}/${m.buyer_id}`}>
                  <span className="avatar" aria-hidden>{name(other).slice(0, 1).toUpperCase()}</span>
                  <span className="info">
                    <b>{name(other)}</b>
                    <span className="small muted" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.listings.brand ? `${m.listings.brand}, ` : ""}{m.listings.title}</span>
                    <span className="small" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.sender_id === user.id ? "Jij: " : ""}{m.body}</span>
                    <span className="small muted">{formatWhen(m.created_at)}</span>
                  </span>
                  <span className="muted" style={{ width: 18 }} aria-hidden><IconRight /></span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="empty"><b>Nog geen berichten.</b><span className="muted">Stel een vraag via de knop Stuur bericht bij een artikel.</span></div>
        )}
      </main>
    </>
  );
}
