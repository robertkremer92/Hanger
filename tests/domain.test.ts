import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { allInCents, feeCents, formatEuro, parseEuroInput, shippingCents } from "../src/lib/domain/money";
import { RISK_BRANDS, checkMessage, isRiskBrand } from "../src/lib/domain/rules";
import { buildTimeline, statusLabel, type OrderLike } from "../src/lib/domain/order-view";
import { timeLeft } from "../src/lib/domain/dates";

test("platformbijdrage: 6% + € 0,50, half naar boven", () => {
  assert.equal(feeCents(4000), 290);
  assert.equal(feeCents(2925), 226); // 175,5 -> 176
  assert.equal(feeCents(100), 56);
  assert.equal(feeCents(42000), 2570);
  assert.equal(allInCents(6400), 6834);
  assert.throws(() => feeCents(12.5));
});

test("bijdrage gelijk aan de database-formule voor alle bedragen tot € 1.000", () => {
  // Database: (price_cents * 6 + 50) / 100 + 50 met integer-deling.
  for (let p = 100; p <= 100_000; p++) {
    assert.equal(feeCents(p), Math.trunc((p * 6 + 50) / 100) + 50);
  }
});

test("verzendkosten", () => {
  assert.equal(shippingCents("postnl"), 395);
  assert.equal(shippingCents("pickup"), 0);
});

test("bedragen invoeren en tonen", () => {
  assert.equal(parseEuroInput("12,50"), 1250);
  assert.equal(parseEuroInput("€ 64"), 6400);
  assert.equal(parseEuroInput("1.250,00"), 125000);
  assert.equal(parseEuroInput("12.5"), 1250);
  assert.equal(parseEuroInput("abc"), null);
  assert.equal(parseEuroInput("12,555"), null);
  assert.match(formatEuro(6834), /68,34/);
});

test("risicomerken: lijst gelijk aan de database", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261103000001_core.sql", import.meta.url), "utf8");
  const block = sql.slice(sql.indexOf("RISK_BRANDS_START"), sql.indexOf("RISK_BRANDS_END"));
  const fromSql = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((x) => x !== "" && x !== undefined);
  assert.deepEqual([...fromSql].sort(), [...RISK_BRANDS].sort());
  assert.ok(isRiskBrand("Louis Vuitton"));
  assert.ok(isRiskBrand("Air Jordan 1"));
  assert.ok(!isRiskBrand("Arket"));
  assert.ok(!isRiskBrand(""));
});

test("berichten: links geblokkeerd, telefoon en betaalwoorden gewaarschuwd", () => {
  assert.equal(checkMessage("Is het nog beschikbaar?").kind, "ok");
  assert.equal(checkMessage("maat 38.5 past").kind, "ok");
  assert.equal(checkMessage("betaal via www.snelbetalen.link").kind, "blocked");
  assert.equal(checkMessage("https://x.y").kind, "blocked");
  assert.equal(checkMessage("kijk op vinted.nl").kind, "blocked");
  assert.equal(checkMessage("app me op 06 12345678").kind, "warning");
  assert.equal(checkMessage("stuur maar een tikkie").kind, "warning");
});

const base: OrderLike = {
  status: "paid", shipping_method: "postnl", total_cents: 7229, price_cents: 6400,
  tracking_code: null, carrier_weight_grams: null, paid_at: "2026-11-03T10:00:00Z",
  ship_by: "2026-11-06T10:00:00Z", shipped_at: null, delivered_at: null, inspect_until: null,
  completed_at: null, cancelled_at: null,
};
const fmt = (s: string) => s.slice(0, 10);
const euro = (c: number) => `€${c / 100}`;

test("tijdlijn: betaald, verkoper moet nog versturen", () => {
  const steps = buildTimeline(base, "seller", fmt, euro);
  assert.deepEqual(steps.map((s) => [s.title, s.state]), [["Betaald", "done"], ["Verstuurd", "now"], ["Afgerond", "todo"]]);
  assert.match(steps[1]!.detail!, /Verstuur vóór 2026-11-06/);
  assert.equal(statusLabel(base, "seller").text, "Nog versturen");
});

test("tijdlijn: verstuurd en gewogen, koper controleert", () => {
  const o: OrderLike = { ...base, status: "shipped", shipped_at: "2026-11-04T10:00:00Z", tracking_code: "3SABC", carrier_weight_grams: 420, inspect_until: "2026-11-14T10:00:00Z" };
  const steps = buildTimeline(o, "buyer", fmt, euro);
  assert.equal(steps[1]!.state, "done");
  assert.match(steps[1]!.detail!, /0,42 kg/);
  assert.equal(steps.at(-1)!.state, "now");
  assert.match(steps.at(-1)!.detail!, /vóór 2026-11-14/);
});

test("tijdlijn: geannuleerd stopt na betaald", () => {
  const o: OrderLike = { ...base, status: "cancelled", cancelled_at: "2026-11-06T10:00:00Z" };
  assert.deepEqual(buildTimeline(o, "buyer", fmt, euro).map((s) => s.title), ["Betaald", "Geannuleerd"]);
});

test("resterende tijd", () => {
  const now = new Date("2026-11-03T10:00:00Z");
  assert.equal(timeLeft("2026-11-06T10:00:00Z", now), "nog 3 dagen");
  assert.equal(timeLeft("2026-11-03T15:30:00Z", now), "nog 5 uur");
  assert.equal(timeLeft("2026-11-03T09:00:00Z", now), "verlopen");
});
