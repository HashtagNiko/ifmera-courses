-- Baustein 7, Teil 1 (HINZUFUEGEND): Stichpunkt-Fassungen fuer Mitnutzer.
--
-- Neu:
--   * kt_kurs_freigaben.notiz_umfang: 'voll' (wie bisher) oder 'stichpunkte' (nur Stichpunkte statt der
--     ausfuehrlichen Trainer-Notizen). Bestehende Freigaben bleiben 'voll'.
--   * kurstage: Pfad, Pruefsumme und Groesse der Stichpunkt-Fassung (trainer-kurz/) und des
--     Stichpunkt-Quellpakets (quellen-kurz/); schreibt der Deck-Sync.
--   * kt_kurs_notiz_umfang(kurs): 'voll' fuer den Besitzer, sonst die Einstellung der eigenen Freigabe,
--     ohne Kurszugang (auch inaktiv, fremd) null.
-- Die Zugriffsregeln auf Dateien und Fassungen aendert erst Teil 2 (20261115110000, gelb). Bis dahin
-- aendert sich an den Rechten nichts.
--
-- Nach dem zweiten Blick (15.11.2026): Spalte heisst notiz_umfang (nicht "notizen", das ist schon ein
-- Stufenname); kt_kurs_stufe nur einmal je Aufruf; Selbstpruefung um Rechte und Check-Regel ergaenzt.
--
-- Rueckbau: supabase/rueckbau/20261115100000_kt_stichpunkte.sql

begin;

set local lock_timeout = '3s';

alter table public.kt_kurs_freigaben
  add column notiz_umfang text not null default 'voll'
  constraint kt_kurs_freigaben_notiz_umfang_check check (notiz_umfang in ('voll', 'stichpunkte'));
comment on column public.kt_kurs_freigaben.notiz_umfang is
  'voll: ausfuehrliche Trainer-Notizen; stichpunkte: nur die Stichpunkt-Fassung (Baustein 7).';

alter table public.kurstage
  add column trainer_kurz_pfad text,
  add column trainer_kurz_hash text,
  add column trainer_kurz_groesse bigint,
  add column quellen_kurz_pfad text,
  add column quellen_kurz_hash text,
  add column quellen_kurz_groesse bigint;

-- Welche Trainer-Notizen darf der Angemeldete in diesem Kurs sehen?
create function public.kt_kurs_notiz_umfang(p_kurs_id uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select case
    when x.stufe is null then null
    when x.stufe = 'besitzer' then 'voll'
    else (select f.notiz_umfang from public.kt_kurs_freigaben f where f.kurs_id = p_kurs_id and f.trainer_id = auth.uid())
  end
  from (select public.kt_kurs_stufe(p_kurs_id) as stufe) x;
$$;
revoke execute on function public.kt_kurs_notiz_umfang(uuid) from public, anon;
grant execute on function public.kt_kurs_notiz_umfang(uuid) to authenticated;

insert into public.kt_migrationen (version, name) values ('20261115100000', 'kt_stichpunkte');

do $$
declare n int;
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'kt_kurs_freigaben' and column_name = 'notiz_umfang') then
    raise exception 'KT-S01: Spalte notiz_umfang fehlt';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'kt_kurs_freigaben_notiz_umfang_check' and contype = 'c') then
    raise exception 'KT-S01b: Check-Regel fuer notiz_umfang fehlt';
  end if;
  select count(*) into n from information_schema.columns
  where table_schema = 'public' and table_name = 'kurstage'
    and column_name in ('trainer_kurz_pfad', 'trainer_kurz_hash', 'trainer_kurz_groesse',
                        'quellen_kurz_pfad', 'quellen_kurz_hash', 'quellen_kurz_groesse');
  if n <> 6 then raise exception 'KT-S02: erwartet 6 neue Spalten an kurstage, gefunden %', n; end if;
  select count(*) into n from public.kt_kurs_freigaben where notiz_umfang <> 'voll';
  if n <> 0 then raise exception 'KT-S03: bestehende Freigaben nicht auf voll'; end if;
  if not coalesce((select p.prosecdef and p.proconfig @> array['search_path=""'] from pg_proc p
                   where p.oid = 'public.kt_kurs_notiz_umfang(uuid)'::regprocedure), false) then
    raise exception 'KT-S04: kt_kurs_notiz_umfang nicht security definer mit leerem search_path';
  end if;
  if has_function_privilege('anon', 'public.kt_kurs_notiz_umfang(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.kt_kurs_notiz_umfang(uuid)', 'execute') then
    raise exception 'KT-S05: Ausfuehrungsrechte von kt_kurs_notiz_umfang falsch';
  end if;
  if has_table_privilege('anon', 'public.kt_kurs_freigaben', 'SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('anon', 'public.kurstage', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'KT-S06: anon hat Rechte';
  end if;
end
$$;

commit;
