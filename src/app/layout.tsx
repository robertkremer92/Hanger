import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import { TabBar } from "@/components/TabBar";
import { getSession } from "@/lib/auth";
import "./globals.css";

const font = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Hanger", template: "%s · Hanger" },
  description: "Tweedehands kleding kopen en verkopen. Bij een probleem beslist een mens.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#2D3BFF" },
    { media: "(prefers-color-scheme: dark)", color: "#0E0E1C" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  let todo = 0;
  if (session) {
    const uid = session.user.id;
    const [{ count: toShip }, { count: disputes }] = await Promise.all([
      session.supabase.from("orders").select("id", { count: "exact", head: true }).eq("seller_id", uid).eq("status", "paid"),
      session.supabase.from("disputes").select("id, orders!inner(seller_id)", { count: "exact", head: true })
        .eq("status", "awaiting_seller").eq("orders.seller_id", uid),
    ]);
    todo = (toShip ?? 0) + (disputes ?? 0);
  }
  return (
    <html lang="nl" className={font.variable}>
      <body>
        <div className="app">
          {children}
          <TabBar todo={todo} />
        </div>
      </body>
    </html>
  );
}
