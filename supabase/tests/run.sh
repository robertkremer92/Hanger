#!/usr/bin/env bash
# Draait de migraties en scenario-tests tegen een lokale Postgres.
# Gebruik: PGHOST=... PGPORT=... PGUSER=postgres npm run test:db
set -euo pipefail
cd "$(dirname "$0")/../.."
P="psql -v ON_ERROR_STOP=1 -q -t -A"
$P -d postgres -c "drop database if exists hanger_test" -c "create database hanger_test" >/dev/null
$P -d hanger_test -f supabase/tests/supabase_stubs.sql >/dev/null
for f in supabase/migrations/*.sql; do $P -d hanger_test -f "$f" >/dev/null; done
$P -d hanger_test -f supabase/tests/flows.test.sql 2>&1 | sed -E 's/^psql:[^ ]+ NOTICE:  //' | grep -E '^(ok|Alle)|ERROR|MISLUKT'
