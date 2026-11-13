-- Rueckbau zu supabase/migrations/20261113180000_kt_downloads.sql
--
-- Entfernt die Download-Spalten. Die hochgeladenen Dateien unter <kuerzel>/teilnehmer/ und <kuerzel>/pdf/
-- bleiben im Bucket liegen; der Besitzer kann sie loeschen. Vorher sichern (supabase/sicherung.sql).
-- Zuerst den App-Code zuruecknehmen, sonst fragt die App nach Spalten, die es nicht mehr gibt.

begin;

set local lock_timeout = '3s';

alter table public.kurstage
  drop column if exists liefername,
  drop column if exists teilnehmer_pfad,
  drop column if exists teilnehmer_hash,
  drop column if exists teilnehmer_groesse,
  drop column if exists pdf_pfad,
  drop column if exists pdf_hash,
  drop column if exists pdf_groesse;

delete from public.kt_migrationen where version = '20261113180000';

commit;
