-- Scenario-tests voor alle statusovergangen. Draait met: npm run test:db
\set ON_ERROR_STOP on
\set QUIET on

create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), false);
end $$;
create or replace function pg_temp.expect_error(stmt text, needle text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'VERWACHT FOUT bij: % (verwacht: %)', stmt, needle;
exception when others then
  if position(needle in sqlerrm) = 0 then
    raise exception 'Verkeerde fout bij %: % (verwacht: %)', stmt, sqlerrm, needle;
  end if;
end $$;
create or replace function pg_temp.ok(cond boolean, label text) returns void language plpgsql as $$
begin
  if not cond then raise exception 'MISLUKT: %', label; end if;
  raise notice 'ok  %', label;
end $$;

-- Gebruikers: verkoper (oud account, geverifieerd), nieuwe verkoper, koper, twee medewerkers.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'noor@example.nl'),
  ('00000000-0000-0000-0000-00000000000b', 'koper@example.nl'),
  ('00000000-0000-0000-0000-00000000000c', 'nieuw@example.nl'),
  ('00000000-0000-0000-0000-00000000000d', 'sanne@hanger.nl'),
  ('00000000-0000-0000-0000-00000000000e', 'mehmet@hanger.nl');
update public.profiles set payouts_enabled = true, created_at = now() - interval '60 days' where id = '00000000-0000-0000-0000-00000000000a';
update public.profiles set payouts_enabled = true where id = '00000000-0000-0000-0000-00000000000c';
update public.profiles set is_support = true where id in ('00000000-0000-0000-0000-00000000000d', '00000000-0000-0000-0000-00000000000e');

select pg_temp.ok((select count(*) = 5 from public.profiles), 'profiel aangemaakt per account');

-- Regels
select pg_temp.ok(public.fee_cents(4000) = 290, 'fee € 40 = € 2,90');
select pg_temp.ok(public.fee_cents(2925) = 226, 'fee € 29,25: 175,5 cent rondt naar 176 + 50');
select pg_temp.ok(public.fee_cents(100) = 56, 'fee € 1 = € 0,56');
select pg_temp.ok(public.is_risk_brand('Louis Vuitton') and public.is_risk_brand('NIKE JORDAN 1') and not public.is_risk_brand('Arket'), 'risicomerken herkend');
select pg_temp.ok(public.message_has_link('kijk op www.snelbetalen.link') and public.message_has_link('https://x.y') and not public.message_has_link('Is het nog beschikbaar?'), 'links herkend');
select pg_temp.ok(not public.message_has_link('maat 38.5 past'), 'getal met punt is geen link');
select pg_temp.ok(public.message_is_suspicious('app me op 06 12345678') and public.message_is_suspicious('stuur een tikkie'), 'verdachte berichten gemarkeerd');
select pg_temp.ok(public.add_workdays('2026-11-06 12:00+01', 2) = '2026-11-10 12:00+01', 'vrijdag + 2 werkdagen = dinsdag');

set role authenticated;

-- Advertentie plaatsen
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.listings (id, seller_id, title, brand, size, condition, category, price_cents, allows_pickup, pickup_city)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'Wollen mantel', 'Arket', 'M', 'goed', 'dames', 6400, true, 'Utrecht');
select pg_temp.expect_error($$select public.publish_listing('10000000-0000-0000-0000-000000000001')$$, 'minstens één foto');
insert into public.listing_photos (listing_id, path, kind) values ('10000000-0000-0000-0000-000000000001', 'a/1/x.jpg', 'main');
select public.publish_listing('10000000-0000-0000-0000-000000000001');
select pg_temp.ok((select status = 'active' from public.listings where id = '10000000-0000-0000-0000-000000000001'), 'advertentie geplaatst');
select pg_temp.expect_error($$update public.listings set status = 'sold' where id = '10000000-0000-0000-0000-000000000001'$$, 'permission denied');
select pg_temp.expect_error($$update public.listings set risk_brand = false$$, 'permission denied');

-- Risicomerk zonder label/serienummer
insert into public.listings (id, seller_id, title, brand, size, condition, category, price_cents)
values ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'Speedy 30', 'Louis Vuitton', 'One size', 'goed', 'tassen', 42000);
insert into public.listing_photos (listing_id, path, kind) values ('10000000-0000-0000-0000-000000000002', 'a/2/x.jpg', 'main');
select pg_temp.expect_error($$select public.publish_listing('10000000-0000-0000-0000-000000000002')$$, 'label');
insert into public.listing_photos (listing_id, path, kind) values ('10000000-0000-0000-0000-000000000002', 'a/2/l.jpg', 'label'), ('10000000-0000-0000-0000-000000000002', 'a/2/s.jpg', 'serial');
select public.publish_listing('10000000-0000-0000-0000-000000000002');
select pg_temp.ok((select risk_brand from public.listings where id = '10000000-0000-0000-0000-000000000002'), 'risicomerk gezet door database');

-- Nieuwe verkoper: limiet € 250
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
insert into public.listings (id, seller_id, title, brand, size, condition, category, price_cents)
values ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000c', 'Dure jas', 'Arket', 'L', 'goed', 'heren', 30000);
insert into public.listing_photos (listing_id, path, kind) values ('10000000-0000-0000-0000-000000000003', 'c/3/x.jpg', 'main');
select pg_temp.expect_error($$select public.publish_listing('10000000-0000-0000-0000-000000000003')$$, '€ 250');

-- Koper zonder identiteitscheck kan niet verkopen
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into public.listings (id, seller_id, title, brand, size, condition, category, price_cents)
values ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000b', 'Trui', 'COS', 'L', 'goed', 'heren', 2900);
insert into public.listing_photos (listing_id, path, kind) values ('10000000-0000-0000-0000-000000000004', 'b/4/x.jpg', 'main');
select pg_temp.expect_error($$select public.publish_listing('10000000-0000-0000-0000-000000000004')$$, 'identiteitscheck');

-- ---- Scenario 1: kopen, versturen, goedkeuren, uitbetalen ----
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_error($$select public.create_order('10000000-0000-0000-0000-000000000004', 'postnl')$$, 'niet meer beschikbaar');
create temp table t (k text primary key, v uuid);
grant all on t to authenticated, service_role;
insert into t select 'o1', id from public.create_order('10000000-0000-0000-0000-000000000001', 'postnl');
select pg_temp.ok((select total_cents = 6400 + 434 + 395 from public.orders where id = (select v from t where k = 'o1')), 'totaal = prijs + fee + verzending');
select pg_temp.ok((select status = 'reserved' from public.listings where id = '10000000-0000-0000-0000-000000000001'), 'artikel gereserveerd');
select pg_temp.expect_error($$select public.create_order('10000000-0000-0000-0000-000000000001', 'postnl')$$, 'niet meer beschikbaar');
select pg_temp.expect_error($$update public.orders set status = 'completed'$$, 'permission denied');

reset role; set role service_role;
select public.mark_order_paid((select v from t where k = 'o1'), 'pi_1', 'ch_1');
select public.mark_order_paid((select v from t where k = 'o1'), 'pi_1', 'ch_1'); -- dubbele webhook
select pg_temp.ok((select status = 'paid' and ship_by > now() + interval '71 hours' from public.orders where id = (select v from t where k = 'o1')), 'betaald, verzendtermijn 3 dagen');
select pg_temp.ok((select count(*) = 1 from public.order_events where order_id = (select v from t where k = 'o1') and type = 'paid'), 'dubbele webhook verwerkt maar één keer');

reset role; set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_error($$select public.mark_shipped((select v from t where k = 'o1'), '3SABC123456')$$, 'niet gevonden');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect_error($$select public.mark_shipped((select v from t where k = 'o1'), '12')$$, 'track');
select public.mark_shipped((select v from t where k = 'o1'), '3SABC123456');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select public.confirm_order((select v from t where k = 'o1'));
select pg_temp.ok((select status = 'completed' and payout_cents = 6400 and payout_due_at is not null from public.orders where id = (select v from t where k = 'o1')), 'afgerond, uitbetaling klaargezet');

-- Reviews: pas zichtbaar als beide er een hebben
select public.leave_review((select v from t where k = 'o1'), 5, 'Precies zoals beschreven');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.ok((select count(*) = 0 from public.reviews), 'review van koper nog verborgen voor verkoper');
select public.leave_review((select v from t where k = 'o1'), 5, 'Snelle betaling');
select pg_temp.ok((select count(*) = 2 from public.reviews), 'beide reviews zichtbaar na tweede review');
select pg_temp.expect_error($$select public.leave_review((select v from t where k = 'o1'), 4, 'nog een')$$, 'al een review');

-- ---- Scenario 2: niet verstuurd -> automatisch geannuleerd ----
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into t select 'o2', id from public.create_order('10000000-0000-0000-0000-000000000002', 'dhl');
reset role; set role service_role;
select public.mark_order_paid((select v from t where k = 'o2'), 'pi_2', 'ch_2');
update public.orders set ship_by = now() - interval '1 minute' where id = (select v from t where k = 'o2');
select public.run_deadlines();
select pg_temp.ok((select status = 'cancelled' and refund_cents = total_cents from public.orders where id = (select v from t where k = 'o2')), 'niet verstuurd: geannuleerd, volledige terugbetaling klaargezet');
select pg_temp.ok((select status = 'active' from public.listings where id = '10000000-0000-0000-0000-000000000002'), 'artikel weer te koop');

-- ---- Scenario 3: reservering verloopt ----
reset role; set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into t select 'o3', id from public.create_order('10000000-0000-0000-0000-000000000002', 'postnl');
reset role; set role service_role;
update public.orders set reserved_until = now() - interval '1 minute' where id = (select v from t where k = 'o3');
select public.run_deadlines();
select pg_temp.ok((select status = 'expired' from public.orders where id = (select v from t where k = 'o3')), 'reservering verlopen');
select pg_temp.ok((select status = 'active' from public.listings where id = '10000000-0000-0000-0000-000000000002'), 'artikel vrijgegeven');

-- ---- Scenario 4: geschil, verkoper reageert niet, besluit, beroep, retour ----
reset role; set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into t select 'o4', id from public.create_order('10000000-0000-0000-0000-000000000002', 'postnl');
reset role; set role service_role;
select public.mark_order_paid((select v from t where k = 'o4'), 'pi_4', 'ch_4');
reset role; set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.mark_shipped((select v from t where k = 'o4'), '3SDEF654321');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_error($$select public.open_dispute((select v from t where k = 'o4'), 'fit', 'Hij is me helaas te klein om te dragen.')$$, 'geen retour');
select pg_temp.expect_error($$select public.open_dispute((select v from t where k = 'o4'), 'counterfeit', 'nep')$$, '20 tekens');
insert into t select 'd4', id from public.open_dispute((select v from t where k = 'o4'), 'counterfeit', 'Het stiksel en de datumcode wijken af van een echte Speedy.');
select pg_temp.ok((select status = 'disputed' from public.orders where id = (select v from t where k = 'o4')), 'order staat op geschil');
-- Medewerker kan nog niet beslissen: verkoper heeft 3 dagen
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.expect_error($$select public.decide_dispute((select v from t where k = 'd4'), 'refund_after_return', null, 'Motivatie die lang genoeg is voor de test hier.', '4.2')$$, 'wacht niet');
reset role; set role service_role;
update public.disputes set seller_respond_by = now() - interval '1 minute' where id = (select v from t where k = 'd4');
select public.run_deadlines();
select pg_temp.ok((select status = 'awaiting_review' and decide_by > now() from public.disputes where id = (select v from t where k = 'd4')), 'geen reactie: door naar medewerker');
reset role; set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_error($$select public.decide_dispute((select v from t where k = 'd4'), 'refund_full', null, 'Ik besluit zelf even dat ik gelijk heb, prima.', '4.2')$$, 'Alleen medewerkers');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.expect_error($$select public.decide_dispute((select v from t where k = 'd4'), 'refund_full', null, 'Te kort', '4.2')$$, 'motivatie');
select public.decide_dispute((select v from t where k = 'd4'), 'release_to_seller', null, 'De datumcode en het stiksel passen bij een echte Speedy uit 2019.', '4.4');
select pg_temp.ok((select status = 'decided' and appeal_until > now() from public.disputes where id = (select v from t where k = 'd4')), 'besluit genomen, beroep mogelijk');
select pg_temp.ok((select payout_due_at is null from public.orders where id = (select v from t where k = 'o4')), 'geen geld bewogen tijdens beroepstermijn');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select public.appeal_dispute((select v from t where k = 'd4'), 'Ik heb een expertiserapport bijgevoegd dat zegt dat het namaak is.');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.expect_error($$select public.decide_dispute((select v from t where k = 'd4'), 'release_to_seller', null, 'Ik blijf bij mijn eerste besluit, want het klopt.', '4.4')$$, 'andere medewerker');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select public.decide_dispute((select v from t where k = 'd4'), 'refund_after_return', null, 'Het expertiserapport toont afwijkende hardware. Retour en volledige terugbetaling.', '4.2');
select pg_temp.ok((select status = 'return_pending' from public.orders where id = (select v from t where k = 'o4')), 'beroep toegekend: retour verwacht');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select public.submit_return((select v from t where k = 'd4'), 'RETOUR12345');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.confirm_return((select v from t where k = 'd4'));
select pg_temp.ok((select status = 'refunded' and refund_cents = total_cents and payout_cents = 0 from public.orders where id = (select v from t where k = 'o4')), 'retour ontvangen: koper krijgt alles terug, verkoper niets');

-- ---- Scenario 5: besluit zonder beroep wordt definitief; gedeeltelijke terugbetaling ----
insert into public.listings (id, seller_id, title, brand, size, condition, category, price_cents)
values ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000000a', 'Levi''s 501', 'Levi''s', 'W30', 'goed', 'heren', 3800);
insert into public.listing_photos (listing_id, path, kind) values ('10000000-0000-0000-0000-000000000005', 'a/5/x.jpg', 'main');
select public.publish_listing('10000000-0000-0000-0000-000000000005');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into t select 'o5', id from public.create_order('10000000-0000-0000-0000-000000000005', 'postnl');
reset role; set role service_role;
select public.mark_order_paid((select v from t where k = 'o5'), 'pi_5', 'ch_5');
reset role; set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.mark_shipped((select v from t where k = 'o5'), '3SGHI000111');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into t select 'd5', id from public.open_dispute((select v from t where k = 'o5'), 'not_as_described', 'Er zit een gat in de achterzak dat niet op de foto''s stond.');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.respond_dispute((select v from t where k = 'd5'), 'Dat gat heb ik niet gezien, sorry. Ik bied korting aan.');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.expect_error($$select public.decide_dispute((select v from t where k = 'd5'), 'refund_partial', 999999, 'Gedeeltelijke terugbetaling voor het gat in de zak.', '4.2')$$, 'gedeeltelijke');
select public.decide_dispute((select v from t where k = 'd5'), 'refund_partial', 1000, 'Klein gebrek, artikel blijft bruikbaar. Koper houdt de broek en krijgt € 10 terug.', '4.2');
reset role; set role service_role;
update public.disputes set appeal_until = now() - interval '1 minute' where id = (select v from t where k = 'd5');
select public.run_deadlines();
select pg_temp.ok((select status = 'completed' and refund_cents = 1000 and payout_cents = 2800 from public.orders where id = (select v from t where k = 'o5')), 'gedeeltelijk: € 10 terug, verkoper krijgt € 28');
select pg_temp.ok((select status = 'final' from public.disputes where id = (select v from t where k = 'd5')), 'besluit definitief na beroepstermijn');

-- ---- Scenario 6: geen melding -> automatisch afgerond ----
reset role; set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.listings (id, seller_id, title, brand, size, condition, category, price_cents)
values ('10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-00000000000a', 'Oxford hemd', 'Ralph Lauren', 'M', 'goed', 'heren', 2400);
insert into public.listing_photos (listing_id, path, kind) values ('10000000-0000-0000-0000-000000000006', 'a/6/x.jpg', 'main');
select public.publish_listing('10000000-0000-0000-0000-000000000006');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_error($$select public.create_order('10000000-0000-0000-0000-000000000006', 'pickup')$$, 'Ophalen kan niet');
insert into t select 'o6', id from public.create_order('10000000-0000-0000-0000-000000000006', 'postnl');
reset role; set role service_role;
select public.mark_order_paid((select v from t where k = 'o6'), 'pi_6', 'ch_6');
reset role; set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.mark_shipped((select v from t where k = 'o6'), '3SJKL222333');
reset role; set role service_role;
select public.mark_delivered((select v from t where k = 'o6'), 420);
select pg_temp.ok((select inspect_until between now() + interval '71 hours' and now() + interval '73 hours' and carrier_weight_grams = 420 from public.orders where id = (select v from t where k = 'o6')), 'bezorgd: 3 dagen controletijd, gewicht vastgelegd');
update public.orders set inspect_until = now() - interval '1 minute' where id = (select v from t where k = 'o6');
select public.run_deadlines();
select pg_temp.ok((select status = 'completed' and payout_cents = 2400 from public.orders where id = (select v from t where k = 'o6')), 'geen melding: automatisch afgerond en uitbetaling klaargezet');
reset role; set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.expect_error($$select public.open_dispute((select v from t where k = 'o6'), 'damaged', 'Te laat gemeld maar toch geprobeerd.')$$, 'nu geen probleem');

-- ---- Berichten ----
insert into public.messages (listing_id, buyer_id, sender_id, body) values ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'Is de tas nog beschikbaar?');
select pg_temp.expect_error($$insert into public.messages (listing_id, buyer_id, sender_id, body) values ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'betaal via www.snelbetalen.link')$$, 'Links');
insert into public.messages (listing_id, buyer_id, sender_id, body) values ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'App me op 06 12345678');
select pg_temp.ok((select flagged from public.messages order by id desc limit 1), 'telefoonnummer gemarkeerd');
select pg_temp.expect_error($$insert into public.messages (listing_id, buyer_id, sender_id, body) values ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000b', 'namens iemand anders')$$, 'row-level security');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.ok((select count(*) = 0 from public.messages), 'buitenstaander ziet geen berichten');
select pg_temp.ok((select count(*) = 0 from public.orders), 'buitenstaander ziet geen orders');
select pg_temp.ok((select count(*) = 0 from public.disputes), 'buitenstaander ziet geen geschillen');
select pg_temp.expect_error($$select public.party_stats('00000000-0000-0000-0000-00000000000b')$$, 'medewerkers');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.ok((public.party_stats('00000000-0000-0000-0000-00000000000b')->>'disputes_opened_90d')::int = 2, 'support ziet claimgeschiedenis van koper');

-- ---- Publieke profielen tonen geen gevoelige velden ----
select pg_temp.ok((select count(*) = 0 from information_schema.columns where table_name = 'public_profiles' and column_name in ('stripe_account_id', 'is_support')), 'publiek profiel zonder gevoelige kolommen');
select pg_temp.as_user(null);
reset role; set role anon;
select pg_temp.ok((select count(*) > 0 from public.listings) and (select count(*) = 0 from public.listings where status = 'draft'), 'anoniem ziet geplaatste advertenties, geen concepten');
select pg_temp.expect_error($$select public.create_order('10000000-0000-0000-0000-000000000002', 'postnl')$$, 'permission denied');
reset role;
\echo 'Alle databasetests geslaagd.'
