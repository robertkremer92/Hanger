-- Hanger: kernschema
-- Alle statusovergangen lopen via functies in dit bestand. Clients mogen tabellen
-- lezen volgens RLS, maar nooit zelf een status of bedrag wijzigen.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type listing_status as enum ('draft', 'active', 'reserved', 'sold', 'removed');
create type listing_condition as enum ('nieuw_met_label', 'zo_goed_als_nieuw', 'goed', 'gedragen');
create type listing_category as enum ('dames', 'heren', 'tassen', 'schoenen', 'vintage');
create type photo_kind as enum ('main', 'label', 'serial');
create type shipping_method as enum ('postnl', 'dhl', 'pickup');
create type order_status as enum (
  'pending_payment', 'expired', 'paid', 'shipped', 'completed',
  'cancelled', 'disputed', 'return_pending', 'refunded'
);
create type dispute_reason as enum ('not_received', 'damaged', 'not_as_described', 'counterfeit', 'wrong_item', 'fit');
create type dispute_status as enum ('awaiting_seller', 'awaiting_review', 'decided', 'appealed', 'final');
create type dispute_decision as enum ('release_to_seller', 'refund_full', 'refund_partial', 'refund_after_return');

-- ---------------------------------------------------------------------------
-- Regels als functies (moeten gelijk blijven aan src/lib/domain/*.ts)
-- ---------------------------------------------------------------------------

-- Platformbijdrage: 6% + 50 cent, afgerond op hele centen (half naar boven).
create or replace function public.fee_cents(price_cents integer)
returns integer language sql immutable as $$
  select (price_cents * 6 + 50) / 100 + 50
$$;

create or replace function public.shipping_cents(m shipping_method)
returns integer language sql immutable as $$
  select case m when 'postnl' then 395 when 'dhl' then 525 else 0 end
$$;

-- Werkdagen optellen (za/zo overslaan, Nederlandse tijd).
create or replace function public.add_workdays(start_at timestamptz, n integer)
returns timestamptz language plpgsql immutable as $$
declare
  t timestamptz := start_at;
  left_ integer := n;
begin
  while left_ > 0 loop
    t := t + interval '1 day';
    if extract(isodow from (t at time zone 'Europe/Amsterdam')) < 6 then
      left_ := left_ - 1;
    end if;
  end loop;
  return t;
end $$;

-- Merken waarbij een foto van het label en de serie-/datumcode verplicht is.
-- RISK_BRANDS_START
create or replace function public.is_risk_brand(brand text)
returns boolean language sql immutable as $$
  select exists (
    select 1 from unnest(array[
      'louis vuitton','gucci','prada','chanel','hermès','hermes','dior','moncler',
      'canada goose','rolex','balenciaga','stone island','off-white','jordan',
      'bottega veneta','saint laurent','celine'
    ]) b
    where position(b in lower(coalesce(brand, ''))) > 0
  )
$$;
-- RISK_BRANDS_END

-- Links zijn nooit toegestaan in berichten (phishing). Telefoonnummers en
-- betaalwoorden worden gemarkeerd, niet geblokkeerd.
create or replace function public.message_has_link(body text)
returns boolean language sql immutable as $$
  select body ~* '(https?://|www\.|\m[a-z0-9-]+\.(nl|com|be|net|org|link|ly|io|me|app)\M)'
$$;
create or replace function public.message_is_suspicious(body text)
returns boolean language sql immutable as $$
  select body ~* '(\+31|0031|\m06)[ -]?[0-9][0-9 -]{6,}'
      or body ~* '(whats ?app|tikkie|betaalverzoek|\miban\M)'
$$;

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 40),
  city text not null default '' check (char_length(city) <= 60),
  is_support boolean not null default false,
  stripe_account_id text unique,
  payouts_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 3 and 60),
  brand text not null default '' check (char_length(brand) <= 40),
  size text not null check (char_length(size) between 1 and 20),
  condition listing_condition not null,
  category listing_category not null,
  description text not null default '' check (char_length(description) <= 2000),
  price_cents integer not null check (price_cents between 100 and 1000000),
  allows_fit_returns boolean not null default false,
  allows_pickup boolean not null default false,
  pickup_city text not null default '',
  risk_brand boolean not null default false,
  status listing_status not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now()
);
create index listings_feed_idx on public.listings (status, published_at desc);
create index listings_seller_idx on public.listings (seller_id);

create table public.listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  path text not null,
  kind photo_kind not null default 'main',
  position smallint not null default 0,
  created_at timestamptz not null default now()
);
create index listing_photos_listing_idx on public.listing_photos (listing_id, kind, position);

create sequence public.order_number_seq start 2001;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  number integer not null unique default nextval('public.order_number_seq'),
  listing_id uuid not null references public.listings (id),
  buyer_id uuid not null references public.profiles (id),
  seller_id uuid not null references public.profiles (id),
  price_cents integer not null,
  fee_cents integer not null,
  shipping_cents integer not null,
  total_cents integer generated always as (price_cents + fee_cents + shipping_cents) stored,
  shipping_method shipping_method not null,
  status order_status not null default 'pending_payment',
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  stripe_charge_id text,
  tracking_code text,
  carrier_weight_grams integer,
  reserved_until timestamptz not null default now() + interval '35 minutes',
  paid_at timestamptz,
  ship_by timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  inspect_until timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  -- Geldbewegingen: functies zetten wat er moet gebeuren, de server voert het
  -- uit bij Stripe en legt het id vast. Zo gaat er nooit iets dubbel.
  payout_cents integer not null default 0,
  payout_due_at timestamptz,
  stripe_transfer_id text,
  refund_cents integer not null default 0,
  refund_due_at timestamptz,
  stripe_refund_id text,
  created_at timestamptz not null default now(),
  check (buyer_id <> seller_id)
);
create index orders_buyer_idx on public.orders (buyer_id, created_at desc);
create index orders_seller_idx on public.orders (seller_id, created_at desc);
create unique index orders_one_open_per_listing on public.orders (listing_id)
  where status not in ('expired', 'cancelled', 'refunded');

create table public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  actor_id uuid references public.profiles (id),
  type text not null,
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index order_events_order_idx on public.order_events (order_id, created_at);

create table public.disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders (id) on delete cascade,
  opened_by uuid not null references public.profiles (id),
  reason dispute_reason not null,
  description text not null check (char_length(description) between 20 and 3000),
  status dispute_status not null default 'awaiting_seller',
  seller_respond_by timestamptz not null,
  seller_response text check (char_length(seller_response) <= 3000),
  seller_responded_at timestamptz,
  decide_by timestamptz,
  decision dispute_decision,
  decision_refund_cents integer,
  decision_motivation text,
  decision_rule text,
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  appeal_until timestamptz,
  appealed_by uuid references public.profiles (id),
  appeal_text text check (char_length(appeal_text) <= 3000),
  appealed_at timestamptz,
  appeal_decided_by uuid references public.profiles (id),
  appeal_decided_at timestamptz,
  appeal_motivation text,
  finalized_at timestamptz,
  return_tracking_code text,
  return_shipped_at timestamptz,
  return_received_at timestamptz,
  created_at timestamptz not null default now()
);
create index disputes_queue_idx on public.disputes (status, decide_by);

create table public.dispute_evidence (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.disputes (id) on delete cascade,
  uploaded_by uuid not null references public.profiles (id),
  path text not null,
  kind text not null default 'photo' check (kind in ('photo', 'video')),
  created_at timestamptz not null default now()
);

create table public.messages (
  id bigint generated always as identity primary key,
  listing_id uuid not null references public.listings (id) on delete cascade,
  buyer_id uuid not null references public.profiles (id),
  sender_id uuid not null references public.profiles (id),
  body text not null check (char_length(body) between 1 and 1000),
  flagged boolean not null default false,
  created_at timestamptz not null default now()
);
create index messages_thread_idx on public.messages (listing_id, buyer_id, created_at);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  subject_id uuid not null references public.profiles (id),
  rating smallint not null check (rating between 1 and 5),
  body text not null default '' check (char_length(body) <= 1000),
  created_at timestamptz not null default now(),
  unique (order_id, author_id)
);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Nieuw account -> profiel.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(split_part(new.email, '@', 1), ''));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Risicomerk wordt altijd door de database bepaald, nooit door de client.
create or replace function public.listings_set_risk()
returns trigger language plpgsql as $$
begin
  new.risk_brand := public.is_risk_brand(new.brand);
  return new;
end $$;
create trigger listings_set_risk before insert or update of brand on public.listings
  for each row execute function public.listings_set_risk();

-- Berichten: links blokkeren, verdachte inhoud markeren.
create or replace function public.messages_check()
returns trigger language plpgsql as $$
begin
  if public.message_has_link(new.body) then
    raise exception 'Links kun je niet versturen. Betaal altijd via de knop Kopen.'
      using errcode = 'P0001', hint = 'link_blocked';
  end if;
  new.flagged := public.message_is_suspicious(new.body);
  return new;
end $$;
create trigger messages_check before insert on public.messages
  for each row execute function public.messages_check();

-- ---------------------------------------------------------------------------
-- Hulpfuncties
-- ---------------------------------------------------------------------------
create or replace function public.is_support()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_support from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.log_event(o uuid, kind text, payload jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into public.order_events (order_id, actor_id, type, data) values (o, auth.uid(), kind, payload);
$$;

create or replace function public.fail(msg text)
returns void language plpgsql as $$
begin
  raise exception '%', msg using errcode = 'P0001';
end $$;

-- ---------------------------------------------------------------------------
-- Advertenties
-- ---------------------------------------------------------------------------

-- Nieuwe verkopers mogen de eerste 14 dagen artikelen tot € 250 plaatsen.
create or replace function public.publish_listing(p_listing uuid)
returns public.listings language plpgsql security definer set search_path = public as $$
declare
  l public.listings;
  p public.profiles;
begin
  select * into l from public.listings where id = p_listing for update;
  if l.id is null or l.seller_id <> auth.uid() then perform public.fail('Advertentie niet gevonden.'); end if;
  if l.status <> 'draft' then perform public.fail('Deze advertentie is al geplaatst.'); end if;

  select * into p from public.profiles where id = auth.uid();
  if not p.payouts_enabled then
    perform public.fail('Rond eerst de identiteitscheck af bij Profiel. Daarna kun je verkopen.');
  end if;
  if p.created_at > now() - interval '14 days' and l.price_cents > 25000 then
    perform public.fail('De eerste 14 dagen kun je artikelen tot € 250 plaatsen.');
  end if;
  if not exists (select 1 from public.listing_photos where listing_id = l.id and kind = 'main') then
    perform public.fail('Voeg minstens één foto toe.');
  end if;
  if l.risk_brand and (
    not exists (select 1 from public.listing_photos where listing_id = l.id and kind = 'label')
    or not exists (select 1 from public.listing_photos where listing_id = l.id and kind = 'serial')
  ) then
    perform public.fail('Voor dit merk zijn een foto van het label en van de serie- of datumcode verplicht.');
  end if;
  if l.allows_pickup and coalesce(l.pickup_city, '') = '' then
    perform public.fail('Vul de plaats in waar het artikel opgehaald kan worden.');
  end if;

  update public.listings set status = 'active', published_at = now() where id = l.id returning * into l;
  return l;
end $$;

create or replace function public.remove_listing(p_listing uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.listings set status = 'removed'
  where id = p_listing and seller_id = auth.uid() and status in ('draft', 'active');
  if not found then perform public.fail('Deze advertentie kun je nu niet verwijderen.'); end if;
end $$;

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------

-- Koper start een bestelling. Het artikel wordt 30 minuten gereserveerd.
create or replace function public.create_order(p_listing uuid, p_shipping shipping_method)
returns public.orders language plpgsql security definer set search_path = public as $$
declare
  l public.listings;
  o public.orders;
begin
  if auth.uid() is null then perform public.fail('Log in om te kopen.'); end if;

  -- Verlopen reserveringen eerst vrijgeven.
  perform public.release_expired_reservations();

  select * into l from public.listings where id = p_listing for update;
  if l.id is null or l.status <> 'active' then perform public.fail('Dit artikel is niet meer beschikbaar.'); end if;
  if l.seller_id = auth.uid() then perform public.fail('Je kunt je eigen artikel niet kopen.'); end if;
  if p_shipping = 'pickup' and not l.allows_pickup then perform public.fail('Ophalen kan niet bij dit artikel.'); end if;

  insert into public.orders (listing_id, buyer_id, seller_id, price_cents, fee_cents, shipping_cents, shipping_method)
  values (l.id, auth.uid(), l.seller_id, l.price_cents, public.fee_cents(l.price_cents), public.shipping_cents(p_shipping), p_shipping)
  returning * into o;

  update public.listings set status = 'reserved' where id = l.id;
  perform public.log_event(o.id, 'created');
  return o;
end $$;

-- Server (webhook): betaling gelukt.
create or replace function public.mark_order_paid(p_order uuid, p_payment_intent text, p_charge text)
returns public.orders language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null then perform public.fail('Order niet gevonden.'); end if;
  if o.status = 'paid' or o.paid_at is not null then return o; end if; -- idempotent
  if o.status not in ('pending_payment', 'expired') then perform public.fail('Order kan niet meer betaald worden.'); end if;

  -- Een betaling die binnenkomt na het verlopen van de reservering: alleen
  -- accepteren als het artikel nog vrij is. Anders direct terugbetalen.
  if o.status = 'expired' then
    if exists (select 1 from public.listings where id = o.listing_id and status = 'active') then
      update public.listings set status = 'reserved' where id = o.listing_id;
    else
      update public.orders set
        stripe_payment_intent_id = p_payment_intent, stripe_charge_id = p_charge,
        status = 'refunded', paid_at = now(), cancelled_at = now(),
        refund_cents = o.total_cents, refund_due_at = now()
      where id = o.id returning * into o;
      insert into public.order_events (order_id, type, data) values (o.id, 'paid_after_expiry_refunded', '{}');
      return o;
    end if;
  end if;

  update public.orders set
    status = 'paid', paid_at = now(), ship_by = now() + interval '3 days',
    stripe_payment_intent_id = p_payment_intent, stripe_charge_id = p_charge
  where id = o.id returning * into o;
  update public.listings set status = 'sold' where id = o.listing_id;
  insert into public.order_events (order_id, type) values (o.id, 'paid');
  return o;
end $$;

create or replace function public.release_expired_reservations()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with expired as (
    update public.orders set status = 'expired'
    where status = 'pending_payment' and reserved_until < now()
    returning listing_id
  )
  update public.listings l set status = 'active'
  from expired e where l.id = e.listing_id and l.status = 'reserved';
  get diagnostics n = row_count;
  return n;
end $$;

-- Server (webhook): Checkout-sessie verlopen of afgebroken.
create or replace function public.expire_order(p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.orders set status = 'expired' where id = p_order and status = 'pending_payment';
  if found then
    update public.listings set status = 'active'
    where id = (select listing_id from public.orders where id = p_order) and status = 'reserved';
  end if;
end $$;

-- Verkoper: verstuurd.
create or replace function public.mark_shipped(p_order uuid, p_tracking text)
returns public.orders language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null or o.seller_id <> auth.uid() then perform public.fail('Order niet gevonden.'); end if;
  if o.status <> 'paid' then perform public.fail('Deze order kan nu niet als verstuurd worden gemarkeerd.'); end if;
  if o.shipping_method <> 'pickup' and char_length(coalesce(trim(p_tracking), '')) < 6 then
    perform public.fail('Vul een geldige track & trace-code in.');
  end if;
  update public.orders set status = 'shipped', shipped_at = now(), tracking_code = nullif(trim(p_tracking), ''),
    inspect_until = now() + interval '10 days'
  where id = o.id returning * into o;
  perform public.log_event(o.id, 'shipped', jsonb_build_object('tracking', o.tracking_code));
  return o;
end $$;

-- Server (vervoerder-webhook, later Sendcloud): bezorgd. Koper heeft dan 3 dagen.
create or replace function public.mark_delivered(p_order uuid, p_weight_grams integer default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.orders set delivered_at = now(), inspect_until = now() + interval '3 days',
    carrier_weight_grams = coalesce(p_weight_grams, carrier_weight_grams)
  where id = p_order and status = 'shipped' and delivered_at is null;
  if found then insert into public.order_events (order_id, type) values (p_order, 'delivered'); end if;
end $$;

-- Koper: alles klopt.
create or replace function public.confirm_order(p_order uuid)
returns public.orders language plpgsql security definer set search_path = public as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null or o.buyer_id <> auth.uid() then perform public.fail('Order niet gevonden.'); end if;
  if o.status <> 'shipped' then perform public.fail('Deze order kun je nu niet afronden.'); end if;
  update public.orders set status = 'completed', completed_at = now(),
    payout_cents = price_cents, payout_due_at = now()
  where id = o.id returning * into o;
  perform public.log_event(o.id, 'confirmed');
  return o;
end $$;

-- ---------------------------------------------------------------------------
-- Geschillen
-- ---------------------------------------------------------------------------
create or replace function public.open_dispute(p_order uuid, p_reason dispute_reason, p_description text)
returns public.disputes language plpgsql security definer set search_path = public as $$
declare
  o public.orders;
  l public.listings;
  d public.disputes;
begin
  select * into o from public.orders where id = p_order for update;
  if o.id is null or o.buyer_id <> auth.uid() then perform public.fail('Order niet gevonden.'); end if;
  if o.status <> 'shipped' then perform public.fail('Voor deze order kun je nu geen probleem melden.'); end if;
  if o.inspect_until is not null and now() > o.inspect_until then
    perform public.fail('De termijn om een probleem te melden is verlopen.');
  end if;
  select * into l from public.listings where id = o.listing_id;
  if p_reason = 'fit' and not l.allows_fit_returns then
    perform public.fail('Deze verkoper biedt geen retour aan als het niet past.');
  end if;
  if char_length(coalesce(trim(p_description), '')) < 20 then
    perform public.fail('Beschrijf het probleem in minstens 20 tekens.');
  end if;

  insert into public.disputes (order_id, opened_by, reason, description, seller_respond_by)
  values (o.id, auth.uid(), p_reason, trim(p_description), now() + interval '3 days')
  returning * into d;
  update public.orders set status = 'disputed' where id = o.id;
  perform public.log_event(o.id, 'dispute_opened', jsonb_build_object('reason', p_reason));
  return d;
end $$;

create or replace function public.respond_dispute(p_dispute uuid, p_response text)
returns public.disputes language plpgsql security definer set search_path = public as $$
declare d public.disputes; o public.orders;
begin
  select * into d from public.disputes where id = p_dispute for update;
  select * into o from public.orders where id = d.order_id;
  if d.id is null or o.seller_id <> auth.uid() then perform public.fail('Geschil niet gevonden.'); end if;
  if d.status <> 'awaiting_seller' then perform public.fail('Je kunt niet meer reageren op dit geschil.'); end if;
  if char_length(coalesce(trim(p_response), '')) < 10 then perform public.fail('Schrijf een reactie van minstens 10 tekens.'); end if;
  update public.disputes set seller_response = trim(p_response), seller_responded_at = now(),
    status = 'awaiting_review', decide_by = public.add_workdays(now(), 2)
  where id = d.id returning * into d;
  perform public.log_event(o.id, 'dispute_seller_responded');
  return d;
end $$;

-- Verkoper lost het zelf op door alles terug te betalen. Geen medewerker nodig.
create or replace function public.seller_accept_refund(p_dispute uuid)
returns public.disputes language plpgsql security definer set search_path = public as $$
declare d public.disputes; o public.orders;
begin
  select * into d from public.disputes where id = p_dispute for update;
  select * into o from public.orders where id = d.order_id;
  if d.id is null or o.seller_id <> auth.uid() then perform public.fail('Geschil niet gevonden.'); end if;
  if d.status not in ('awaiting_seller', 'awaiting_review') then perform public.fail('Dit geschil is al beslist.'); end if;
  update public.disputes set status = 'final', decision = 'refund_full', decision_refund_cents = o.total_cents,
    decision_motivation = 'De verkoper heeft zelf voorgesteld om volledig terug te betalen.',
    decision_rule = '4.2', decided_at = now(), finalized_at = now()
  where id = d.id returning * into d;
  perform public.apply_decision(d.id);
  perform public.log_event(o.id, 'dispute_seller_refunded');
  return d;
end $$;

-- Intern: besluit uitvoeren zodra het definitief is.
create or replace function public.apply_decision(p_dispute uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d public.disputes; o public.orders; r integer;
begin
  select * into d from public.disputes where id = p_dispute;
  select * into o from public.orders where id = d.order_id for update;
  if d.status <> 'final' then perform public.fail('Besluit is nog niet definitief.'); end if;

  if d.decision = 'release_to_seller' then
    update public.orders set status = 'completed', completed_at = now(), payout_cents = price_cents, payout_due_at = now() where id = o.id;
  elsif d.decision = 'refund_full' then
    update public.orders set status = 'refunded', refund_cents = total_cents, refund_due_at = now() where id = o.id;
  elsif d.decision = 'refund_partial' then
    r := least(greatest(coalesce(d.decision_refund_cents, 0), 0), o.total_cents);
    update public.orders set status = 'completed', completed_at = now(),
      refund_cents = r, refund_due_at = now(),
      payout_cents = greatest(o.price_cents - r, 0), payout_due_at = now()
    where id = o.id;
  elsif d.decision = 'refund_after_return' then
    update public.orders set status = 'return_pending' where id = o.id;
  end if;
  insert into public.order_events (order_id, type, data) values (o.id, 'decision_applied', jsonb_build_object('decision', d.decision));
end $$;

-- Medewerker: besluit, met motivatie en regel.
create or replace function public.decide_dispute(
  p_dispute uuid, p_decision dispute_decision, p_refund_cents integer, p_motivation text, p_rule text
) returns public.disputes language plpgsql security definer set search_path = public as $$
declare d public.disputes; o public.orders;
begin
  if not public.is_support() then perform public.fail('Alleen medewerkers kunnen beslissen.'); end if;
  select * into d from public.disputes where id = p_dispute for update;
  select * into o from public.orders where id = d.order_id;
  if d.id is null then perform public.fail('Geschil niet gevonden.'); end if;
  if d.status not in ('awaiting_review', 'appealed') then perform public.fail('Dit geschil wacht niet op een besluit.'); end if;
  if char_length(coalesce(trim(p_motivation), '')) < 30 then perform public.fail('Schrijf een motivatie van minstens 30 tekens.'); end if;
  if coalesce(trim(p_rule), '') = '' then perform public.fail('Noem de regel waarop het besluit is gebaseerd.'); end if;
  if p_decision = 'refund_partial' and (p_refund_cents is null or p_refund_cents <= 0 or p_refund_cents >= o.total_cents) then
    perform public.fail('Een gedeeltelijke terugbetaling ligt tussen € 0 en het totaalbedrag.');
  end if;

  if d.status = 'awaiting_review' then
    update public.disputes set status = 'decided', decision = p_decision,
      decision_refund_cents = case when p_decision = 'refund_partial' then p_refund_cents end,
      decision_motivation = trim(p_motivation), decision_rule = trim(p_rule),
      decided_by = auth.uid(), decided_at = now(), appeal_until = now() + interval '3 days'
    where id = d.id returning * into d;
    perform public.log_event(o.id, 'dispute_decided', jsonb_build_object('decision', p_decision));
  else
    if d.decided_by = auth.uid() then
      perform public.fail('Een beroep wordt beoordeeld door een andere medewerker dan het eerste besluit.');
    end if;
    update public.disputes set status = 'final', decision = p_decision,
      decision_refund_cents = case when p_decision = 'refund_partial' then p_refund_cents end,
      appeal_motivation = trim(p_motivation), decision_rule = trim(p_rule),
      appeal_decided_by = auth.uid(), appeal_decided_at = now(), finalized_at = now()
    where id = d.id returning * into d;
    perform public.apply_decision(d.id);
    perform public.log_event(o.id, 'dispute_appeal_decided', jsonb_build_object('decision', p_decision));
  end if;
  return d;
end $$;

create or replace function public.appeal_dispute(p_dispute uuid, p_text text)
returns public.disputes language plpgsql security definer set search_path = public as $$
declare d public.disputes; o public.orders;
begin
  select * into d from public.disputes where id = p_dispute for update;
  select * into o from public.orders where id = d.order_id;
  if d.id is null or auth.uid() not in (o.buyer_id, o.seller_id) then perform public.fail('Geschil niet gevonden.'); end if;
  if d.status <> 'decided' then perform public.fail('Tegen dit geschil kun je nu geen beroep instellen.'); end if;
  if now() > d.appeal_until then perform public.fail('De termijn voor beroep is verlopen.'); end if;
  if char_length(coalesce(trim(p_text), '')) < 20 then perform public.fail('Leg in minstens 20 tekens uit waarom je het niet eens bent.'); end if;
  update public.disputes set status = 'appealed', appealed_by = auth.uid(), appeal_text = trim(p_text),
    appealed_at = now(), decide_by = public.add_workdays(now(), 2)
  where id = d.id returning * into d;
  perform public.log_event(o.id, 'dispute_appealed');
  return d;
end $$;

-- Koper: retour verstuurd.
create or replace function public.submit_return(p_dispute uuid, p_tracking text)
returns public.disputes language plpgsql security definer set search_path = public as $$
declare d public.disputes; o public.orders;
begin
  select * into d from public.disputes where id = p_dispute for update;
  select * into o from public.orders where id = d.order_id;
  if d.id is null or o.buyer_id <> auth.uid() then perform public.fail('Geschil niet gevonden.'); end if;
  if o.status <> 'return_pending' or d.return_shipped_at is not null then perform public.fail('Er wordt nu geen retour verwacht.'); end if;
  if char_length(coalesce(trim(p_tracking), '')) < 6 then perform public.fail('Vul een geldige track & trace-code in.'); end if;
  update public.disputes set return_tracking_code = trim(p_tracking), return_shipped_at = now()
  where id = d.id returning * into d;
  perform public.log_event(o.id, 'return_shipped', jsonb_build_object('tracking', trim(p_tracking)));
  return d;
end $$;

-- Verkoper: retour ontvangen -> koper krijgt alles terug.
create or replace function public.confirm_return(p_dispute uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d public.disputes; o public.orders;
begin
  select * into d from public.disputes where id = p_dispute for update;
  select * into o from public.orders where id = d.order_id for update;
  if d.id is null or o.seller_id <> auth.uid() then perform public.fail('Geschil niet gevonden.'); end if;
  if o.status <> 'return_pending' or d.return_shipped_at is null then perform public.fail('Er is nog geen retour verstuurd.'); end if;
  update public.disputes set return_received_at = now() where id = d.id;
  update public.orders set status = 'refunded', refund_cents = total_cents, refund_due_at = now() where id = o.id;
  perform public.log_event(o.id, 'return_received');
end $$;

-- ---------------------------------------------------------------------------
-- Reviews: pas zichtbaar als beide partijen er een schreven, of na 14 dagen.
-- ---------------------------------------------------------------------------
create or replace function public.leave_review(p_order uuid, p_rating integer, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare o public.orders; subject uuid;
begin
  select * into o from public.orders where id = p_order;
  if o.id is null or auth.uid() not in (o.buyer_id, o.seller_id) then perform public.fail('Order niet gevonden.'); end if;
  if o.status not in ('completed', 'refunded') then perform public.fail('Je kunt een review geven als de order is afgerond.'); end if;
  subject := case when auth.uid() = o.buyer_id then o.seller_id else o.buyer_id end;
  insert into public.reviews (order_id, author_id, subject_id, rating, body)
  values (o.id, auth.uid(), subject, p_rating, coalesce(trim(p_body), ''));
exception when unique_violation then
  perform public.fail('Je hebt voor deze order al een review gegeven.');
end $$;

create or replace function public.review_visible(r public.reviews)
returns boolean language sql stable security definer set search_path = public as $$
  select r.author_id = auth.uid()
      or r.created_at < now() - interval '14 days'
      or exists (select 1 from public.reviews x where x.order_id = r.order_id and x.author_id <> r.author_id)
$$;

-- ---------------------------------------------------------------------------
-- Termijnen bewaken (elke 15 minuten via /api/cron of pg_cron)
-- ---------------------------------------------------------------------------
create or replace function public.run_deadlines()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  n_expired integer; n_cancelled integer; n_completed integer;
  n_review integer; n_final integer; n_return integer; n_noreturn integer;
  d record;
begin
  n_expired := public.release_expired_reservations();

  -- Niet verstuurd binnen 3 dagen: annuleren, koper krijgt alles terug.
  with c as (
    update public.orders set status = 'cancelled', cancelled_at = now(),
      refund_cents = total_cents, refund_due_at = now()
    where status = 'paid' and ship_by < now()
    returning id, listing_id
  ), ev as (
    insert into public.order_events (order_id, type) select id, 'auto_cancelled_not_shipped' from c
  )
  update public.listings l set status = 'active' from c where l.id = c.listing_id;
  get diagnostics n_cancelled = row_count;

  -- Geen melding binnen de controletermijn: automatisch afronden.
  with c as (
    update public.orders set status = 'completed', completed_at = now(),
      payout_cents = price_cents, payout_due_at = now()
    where status = 'shipped' and inspect_until < now()
    returning id
  )
  insert into public.order_events (order_id, type) select id, 'auto_completed' from c;
  get diagnostics n_completed = row_count;

  -- Verkoper reageerde niet: door naar een medewerker.
  update public.disputes set status = 'awaiting_review', decide_by = public.add_workdays(now(), 2)
  where status = 'awaiting_seller' and seller_respond_by < now();
  get diagnostics n_review = row_count;

  -- Geen beroep binnen 3 dagen: besluit wordt definitief en uitgevoerd.
  n_final := 0;
  for d in select id from public.disputes where status = 'decided' and appeal_until < now() for update loop
    update public.disputes set status = 'final', finalized_at = now() where id = d.id;
    perform public.apply_decision(d.id);
    n_final := n_final + 1;
  end loop;

  -- Retour verstuurd, verkoper bevestigt niet binnen 7 dagen: koper krijgt geld terug.
  with r as (
    update public.orders o set status = 'refunded', refund_cents = o.total_cents, refund_due_at = now()
    from public.disputes ds
    where ds.order_id = o.id and o.status = 'return_pending'
      and ds.return_shipped_at is not null and ds.return_shipped_at < now() - interval '7 days'
    returning o.id
  )
  insert into public.order_events (order_id, type) select id, 'auto_refunded_return' from r;
  get diagnostics n_return = row_count;

  -- Koper stuurt de retour niet binnen 7 dagen terug: verkoper krijgt het geld.
  with r as (
    update public.orders o set status = 'completed', completed_at = now(), payout_cents = o.price_cents, payout_due_at = now()
    from public.disputes ds
    where ds.order_id = o.id and o.status = 'return_pending'
      and ds.return_shipped_at is null and ds.finalized_at < now() - interval '7 days'
    returning o.id
  )
  insert into public.order_events (order_id, type) select id, 'auto_released_no_return' from r;
  get diagnostics n_noreturn = row_count;

  return jsonb_build_object('expired', n_expired, 'cancelled', n_cancelled, 'completed', n_completed,
    'to_review', n_review, 'finalized', n_final, 'refunded_after_return', n_return, 'released_no_return', n_noreturn);
end $$;

-- Server: geldbewegingen vastleggen na uitvoering bij Stripe.
create or replace function public.record_transfer(p_order uuid, p_transfer text)
returns void language sql security definer set search_path = public as $$
  update public.orders set stripe_transfer_id = p_transfer where id = p_order and stripe_transfer_id is null;
  insert into public.order_events (order_id, type, data) values (p_order, 'payout_sent', jsonb_build_object('transfer', p_transfer));
$$;
create or replace function public.record_refund(p_order uuid, p_refund text)
returns void language sql security definer set search_path = public as $$
  update public.orders set stripe_refund_id = p_refund where id = p_order and stripe_refund_id is null;
  insert into public.order_events (order_id, type, data) values (p_order, 'refund_sent', jsonb_build_object('refund', p_refund));
$$;

-- ---------------------------------------------------------------------------
-- Publieke profielen (alleen veilige kolommen) en statistieken voor support
-- ---------------------------------------------------------------------------
create or replace view public.public_profiles with (security_invoker = false) as
select p.id, p.display_name, p.city, p.created_at, p.payouts_enabled as id_verified,
  (select count(*) from public.orders o where o.seller_id = p.id and o.status = 'completed')::int as sales,
  (select round(avg(r.rating)::numeric, 1) from public.reviews r
     where r.subject_id = p.id and (r.created_at < now() - interval '14 days'
       or exists (select 1 from public.reviews x where x.order_id = r.order_id and x.author_id <> r.author_id))) as rating,
  (select count(*) from public.reviews r
     where r.subject_id = p.id and (r.created_at < now() - interval '14 days'
       or exists (select 1 from public.reviews x where x.order_id = r.order_id and x.author_id <> r.author_id)))::int as review_count
from public.profiles p;

create or replace function public.party_stats(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_support() then perform public.fail('Alleen voor medewerkers.'); end if;
  return jsonb_build_object(
    'orders_as_buyer', (select count(*) from public.orders where buyer_id = p_user and status not in ('pending_payment', 'expired')),
    'disputes_opened_90d', (select count(*) from public.disputes where opened_by = p_user and created_at > now() - interval '90 days'),
    'orders_as_seller', (select count(*) from public.orders where seller_id = p_user and status not in ('pending_payment', 'expired')),
    'disputes_against_90d', (select count(*) from public.disputes d join public.orders o on o.id = d.order_id
                              where o.seller_id = p_user and d.created_at > now() - interval '90 days'),
    'account_age_days', (select extract(day from now() - created_at)::int from public.profiles where id = p_user)
  );
end $$;

-- ---------------------------------------------------------------------------
-- Rechten en RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.listings enable row level security;
alter table public.listing_photos enable row level security;
alter table public.orders enable row level security;
alter table public.order_events enable row level security;
alter table public.disputes enable row level security;
alter table public.dispute_evidence enable row level security;
alter table public.messages enable row level security;
alter table public.reviews enable row level security;

-- Profielen: eigen rij lezen; alleen naam en plaats wijzigen.
create policy profiles_self_read on public.profiles for select using (id = auth.uid() or public.is_support());
create policy profiles_self_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated, anon;
grant update (display_name, city) on public.profiles to authenticated;
grant select on public.public_profiles to anon, authenticated;

-- Advertenties
create policy listings_read on public.listings for select
  using (status in ('active', 'reserved', 'sold') or seller_id = auth.uid() or public.is_support());
create policy listings_insert on public.listings for insert
  with check (seller_id = auth.uid() and status = 'draft');
create policy listings_update on public.listings for update
  using (seller_id = auth.uid() and status in ('draft', 'active'))
  with check (seller_id = auth.uid());
revoke update on public.listings from authenticated, anon;
grant update (title, brand, size, condition, category, description, price_cents, allows_fit_returns, allows_pickup, pickup_city)
  on public.listings to authenticated;
revoke insert on public.listings from anon;

create policy photos_read on public.listing_photos for select using (
  exists (select 1 from public.listings l where l.id = listing_id
          and (l.status in ('active', 'reserved', 'sold') or l.seller_id = auth.uid() or public.is_support())));
create policy photos_write on public.listing_photos for insert with check (
  exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = auth.uid() and l.status in ('draft', 'active')));
create policy photos_delete on public.listing_photos for delete using (
  exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = auth.uid() and l.status in ('draft', 'active')));

-- Orders en historie: alleen partijen en support. Schrijven alleen via functies.
create policy orders_read on public.orders for select
  using (auth.uid() in (buyer_id, seller_id) or public.is_support());
create policy events_read on public.order_events for select using (
  exists (select 1 from public.orders o where o.id = order_id and (auth.uid() in (o.buyer_id, o.seller_id) or public.is_support())));
revoke insert, update, delete on public.orders, public.order_events from authenticated, anon;

-- Geschillen
create policy disputes_read on public.disputes for select using (
  exists (select 1 from public.orders o where o.id = order_id and (auth.uid() in (o.buyer_id, o.seller_id) or public.is_support())));
revoke insert, update, delete on public.disputes from authenticated, anon;

create policy evidence_read on public.dispute_evidence for select using (
  exists (select 1 from public.disputes d join public.orders o on o.id = d.order_id
          where d.id = dispute_id and (auth.uid() in (o.buyer_id, o.seller_id) or public.is_support())));
create policy evidence_insert on public.dispute_evidence for insert with check (
  uploaded_by = auth.uid() and exists (
    select 1 from public.disputes d join public.orders o on o.id = d.order_id
    where d.id = dispute_id and auth.uid() in (o.buyer_id, o.seller_id)
      and d.status in ('awaiting_seller', 'awaiting_review', 'appealed')));
revoke update, delete on public.dispute_evidence from authenticated, anon;

-- Berichten: koper en verkoper van het artikel.
create policy messages_read on public.messages for select using (
  auth.uid() = buyer_id or public.is_support()
  or exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = auth.uid()));
create policy messages_insert on public.messages for insert with check (
  sender_id = auth.uid()
  and exists (select 1 from public.listings l where l.id = listing_id and l.seller_id <> buyer_id
              and (auth.uid() = buyer_id or auth.uid() = l.seller_id)));
revoke update, delete on public.messages from authenticated, anon;

-- Reviews
create policy reviews_read on public.reviews for select using (public.review_visible(reviews));
revoke insert, update, delete on public.reviews from authenticated, anon;

-- Functies: alleen wat een gebruiker mag aanroepen.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.fee_cents(integer), public.shipping_cents(shipping_method), public.is_risk_brand(text),
  public.message_has_link(text), public.message_is_suspicious(text), public.is_support(), public.review_visible(public.reviews),
  public.publish_listing(uuid), public.remove_listing(uuid), public.create_order(uuid, shipping_method),
  public.mark_shipped(uuid, text), public.confirm_order(uuid), public.open_dispute(uuid, dispute_reason, text),
  public.respond_dispute(uuid, text), public.seller_accept_refund(uuid), public.decide_dispute(uuid, dispute_decision, integer, text, text),
  public.appeal_dispute(uuid, text), public.submit_return(uuid, text), public.confirm_return(uuid),
  public.leave_review(uuid, integer, text), public.party_stats(uuid)
to authenticated;
grant execute on function public.fee_cents(integer), public.shipping_cents(shipping_method), public.is_risk_brand(text),
  public.is_support(), public.review_visible(public.reviews) to anon;
-- Trigger- en hulpfuncties moeten intern bruikbaar blijven.
grant execute on function public.handle_new_user(), public.listings_set_risk(), public.messages_check(),
  public.add_workdays(timestamptz, integer), public.log_event(uuid, text, jsonb), public.fail(text),
  public.release_expired_reservations(), public.apply_decision(uuid) to postgres;
-- Alleen de server (service role) mag geld en termijnen aansturen.
grant execute on all functions in schema public to service_role;

-- Realtime voor berichten
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
