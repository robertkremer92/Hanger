import type { Metadata } from "next";
import { many } from "@/lib/db";
import Link from "next/link";
import { requireSupport } from "@/lib/auth";
import { formatEuro } from "@/lib/domain/money";
import { formatWhen, timeLeft } from "@/lib/domain/dates";
import { DISPUTE_REASONS } from "@/lib/domain/rules";
import { Pill, TopBar } from "@/components/ui";
import { IconRight } from "@/components/icons";
import type { Dispute, Order } from "@/lib/types";

export const metadata: Metadata = { title: "Support" };

type Row = Dispute & { orders: Pick<Order, "number" | "total_cents"> };

export default async function Support() {
  const { supabase, user } = await requireSupport();
  const { data } = await many<Row>(supabase
    .from("disputes")
    .select("*, orders(number, total_cents)")
    .in("status", ["awaiting_review", "appealed", "awaiting_seller"])
    .order("decide_by", { ascending: true, nullsFirst: false })
    .limit(200));
  const rows = data ?? [];
  const toDecide = rows.filter((d) => d.status !== "awaiting_seller" && !(d.status === "appealed" && d.decided_by === user.id));
  const waiting = rows.filter((d) => d.status === "awaiting_seller");
  const overdue = toDecide.filter((d) => d.decide_by && new Date(d.decide_by) < new Date()).length;

  const item = (d: Row, actionable: boolean) => (
    <Link key={d.id} className="orow" href={actionable ? `/support/${d.id}` : `/geschil/${d.id}`}>
      <span className="info">
        <b>#{d.orders.number}. {DISPUTE_REASONS[d.reason].label}</b>
        <span className="small muted num">{formatEuro(d.orders.total_cents)}. Gemeld {formatWhen(d.created_at)}.</span>
        {d.status === "appealed" ? <Pill tone="warn">Beroep</Pill> : null}
        {d.decide_by ? (
          <Pill tone={new Date(d.decide_by) < new Date() ? "bad" : "neutral"}>Beslissen: {timeLeft(d.decide_by)}</Pill>
        ) : d.status === "awaiting_seller" ? <Pill tone="neutral">Verkoper: {timeLeft(d.seller_respond_by)}</Pill> : null}
      </span>
      <span className="muted" style={{ width: 18 }} aria-hidden><IconRight /></span>
    </Link>
  );

  return (
    <>
      <TopBar title="Geschillen" back="/profiel" />
      <main className="stack">
        <div className="stats">
          <div className="stat"><b>{toDecide.length}</b><span className="small muted">wachten op een besluit</span></div>
          <div className="stat"><b style={{ color: overdue ? "var(--bad)" : undefined }}>{overdue}</b><span className="small muted">over de termijn</span></div>
        </div>
        <h2 className="section-title">Te beslissen</h2>
        {toDecide.length ? <div className="olist queue">{toDecide.map((d) => item(d, true))}</div> : <p className="muted">Niets te beslissen.</p>}
        <h2 className="section-title">Wacht op verkoper</h2>
        {waiting.length ? <div className="olist queue">{waiting.map((d) => item(d, false))}</div> : <p className="muted">Geen.</p>}
        <p className="small muted">Een beroep tegen je eigen besluit zie je hier niet: dat beoordeelt een collega.</p>
      </main>
    </>
  );
}
