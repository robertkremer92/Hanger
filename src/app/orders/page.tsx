import type { Metadata } from "next";
import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { formatEuro } from "@/lib/domain/money";
import { statusLabel } from "@/lib/domain/order-view";
import { CATEGORY_TINT, Photo, Pill, TopBar } from "@/components/ui";
import { IconRight } from "@/components/icons";
import type { Category } from "@/lib/domain/rules";
import type { Order } from "@/lib/types";

export const metadata: Metadata = { title: "Orders" };

type Row = Order & { listings: { title: string; brand: string; category: Category; listing_photos: { path: string; position: number }[] } };

export default async function Orders({ searchParams }: { searchParams: Promise<{ soort?: string }> }) {
  const { soort } = await searchParams;
  const role = soort === "verkocht" ? "seller" : "buyer";
  const { supabase, user } = await requireSession("/orders");

  const { data } = await supabase
    .from("orders")
    .select("*, listings(title, brand, category, listing_photos(path, position))")
    .eq(role === "seller" ? "seller_id" : "buyer_id", user.id)
    .not("status", "in", "(pending_payment,expired)")
    .eq("listings.listing_photos.kind", "main")
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<Row[]>();
  const rows = data ?? [];

  return (
    <>
      <TopBar title="Orders" right={<Link className="btn ghost" href="/berichten">Berichten</Link>} />
      <main className="stack">
        <div className="seg" role="group" aria-label="Soort order">
          <Link href="/orders" aria-current={role === "buyer" ? "page" : undefined} className="segbtn">Gekocht</Link>
          <Link href="/orders?soort=verkocht" aria-current={role === "seller" ? "page" : undefined} className="segbtn">Verkocht</Link>
        </div>
        {rows.length ? (
          <div className="olist">
            {rows.map((o) => {
              const s = statusLabel(o, role);
              const main = [...(o.listings?.listing_photos ?? [])].sort((a, b) => a.position - b.position)[0];
              return (
                <Link key={o.id} className="orow" href={`/orders/${o.id}`}>
                  <Photo path={main?.path} color={CATEGORY_TINT[o.listings?.category ?? "dames"]} />
                  <span className="info">
                    <b>{o.listings?.brand ? `${o.listings.brand}, ` : ""}{o.listings?.title}</b>
                    <span className="small muted num">#{o.number}. {formatEuro(role === "buyer" ? o.total_cents : o.price_cents)}</span>
                    <Pill tone={s.tone}>{s.text}</Pill>
                  </span>
                  <span className="muted" style={{ width: 18 }} aria-hidden><IconRight /></span>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="empty">
            <b>{role === "buyer" ? "Je hebt nog niets gekocht." : "Je hebt nog niets verkocht."}</b>
            <Link className="btn secondary" href={role === "buyer" ? "/" : "/verkopen"}>{role === "buyer" ? "Bekijk artikelen" : "Plaats een artikel"}</Link>
          </div>
        )}
      </main>
    </>
  );
}
