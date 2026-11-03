import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processMoney } from "@/lib/money";
import { env } from "@/lib/env";

/**
 * Bewaakt alle termijnen en voert geldbewegingen uit. Elke 15 minuten aanroepen
 * met de header "Authorization: Bearer <CRON_SECRET>" (zie supabase/cron.sql).
 */
export async function POST(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${env.cronSecret()}`;
  if (!timingSafeEqual(auth, expected)) return NextResponse.json({ error: "Niet toegestaan" }, { status: 401 });

  const db = createAdminClient();
  const { data: deadlines, error } = await db.rpc("run_deadlines");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const money = await processMoney();
  if (money.errors.length) console.error("cron money", money.errors);
  return NextResponse.json({ deadlines, money });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
