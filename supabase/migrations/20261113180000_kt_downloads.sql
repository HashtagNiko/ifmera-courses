-- Baustein 2 (hinzufuegend): Herunterladen von Teilnehmerfassung und PDF.
--
-- Neue Spalten an kurstage, gefuellt vom Deck-Sync:
--   liefername                 Name wie in "2. Slides" (ohne Endung), z. B.
--                              "2.3 Slides - Rechtliche Grundlagen - Eigentuemerversammlung & Beschluesse"
--   teilnehmer_pfad/_hash/_groesse   Teilnehmerfassung (HTML) im Bucket, <kuerzel>/teilnehmer/...
--   pdf_pfad/_hash/_groesse          PDF der Teilnehmerfassung im Bucket, <kuerzel>/pdf/...
--
-- Herunterladbar wird nur, was Niko tatsaechlich ausgibt: Der Sync laedt eine Teilnehmerfassung oder ein
-- PDF nur hoch, wenn dieselbe Datei (gleiche Pruefsumme) im Lieferordner "2. Slides" liegt, ausser in
-- Ordnern, die mit "_" beginnen (z. B. "_voll (nicht ausgegeben)").
--
-- Rechte: unveraendert. Die Spalten erben die Regeln von kurstage; die Bucket-Ordner teilnehmer/ und
-- pdf/ fallen unter "kt decks lesen" (ab Stufe "nutzen") und gehoeren wie alles unter <kuerzel>/ dem
-- Besitzer des Kurses.
--
-- Rueckbau: supabase/rueckbau/20261113180000_kt_downloads.sql

begin;

set local lock_timeout = '3s';

alter table public.kurstage
  add column liefername        text,
  add column teilnehmer_pfad   text,
  add column teilnehmer_hash   text,
  add column teilnehmer_groesse bigint,
  add column pdf_pfad          text,
  add column pdf_hash          text,
  add column pdf_groesse       bigint;

comment on column public.kurstage.liefername is
  'Dateiname wie in "2. Slides" ohne Endung; leer, wenn der Tag dort nicht liegt.';
comment on column public.kurstage.teilnehmer_pfad is
  'Teilnehmerfassung im Bucket decks; nur gesetzt, wenn sie im Lieferordner liegt (ausgegeben).';
comment on column public.kurstage.pdf_pfad is
  'PDF der Teilnehmerfassung im Bucket decks; nur gesetzt, wenn es im Lieferordner liegt (ausgegeben).';

insert into public.kt_migrationen (version, name)
values ('20261113180000', 'kt_downloads');

do $$
declare n int;
begin
  select count(*) into n from information_schema.columns
  where table_schema = 'public' and table_name = 'kurstage'
    and column_name in ('liefername', 'teilnehmer_pfad', 'teilnehmer_hash', 'teilnehmer_groesse',
                        'pdf_pfad', 'pdf_hash', 'pdf_groesse');
  if n <> 7 then raise exception 'KT-D01: erwartet 7 neue Spalten, gefunden %', n; end if;

  -- Regeln unveraendert (4 auf kurstage, 6 im Bucket)
  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'kurstage';
  if n <> 4 then raise exception 'KT-D02: erwartet 4 Regeln auf kurstage, gefunden %', n; end if;
  select count(*) into n from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'kt decks %';
  if n <> 6 then raise exception 'KT-D03: erwartet 6 Bucket-Regeln, gefunden %', n; end if;
end
$$;

commit;
