// Regels die zowel in de interface als in de database gelden. De database is
// leidend; deze kopie geeft gebruikers direct feedback. tests/parity.test.ts
// controleert dat de lijsten gelijk zijn.

export const RISK_BRANDS = [
  "louis vuitton", "gucci", "prada", "chanel", "hermès", "hermes", "dior", "moncler",
  "canada goose", "rolex", "balenciaga", "stone island", "off-white", "jordan",
  "bottega veneta", "saint laurent", "celine",
] as const;

export function isRiskBrand(brand: string): boolean {
  const b = brand.trim().toLowerCase();
  return b.length > 0 && RISK_BRANDS.some((r) => b.includes(r));
}

const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(nl|com|be|net|org|link|ly|io|me|app)\b)/i;
const PHONE = /(\+31|0031|\b06)[ -]?\d[\d -]{6,}/;
const PAY_WORDS = /(whats ?app|tikkie|betaalverzoek|\biban\b)/i;

export type MessageCheck =
  | { kind: "ok" }
  | { kind: "blocked"; reason: string }
  | { kind: "warning"; reason: string };

export function checkMessage(body: string): MessageCheck {
  if (LINK.test(body)) {
    return { kind: "blocked", reason: "Links kun je hier niet sturen. Oplichters gebruiken nepbetaalpagina's. Betaal altijd via de knop Kopen." };
  }
  if (PHONE.test(body) || PAY_WORDS.test(body)) {
    return { kind: "warning", reason: "Let op: buiten de app betalen of afspreken valt niet onder onze bescherming." };
  }
  return { kind: "ok" };
}

export const CONDITIONS = {
  nieuw_met_label: "Nieuw met label",
  zo_goed_als_nieuw: "Zo goed als nieuw",
  goed: "Goed",
  gedragen: "Gedragen",
} as const;
export type Condition = keyof typeof CONDITIONS;

export const CATEGORIES = {
  dames: "Dames",
  heren: "Heren",
  tassen: "Tassen",
  schoenen: "Schoenen",
  vintage: "Vintage",
} as const;
export type Category = keyof typeof CATEGORIES;

export const DISPUTE_REASONS = {
  not_received: { label: "Niet ontvangen", hint: "Track & trace zegt bezorgd, maar je hebt niets.", needsPhoto: false },
  damaged: { label: "Beschadigd bij bezorging", hint: "Het pakket of artikel is onderweg kapotgegaan.", needsPhoto: true },
  not_as_described: { label: "Niet zoals beschreven", hint: "Schade, vlekken of een andere maat dan in de advertentie.", needsPhoto: true },
  counterfeit: { label: "Ik denk dat het namaak is", hint: "Het merk lijkt niet echt.", needsPhoto: true },
  wrong_item: { label: "Ander artikel ontvangen", hint: "Er zat iets anders in het pakket.", needsPhoto: true },
  fit: { label: "Past niet of bevalt niet", hint: "Kan alleen als de verkoper retour aanbiedt.", needsPhoto: false },
} as const;
export type DisputeReason = keyof typeof DISPUTE_REASONS;

export const DECISIONS = {
  release_to_seller: "Geld naar de verkoper",
  refund_full: "Volledige terugbetaling, koper houdt het artikel",
  refund_partial: "Gedeeltelijke terugbetaling, koper houdt het artikel",
  refund_after_return: "Volledige terugbetaling na retour",
} as const;
export type Decision = keyof typeof DECISIONS;

/** Openbare beslisregels. Elk besluit verwijst naar een nummer uit deze lijst. */
export const RULES: { no: string; text: string }[] = [
  { no: "1.1", text: "Je geld staat vast bij onze betaalpartner tot de koper het artikel heeft goedgekeurd, of tot de controletermijn zonder melding voorbij is." },
  { no: "2.1", text: "Verstuurt de verkoper niet binnen 3 dagen, dan annuleren we automatisch. De koper krijgt alles terug." },
  { no: "3.1", text: "De verkoper krijgt 3 dagen om op een melding te reageren. Daarna beslist een medewerker binnen 2 werkdagen." },
  { no: "4.1", text: "Past niet of bevalt niet: alleen retour als de verkoper dat aanbiedt. De koper betaalt dan de retour." },
  { no: "4.2", text: "Niet zoals beschreven, beschadigd of namaak: terugbetaling, zo nodig na retour van het artikel." },
  { no: "4.3", text: "Niet ontvangen en de vervoerder kan bezorging niet aantonen: volledige terugbetaling." },
  { no: "4.4", text: "Het bewijs laat zien dat het artikel klopt met de advertentie: het geld gaat naar de verkoper." },
  { no: "5.1", text: "Elk besluit noemt wie het nam, waarom, en op welke regel het is gebaseerd." },
  { no: "5.2", text: "Beroep kan binnen 3 dagen. Een andere medewerker beoordeelt het. Dat besluit is definitief." },
  { no: "5.3", text: "Tijdens de beroepstermijn wordt er geen geld bewogen." },
  { no: "6.1", text: "Een account blokkeren we alleen na beoordeling door een mens, met reden en de mogelijkheid om bezwaar te maken." },
  { no: "6.2", text: "Geld van afgeronde orders blijft van jou, ook bij een blokkade. Behalve bij bewezen fraude of een wettelijke plicht." },
];
