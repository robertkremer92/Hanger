-- Elke 15 minuten de termijnen en geldbewegingen laten verwerken.
-- Eenmalig uitvoeren in de Supabase SQL-editor, NA het invullen van je eigen
-- site-URL en CRON_SECRET (dezelfde waarde als in Cloudflare).
-- Vereist de extensies pg_cron en pg_net (Database > Extensions).

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'hanger-deadlines',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://JOUW-DOMEIN/api/cron',
    headers := jsonb_build_object('Authorization', 'Bearer JOUW_CRON_SECRET', 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);

-- Controleren:  select * from cron.job_run_details order by start_time desc limit 10;
-- Stoppen:      select cron.unschedule('hanger-deadlines');
