-- Rueckbau zu supabase/migrations/20261113150000_kt_besitz_und_freigaben.sql
--
-- Entfernt alles, was Schritt A angelegt hat. Die bestehenden Regeln hat Schritt A nicht angefasst;
-- sie bleiben, wie sie sind.
--
-- Vorher: Ist die App schon auf kt_trainer umgestellt, zuerst den App-Code zuruecknehmen, sonst
-- zeigt die App "Kein Zugriff". Ist Schritt C eingespielt, zuerst dessen Rueckbau ausfuehren.
--
-- ACHTUNG, loescht Daten: alle Freigaben und alle Besitzer-Eintraege. Vorher sichern
-- (supabase/sicherung.sql), siehe CLAUDE.md §4 Nr. 4.

begin;

-- Das Entfernen des Verweises auf auth.users sperrt auth.users kurz. Lieber abbrechen als Anmeldungen
-- im Pruefungstool aufhalten.
set local lock_timeout = '3s';

drop policy if exists "freigaben loeschen" on public.kt_kurs_freigaben;
drop policy if exists "freigaben aendern"  on public.kt_kurs_freigaben;
drop policy if exists "freigaben anlegen"  on public.kt_kurs_freigaben;
drop policy if exists "freigaben lesen"    on public.kt_kurs_freigaben;
drop policy if exists "trainer lesen"      on public.kt_trainer;

drop function if exists public.kt_kurs_id(text);
drop function if exists public.kt_kurs_stufe_mindestens(uuid, text);
drop function if exists public.kt_kurs_stufe(uuid);
drop function if exists public.kt_ist_kursbesitzer(uuid);
drop function if exists public.kt_ist_admin();
drop function if exists public.kt_ist_trainer();

drop table if exists public.kt_kurs_freigaben;

drop index if exists public.durchlaeufe_besitzer_idx;
alter table public.durchlaeufe drop column if exists besitzer_id;
drop index if exists public.kurse_besitzer_idx;
alter table public.kurse drop column if exists besitzer_id;

drop table if exists public.kt_trainer;
drop table if exists public.kt_migrationen;

do $$
declare n int;
begin
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
  where s.nspname = 'public' and p.proname like 'kt\_%';
  if n <> 0 then raise exception 'KT-R03: noch % kt_-Funktionen vorhanden', n; end if;

  select count(*) into n from pg_policies
  where schemaname = 'public' and tablename in ('kurse', 'kurstage', 'durchlaeufe', 'fortschritt', 'kurs_zugriff');
  if n <> 14 then raise exception 'KT-R04: erwartet 14 alte Regeln, gefunden %', n; end if;

  select count(*) into n from pg_policies
  where schemaname = 'storage' and tablename = 'objects' and policyname like 'decks %';
  if n <> 3 then raise exception 'KT-R05: erwartet 3 alte Bucket-Regeln, gefunden %', n; end if;

  if to_regclass('public.kt_trainer') is not null
     or to_regclass('public.kt_kurs_freigaben') is not null
     or to_regclass('public.kt_migrationen') is not null then
    raise exception 'KT-R01: kt_-Tabellen noch vorhanden';
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name in ('kurse', 'durchlaeufe') and column_name = 'besitzer_id') then
    raise exception 'KT-R02: besitzer_id noch vorhanden';
  end if;
end
$$;

commit;
