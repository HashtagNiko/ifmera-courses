-- Baustein 4, Teil 1 (hinzufuegend): Quellpakete je Kurstag.
--
-- Der Deck-Sync baut je Kurstag ein Zip mit Folienquellen, Bildern, Engine, Build-Skript, Bauplan
-- und Anleitung (scripts/quellpaket.mjs) und legt es unter <kuerzel>/quellen/ ab. Lesen darf es nur,
-- wer am Kurs mindestens die Stufe "fassung" hat (Regel "kt decks lesen", seit 20261113160000).
--
-- Neue Spalten an kurstage: quellen_pfad, quellen_hash (Pruefsumme ueber den Inhalt, nicht ueber das
-- Zip), quellen_groesse. Rechte unveraendert.
--
-- Rueckbau: supabase/rueckbau/20261113200000_kt_quellpakete.sql

begin;

set local lock_timeout = '3s';

alter table public.kurstage
  add column quellen_pfad    text,
  add column quellen_hash    text,
  add column quellen_groesse bigint;

comment on column public.kurstage.quellen_pfad is
  'Quellpaket (Zip) im Bucket decks, <kuerzel>/quellen/...; lesbar ab Stufe "fassung".';

insert into public.kt_migrationen (version, name)
values ('20261113200000', 'kt_quellpakete');

do $$
declare n int;
begin
  select count(*) into n from information_schema.columns
  where table_schema = 'public' and table_name = 'kurstage'
    and column_name in ('quellen_pfad', 'quellen_hash', 'quellen_groesse');
  if n <> 3 then raise exception 'KT-Q01: erwartet 3 neue Spalten, gefunden %', n; end if;
  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'kurstage';
  if n <> 4 then raise exception 'KT-Q02: Regeln auf kurstage veraendert (%)', n; end if;
end
$$;

commit;
