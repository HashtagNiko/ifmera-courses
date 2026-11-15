-- Rechte-Test zu Baustein 7, Teil 2: Deck-Dateien nach Notiz-Einstellung (CLAUDE.md §4 Nr. 5).
--
--   node scripts/sql.mjs supabase/tests/20261115110000_kt_stichpunkte_regeln_test.sql
--
-- Endet mit ROLLBACK. Erfolg = keine Ausgabe, kein Fehler. Jeder Fehler nennt seine Nummer (R..).
-- Zaehlt nur eigene Testdateien (Namen mit "kt-test").
-- Personen: Niko (Besitzer), Voll (weg, "fassung", Notizen voll), Kurz (weg, "fassung", nur Stichpunkte),
-- Nutzen (weg, "nutzen", nur Stichpunkte), Fremd (kein kt_trainer), anon.

begin;

set local lock_timeout = '3s';

insert into public.eingeladene_trainer (email) values
  ('kt-test-voll@example.invalid'), ('kt-test-kurz@example.invalid'),
  ('kt-test-nutzen@example.invalid'), ('kt-test-fremd@example.invalid');
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000000a1', 'kt-test-voll@example.invalid',   'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000a2', 'kt-test-kurz@example.invalid',   'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000a3', 'kt-test-nutzen@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000f1', 'kt-test-fremd@example.invalid',  'authenticated', 'authenticated');
insert into public.kt_trainer (id, anzeigename) values
  ('00000000-0000-4000-8000-0000000000a1', 'Test Voll'),
  ('00000000-0000-4000-8000-0000000000a2', 'Test Kurz'),
  ('00000000-0000-4000-8000-0000000000a3', 'Test Nutzen');
insert into public.kt_kurs_freigaben (kurs_id, trainer_id, stufe, notiz_umfang) values
  ((select id from public.kurse where slug = 'weg'), '00000000-0000-4000-8000-0000000000a1', 'fassung', 'voll'),
  ((select id from public.kurse where slug = 'weg'), '00000000-0000-4000-8000-0000000000a2', 'fassung', 'stichpunkte'),
  ((select id from public.kurse where slug = 'weg'), '00000000-0000-4000-8000-0000000000a3', 'nutzen', 'stichpunkte');

-- Testdateien (nur Datensaetze) in allen Unterordnern
insert into storage.objects (bucket_id, name, metadata) values
  ('decks', 'weg/trainer/kt-test.html',      '{"size": 1}'),
  ('decks', 'weg/quellen/kt-test.zip',       '{"size": 1}'),
  ('decks', 'weg/trainer-kurz/kt-test.html', '{"size": 1}'),
  ('decks', 'weg/quellen-kurz/kt-test.zip',  '{"size": 1}'),
  ('decks', 'weg/teilnehmer/kt-test.html',   '{"size": 1}'),
  ('decks', 'weg/pdf/kt-test.pdf',           '{"size": 1}'),
  ('decks', 'weg/sonstiges/kt-test.txt',     '{"size": 1}');

select set_config('kt.niko', (select t.id::text from public.kt_trainer t where t.rolle = 'admin'), true);

-- Eine Fassung von Niko (mit seinen ausfuehrlichen Notizen), an Voll und Kurz freigegeben, mit Deck-Datei
insert into public.kt_deck_fassungen (besitzer_id, kurstag_id, titel)
values (current_setting('kt.niko')::uuid,
        (select t.id from public.kurstage t where t.kurs_id = (select id from public.kurse where slug = 'weg') and t.art = 'kurstag' order by t.nummer limit 1),
        'kt-test Nikos Fassung');
select set_config('kt.f_niko', (select f.id::text from public.kt_deck_fassungen f where f.titel = 'kt-test Nikos Fassung'), true);
insert into public.kt_fassung_freigaben (fassung_id, trainer_id, stufe) values
  (current_setting('kt.f_niko')::uuid, '00000000-0000-4000-8000-0000000000a1', 'nutzen'),
  (current_setting('kt.f_niko')::uuid, '00000000-0000-4000-8000-0000000000a2', 'nutzen');
insert into storage.objects (bucket_id, name, metadata)
values ('fassungen', current_setting('kt.niko') || '/' || current_setting('kt.f_niko') || '/deck.html', '{"size": 1}');

-- Und eine eigene Fassung von Kurz (die er immer sieht)
insert into public.kt_deck_fassungen (besitzer_id, kurstag_id, titel)
values ('00000000-0000-4000-8000-0000000000a2',
        (select t.id from public.kurstage t where t.kurs_id = (select id from public.kurse where slug = 'weg') and t.art = 'kurstag' order by t.nummer limit 1),
        'kt-test Kurz eigene');

create function pg_temp.fassungen() returns text language sql as $$
  select coalesce(string_agg(titel, ',' order by titel collate "C"), '') from public.kt_deck_fassungen where titel like 'kt-test%'
$$;
create function pg_temp.fassungsdateien() returns int language sql as $$
  select count(*)::int from storage.objects where bucket_id = 'fassungen' and name like '%/' || current_setting('kt.f_niko') || '/%'
$$;

-- sichtbare Testdateien des Angemeldeten, sortiert, als ein Text
create function pg_temp.sicht() returns text language sql as $$
  select coalesce(string_agg((storage.foldername(name))[2], ',' order by (storage.foldername(name))[2] collate "C"), '')
  from storage.objects where bucket_id = 'decks' and name like 'weg/%/kt-test.%'
$$;

do $$
begin
  if nullif(current_setting('kt.niko', true), '') is null then raise exception 'R00: Testgrundlage fehlt'; end if;
end
$$;

-- Niko (Besitzer): alles ausser dem unbekannten Ordner
select set_config('request.jwt.claims', json_build_object('sub', current_setting('kt.niko'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  if pg_temp.sicht() <> 'pdf,quellen,quellen-kurz,teilnehmer,trainer,trainer-kurz' then
    raise exception 'R01: Niko sieht %', pg_temp.sicht();
  end if;
end
$$;
reset role;

-- Voll ("fassung", voll): wie Niko
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000000a1', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  if pg_temp.sicht() <> 'pdf,quellen,quellen-kurz,teilnehmer,trainer,trainer-kurz' then
    raise exception 'R10: Voll sieht %', pg_temp.sicht();
  end if;
  if pg_temp.fassungen() <> 'kt-test Nikos Fassung' or pg_temp.fassungsdateien() <> 1
     or public.kt_fassung_stufe(current_setting('kt.f_niko')::uuid) is distinct from 'nutzen' then
    raise exception 'R11: Voll sieht die freigegebene Fassung nicht (%)', pg_temp.fassungen();
  end if;
end
$$;
reset role;

-- Kurz ("fassung", nur Stichpunkte): keine ausfuehrlichen Notizen, weder Deck noch Quellen
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000000a2', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  if pg_temp.sicht() <> 'pdf,quellen-kurz,teilnehmer,trainer-kurz' then
    raise exception 'R20: Kurz sieht %', pg_temp.sicht();
  end if;
  -- fremde Fassung mit ausfuehrlichen Notizen: weder Zeile noch Datei noch Stufe; eigene schon
  if pg_temp.fassungen() <> 'kt-test Kurz eigene' then
    raise exception 'R21: Kurz sieht Fassungen %', pg_temp.fassungen();
  end if;
  if pg_temp.fassungsdateien() <> 0 or public.kt_fassung_stufe(current_setting('kt.f_niko')::uuid) is not null then
    raise exception 'R22: Kurz kommt an die fremde Fassung';
  end if;
end
$$;
reset role;

-- Nutzen ("nutzen", nur Stichpunkte): auch kein Stichpunkt-Quellpaket
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000000a3', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  if pg_temp.sicht() <> 'pdf,teilnehmer,trainer-kurz' then
    raise exception 'R30: Nutzen sieht %', pg_temp.sicht();
  end if;
end
$$;
reset role;

-- Freigabe von "Kurz" auf voll gestellt: sieht danach auch die ausfuehrlichen
update public.kt_kurs_freigaben set notiz_umfang = 'voll' where trainer_id = '00000000-0000-4000-8000-0000000000a2';
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000000a2', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  if pg_temp.sicht() <> 'pdf,quellen,quellen-kurz,teilnehmer,trainer,trainer-kurz' then
    raise exception 'R40: Kurz nach Umstellen auf voll sieht %', pg_temp.sicht();
  end if;
  if pg_temp.fassungen() <> 'kt-test Kurz eigene,kt-test Nikos Fassung' then
    raise exception 'R41: Kurz nach Umstellen auf voll sieht Fassungen %', pg_temp.fassungen();
  end if;
end
$$;
reset role;

-- Fremd und anon: nichts
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000000f1', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  if pg_temp.sicht() <> '' then raise exception 'R50: fremdes Konto sieht %', pg_temp.sicht(); end if;
end
$$;
reset role;

select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
set local role anon;
do $$
declare n int;
begin
  select count(*) into n from storage.objects where bucket_id = 'decks' and name like 'weg/%/kt-test.%';
  if n <> 0 then raise exception 'R51: anon sieht % Dateien', n; end if;
exception when insufficient_privilege then null;
end
$$;
reset role;

rollback;
