# Hanger

Tweedehands kleding kopen en verkopen, met één belofte: bij een probleem beslist een mens, binnen vaste termijnen, met naam en uitleg.

Next.js 15 (App Router) · Supabase (Postgres, Auth, Storage, Realtime) · Stripe Connect · Cloudflare Workers via OpenNext.

## Wat er in deze versie zit

- **Ontdekken en zoeken** met alles-in prijzen op het gele prijskaartje.
- **Verkopen** na een identiteitscheck bij Stripe (vóór de eerste verkoop, zodat geld later nooit vastzit). Foto's worden in de browser verkleind. Bij risicomerken zijn foto's van label en serie-/datumcode verplicht. Nieuwe verkopers: eerste 14 dagen tot € 250.
- **Kopen** via Stripe Checkout (iDEAL, kaart). Het artikel wordt 35 minuten gereserveerd. Het geld blijft op het platform tot de order is afgerond.
- **Orders** met tijdlijn: verkoper moet binnen 3 dagen versturen, anders automatische annulering en terugbetaling. Koper keurt goed, of na de controletermijn ronden we automatisch af.
- **Geschillen** met bewijs (foto's, video), reactietermijn verkoper, besluit door een medewerker met motivatie en regelnummer, beroep bij een andere medewerker, retourflow.
- **Supportdashboard** met wachtrij op termijn en signalen (claimgeschiedenis van koper en verkoper).
- **Berichten** met realtime updates. Links worden geblokkeerd, telefoonnummers en betaalwoorden gemarkeerd.
- **Reviews** die pas zichtbaar worden als beide partijen er een schreven (of na 14 dagen).

## Hoe het in elkaar zit

Alle regels over geld en status staan in de database, in `supabase/migrations/20261103000001_core.sql`:

- Gebruikers kunnen tabellen alleen lezen volgens RLS. Elke statuswijziging loopt via een `security definer`-functie die controleert wie het mag (`create_order`, `mark_shipped`, `open_dispute`, `decide_dispute`, …).
- Functies bewegen zelf nooit geld. Ze zetten `payout_cents`/`payout_due_at` of `refund_cents`/`refund_due_at`. `src/lib/money.ts` voert dat uit bij Stripe met een idempotency key en legt het Stripe-id vast. Gaat er iets mis, dan probeert de cron het opnieuw.
- `run_deadlines()` bewaakt alle termijnen. `/api/cron` roept die elke 15 minuten aan en verwerkt daarna de geldbewegingen.

## Lokaal draaien

Vereist: Node 20.9+.

```bash
npm install
cp .env.example .env.local   # vul de waarden in, zie hieronder
npm run dev
```

## Eenmalige setup

### 1. Supabase

1. Maak een project (regio Frankfurt of Amsterdam).
2. Voer in de SQL-editor in deze volgorde uit:
   `supabase/migrations/20261103000001_core.sql` en `supabase/migrations/20261103000002_storage.sql`.
   (Of met de CLI: `supabase link` en `supabase db push`.)
3. Authentication → URL Configuration:
   - Site URL: je productie-URL.
   - Redirect URLs: `http://localhost:3000/auth/callback` en `https://JOUW-DOMEIN/auth/callback`.
4. Authentication → Email Templates: zet bij **Confirm signup** én **Magic Link** de link op
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`
   (dan werkt de link ook in de ingebouwde browser van een mail-app).
5. Database → Replication: zet `messages` aan voor Realtime (de migratie probeert dit al).
6. Kopieer Project URL, `anon` key en `service_role` key naar je env.
7. Maak jezelf medewerker nadat je een account hebt:
   ```sql
   update public.profiles set is_support = true where id = (select id from auth.users where email = 'jij@voorbeeld.nl');
   ```

### 2. Stripe (testmodus)

1. Zet **Connect** aan (Settings → Connect). Kies Express-accounts, land Nederland.
2. Zet iDEAL aan bij Payment methods.
3. Developers → API keys: zet de secret key in `STRIPE_SECRET_KEY`.
4. Developers → Webhooks → endpoint `https://JOUW-DOMEIN/api/stripe/webhook`, met deze events:
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `account.updated`.
   Vink bij `account.updated` ook "Connected accounts" aan. Zet de signing secret in `STRIPE_WEBHOOK_SECRET`.
5. Lokaal testen: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.

### 3. Cloudflare

```bash
npx wrangler login
npm run deploy
```

Zet daarna in Cloudflare (Workers → hanger → Settings → Variables) de server-variabelen als **secret**:
`SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CRON_SECRET`.
De `NEXT_PUBLIC_*`-waarden moeten bij het bouwen in `.env.local` (of `.env.production`) staan.

Of via de terminal:
```bash
npx wrangler secret put STRIPE_SECRET_KEY
```

### 4. Termijnen laten lopen

Open `supabase/cron.sql`, vul je domein en `CRON_SECRET` in en voer het uit in de Supabase SQL-editor. Elke 15 minuten worden dan termijnen bewaakt en uit- en terugbetalingen verwerkt.

## Testen

```bash
npm test          # bedrijfsregels: bijdrage, berichtfilter, tijdlijn, gelijkheid met de database
npm run test:db   # alle statusovergangen tegen een lokale Postgres (PGHOST/PGPORT/PGUSER instellen)
npm run typecheck
```

`test:db` draait de migraties met een nagebootste `auth`/`storage` en doorloopt kopen, annuleren, verlopen reservering, geschil met beroep en retour, gedeeltelijke terugbetaling, automatische afronding, berichtenfilter en de rechten van buitenstaanders.

## Bewuste keuzes en wat nog komt

- **Bezorgstatus**: er is nog geen koppeling met een vervoerder. Na verzending heeft de koper 10 dagen om te melden. `mark_delivered()` staat klaar voor een Sendcloud-webhook; die zet de termijn op 3 dagen na bezorging en legt het gewicht vast.
- **Retourlabels** worden nog niet automatisch aangemaakt. De koper verstuurt zelf en vult de track & trace in.
- **Koper-ID-check** bij dure aankopen of na meerdere claims: nog niet. Support ziet wel de claimgeschiedenis.
- **Inloggen in twee stappen**: Supabase ondersteunt TOTP; nog niet in de interface.
- **Belgische (Franstalige) versie**: alle teksten zijn nu Nederlands.
- **DAC7-rapportage**: gegevens zitten in Stripe en de `orders`-tabel; een export volgt.
