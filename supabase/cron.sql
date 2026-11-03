-- Elke 15 minuten de termijnen en geldbewegingen laten verwerken.
-- Het geheim staat in Supabase Vault onder de naam 'hanger_cron_secret'
-- (Integrations > Vault) en moet gelijk zijn aan CRON_SECRET in Cloudflare.
-- Zo staat het geheim nergens in code of SQL.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'hanger-deadlines',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url := 'https://hanger.robertkremer91.workers.dev/api/cron',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'hanger_cron_secret'), ''),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $job$
);

-- Controleren:  select * from cron.job_run_details order by start_time desc limit 10;
--               select status_code, content from net._http_response order by created desc limit 5;
-- Stoppen:      select cron.unschedule('hanger-deadlines');
