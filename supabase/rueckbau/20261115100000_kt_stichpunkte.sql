-- Rueckbau zu supabase/migrations/20261115100000_kt_stichpunkte.sql
-- Vorher Teil 2 zuruecknehmen (20261115110000), denn dessen Regel nutzt kt_kurs_notiz_umfang.
-- Loescht die Einstellung "Stichpunkte" an den Freigaben und die Pfade der Stichpunkt-Fassungen
-- (die Dateien im Bucket bleiben liegen). Vorher sichern (supabase/sicherung.sql).

begin;

set local lock_timeout = '3s';

drop function if exists public.kt_kurs_notiz_umfang(uuid);
alter table public.kt_kurs_freigaben drop column if exists notiz_umfang;
alter table public.kurstage
  drop column if exists trainer_kurz_pfad,
  drop column if exists trainer_kurz_hash,
  drop column if exists trainer_kurz_groesse,
  drop column if exists quellen_kurz_pfad,
  drop column if exists quellen_kurz_hash,
  drop column if exists quellen_kurz_groesse;

delete from public.kt_migrationen where version = '20261115100000';

do $$
begin
  if exists (select 1 from pg_proc where proname = 'kt_kurs_notiz_umfang') then
    raise exception 'KT-RS01: Funktion noch da';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public'
             and ((table_name = 'kt_kurs_freigaben' and column_name = 'notiz_umfang')
                  or (table_name = 'kurstage' and column_name like '%\_kurz\_%'))) then
    raise exception 'KT-RS02: Spalten noch da';
  end if;
end
$$;

commit;
