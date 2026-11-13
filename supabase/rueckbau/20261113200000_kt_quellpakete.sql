-- Rueckbau zu supabase/migrations/20261113200000_kt_quellpakete.sql
-- Entfernt die Spalten; die Zips unter <kuerzel>/quellen/ bleiben im Bucket (der Besitzer kann sie loeschen).
-- Zuerst den App-Code zuruecknehmen.

begin;

set local lock_timeout = '3s';

alter table public.kurstage
  drop column if exists quellen_pfad,
  drop column if exists quellen_hash,
  drop column if exists quellen_groesse;

delete from public.kt_migrationen where version = '20261113200000';

commit;
