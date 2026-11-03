import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { TopBar } from "@/components/ui";
import type { Order } from "@/lib/types";
import { DisputeForm } from "./DisputeForm";

export const metadata: Metadata = { title: "Probleem melden" };

export default async function Probleem({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user } = await requireSession(`/orders/${id}/probleem`);
  const { data: o } = await supabase
    .from("orders")
    .select("*, listings(allows_fit_returns, price_cents)")
    .eq("id", id)
    .maybeSingle<Order & { listings: { allows_fit_returns: boolean; price_cents: number } }>();
  if (!o || o.buyer_id !== user.id) notFound();
  if (o.status !== "shipped") redirect(`/orders/${id}`);

  return (
    <>
      <TopBar title="Probleem melden" back={`/orders/${id}`} />
      <main className="stack">
        <DisputeForm orderId={o.id} userId={user.id} allowsFitReturns={o.listings.allows_fit_returns} highValue={o.price_cents >= 10000} />
      </main>
    </>
  );
}
