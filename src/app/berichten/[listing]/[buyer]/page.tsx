import type { Metadata } from "next";
import { many } from "@/lib/db";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { TopBar } from "@/components/ui";
import type { Listing, Message, PublicProfile } from "@/lib/types";
import { Chat } from "./Chat";

export const metadata: Metadata = { title: "Bericht" };

export default async function Thread({ params }: { params: Promise<{ listing: string; buyer: string }> }) {
  const { listing: listingId, buyer: buyerId } = await params;
  const uuid = /^[0-9a-f-]{36}$/i;
  if (!uuid.test(listingId) || !uuid.test(buyerId)) notFound();
  const { supabase, user } = await requireSession(`/berichten/${listingId}/${buyerId}`);

  const { data: listing } = await supabase.from("listings").select("id, title, brand, seller_id").eq("id", listingId).maybeSingle<Pick<Listing, "id" | "title" | "brand" | "seller_id">>();
  if (!listing) notFound();
  // Alleen de koper zelf of de verkoper van dit artikel.
  if (user.id !== buyerId && user.id !== listing.seller_id) notFound();
  if (buyerId === listing.seller_id) notFound();

  const otherId = user.id === buyerId ? listing.seller_id : buyerId;
  const [{ data: messages }, { data: other }] = await Promise.all([
    many<Message>(supabase.from("messages").select("*").eq("listing_id", listingId).eq("buyer_id", buyerId).order("created_at").limit(500)),
    supabase.from("public_profiles").select("id, display_name").eq("id", otherId).maybeSingle<Pick<PublicProfile, "id" | "display_name">>(),
  ]);

  return (
    <>
      <TopBar title={other?.display_name || "Bericht"} back="/berichten" />
      <main className="stack" style={{ paddingBottom: 220 }}>
        <p className="small muted">Over: {listing.brand ? `${listing.brand}, ` : ""}{listing.title}</p>
        <Chat listingId={listingId} buyerId={buyerId} userId={user.id} initial={messages ?? []} />
      </main>
    </>
  );
}
