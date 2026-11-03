-- Vast zoekpad voor alle functies (Supabase security advisor).
alter function public.fee_cents(integer) set search_path = public;
alter function public.shipping_cents(shipping_method) set search_path = public;
alter function public.add_workdays(timestamptz, integer) set search_path = public;
alter function public.is_risk_brand(text) set search_path = public;
alter function public.message_has_link(text) set search_path = public;
alter function public.message_is_suspicious(text) set search_path = public;
alter function public.listings_set_risk() set search_path = public;
alter function public.messages_check() set search_path = public;
alter function public.fail(text) set search_path = public;

comment on view public.public_profiles is
  'Bewust security definer: toont alleen naam, plaats, lidmaatschap, ID-status en publieke reviewcijfers. Geen Stripe-gegevens of rollen.';
