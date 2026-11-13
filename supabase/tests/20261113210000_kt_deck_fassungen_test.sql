-- Rechte-Test zu Baustein 4, Teil 2: eigene Fassungen (CLAUDE.md §4 Nr. 5).
--
--   node scripts/sql.mjs supabase/tests/20261113210000_kt_deck_fassungen_test.sql
--
-- Endet mit ROLLBACK. Erfolg = keine Ausgabe, kein Fehler. Jeder Fehler nennt seine Nummer (F..).
-- Alle Zaehlungen beziehen sich nur auf Testdaten, damit echte Fassungen den Test nicht stoeren.
-- Personen:
--   Niko  Besitzer aller Kurse
--   Co    Freigabe "fassung" auf weg (darf eigene Fassungen anlegen)
--   Co2   Freigabe "nutzen" auf weg
--   Co3   aktiver Trainer ohne Freigabe auf weg
--   Fremd Konto ohne kt_trainer (steht auch fuer anonyme Pruefungsteilnehmer)

begin;

insert into public.eingeladene_trainer (email) values
  ('kt-test-co@example.invalid'), ('kt-test-co2@example.invalid'),
  ('kt-test-co3@example.invalid'), ('kt-test-fremd@example.invalid');
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000000c1', 'kt-test-co@example.invalid',    'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000c2', 'kt-test-co2@example.invalid',   'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000c3', 'kt-test-co3@example.invalid',   'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000f1', 'kt-test-fremd@example.invalid', 'authenticated', 'authenticated');
insert into public.kt_trainer (id, anzeigename) values
  ('00000000-0000-4000-8000-0000000000c1', 'Test Co'),
  ('00000000-0000-4000-8000-0000000000c2', 'Test Co2'),
  ('00000000-0000-4000-8000-0000000000c3', 'Test Co3');
insert into public.kt_kurs_freigaben (kurs_id, trainer_id, stufe) values
  ((select id from public.kurse where slug = 'weg'), '00000000-0000-4000-8000-0000000000c1', 'fassung'),
  ((select id from public.kurse where slug = 'weg'), '00000000-0000-4000-8000-0000000000c2', 'nutzen');

select set_config('kt.niko', (select t.id::text from public.kt_trainer t where t.rolle = 'admin'), true);
select set_config('kt.co',  '00000000-0000-4000-8000-0000000000c1', true);
select set_config('kt.co2', '00000000-0000-4000-8000-0000000000c2', true);
select set_config('kt.co3', '00000000-0000-4000-8000-0000000000c3', true);
select set_config('kt.fremd', '00000000-0000-4000-8000-0000000000f1', true);
select set_config('kt.weg', (select k.id::text from public.kurse k where k.slug = 'weg'), true);
select set_config('kt.weg_tag', (select t.id::text from public.kurstage t
  where t.kurs_id = (select id from public.kurse where slug = 'weg') and t.art = 'kurstag' order by t.nummer limit 1), true);
select set_config('kt.weg_tag2', (select t.id::text from public.kurstage t
  where t.kurs_id = (select id from public.kurse where slug = 'weg') and t.art = 'kurstag' order by t.nummer offset 1 limit 1), true);
select set_config('kt.hg_tag', (select t.id::text from public.kurstage t
  where t.kurs_id = (select id from public.kurse where slug = 'hg') and t.art = 'kurstag' order by t.nummer limit 1), true);
select set_config('kt.hash', repeat('a', 64), true);

do $$
begin
  if nullif(current_setting('kt.niko', true), '') is null or nullif(current_setting('kt.weg_tag', true), '') is null
     or nullif(current_setting('kt.weg_tag2', true), '') is null or nullif(current_setting('kt.hg_tag', true), '') is null then
    raise exception 'F00: Testgrundlage fehlt';
  end if;
end
$$;

-- Hilfsmakro als Kommentar: "als X" = set_config(request.jwt.claims) + set local role authenticated

-- ---------------------------------------------------------------------------
-- Co: anlegen, Unveraenderliches, Formate
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', current_setting('kt.co'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare fid uuid; n int;
begin
  insert into public.kt_deck_fassungen (kurstag_id, titel, grundlage_hash)
  values (current_setting('kt.weg_tag')::uuid, 'Fassung von Co', current_setting('kt.hash'))
  returning id into fid;
  if fid is null then raise exception 'F01: Co kann keine Fassung anlegen und zuruecklesen'; end if;
  perform set_config('kt.fassung_co', fid::text, true);

  insert into public.kt_deck_fassungen (kurstag_id, titel) values (current_setting('kt.weg_tag2')::uuid, 'Co Tag 2')
  returning id into fid;
  perform set_config('kt.fassung_co_tag2', fid::text, true);

  begin
    insert into public.kt_deck_fassungen (kurstag_id, titel) values (current_setting('kt.hg_tag')::uuid, 'hg');
    raise exception 'F02: Co konnte eine Fassung zu einem nicht freigegebenen Kurs anlegen';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.kt_deck_fassungen (besitzer_id, kurstag_id, titel)
    values (current_setting('kt.niko')::uuid, current_setting('kt.weg_tag')::uuid, 'gefaelscht');
    raise exception 'F03: Co konnte eine Fassung auf Nikos Namen anlegen';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.kt_deck_fassungen (id, kurstag_id, titel)
    values ('00000000-0000-4000-8000-0000000000aa', current_setting('kt.weg_tag')::uuid, 'eigene id');
    raise exception 'F03b: Co konnte die id einer Fassung selbst waehlen';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.kt_deck_fassungen (kurstag_id, titel) values (current_setting('kt.weg_tag')::uuid, '<img src=x>');
    raise exception 'F03c: Titel mit < wurde angenommen';
  exception when check_violation then null;
  end;
  begin
    update public.kt_deck_fassungen set deck_pfad = current_setting('kt.niko') || '/x/deck.html'
    where id = current_setting('kt.fassung_co')::uuid;
    raise exception 'F03d: Co konnte den Deck-Pfad auf einen fremden Ordner setzen';
  exception when check_violation then null;
  end;
  begin
    update public.kt_deck_fassungen set kurstag_id = current_setting('kt.weg_tag2')::uuid where id = current_setting('kt.fassung_co')::uuid;
    raise exception 'F03e: Co konnte den Kurstag seiner Fassung aendern';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.kt_deck_fassungen set id = gen_random_uuid() where id = current_setting('kt.fassung_co')::uuid;
    raise exception 'F03f: Co konnte die id seiner Fassung aendern';
  exception when insufficient_privilege then null;
  end;
  update public.kt_deck_fassungen
  set deck_pfad = current_setting('kt.co') || '/' || current_setting('kt.fassung_co') || '/deck.html', deck_hash = current_setting('kt.hash')
  where id = current_setting('kt.fassung_co')::uuid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'F03g: Co kann Pfad und Pruefsumme seiner Fassung nicht setzen'; end if;
end
$$;
reset role;

-- Dateien (nur Datensaetze) als postgres anlegen, Pfade wie in der App
insert into storage.objects (bucket_id, name, metadata) values
  ('fassungen', current_setting('kt.co') || '/' || current_setting('kt.fassung_co') || '/deck.html',   '{"size": 1}'),
  ('fassungen', current_setting('kt.co') || '/' || current_setting('kt.fassung_co') || '/quellen.zip', '{"size": 1}'),
  -- zwei "verirrte" Dateien: im falschen Ordner bzw. mit unbekanntem Namen; niemand darf sie sehen
  ('fassungen', current_setting('kt.niko') || '/' || current_setting('kt.fassung_co') || '/deck.html', '{"size": 1}'),
  ('fassungen', current_setting('kt.co') || '/' || current_setting('kt.fassung_co') || '/notiz.txt',  '{"size": 1}');

-- ---------------------------------------------------------------------------
-- Co: Dateien
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', current_setting('kt.co'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int; pfad text := current_setting('kt.co') || '/' || current_setting('kt.fassung_co');
begin
  select count(*) into n from storage.objects where bucket_id = 'fassungen' and name like current_setting('kt.co') || '/%';
  if n <> 2 then raise exception 'F04: Co sieht % statt 2 eigene Dateien', n; end if;
  begin
    insert into storage.objects (bucket_id, name, metadata)
    values ('fassungen', current_setting('kt.niko') || '/' || current_setting('kt.fassung_co') || '/deck.html', '{"size": 1}');
    raise exception 'F05: Co konnte in Nikos Ordner schreiben';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects (bucket_id, name, metadata) values ('fassungen', pfad || '/virus.exe', '{"size": 1}');
    raise exception 'F06: Co konnte eine nicht erlaubte Datei hochladen';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects (bucket_id, name, metadata)
    values ('fassungen', current_setting('kt.co') || '/00000000-0000-4000-8000-000000000000/deck.html', '{"size": 1}');
    raise exception 'F07: Co konnte Dateien zu einer Fassung ablegen, die es nicht gibt';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects (bucket_id, name, metadata) values ('fassungen', pfad || '/x/deck.html', '{"size": 1}');
    raise exception 'F07b: Co konnte einen zusaetzlichen Unterordner anlegen';
  exception when insufficient_privilege then null;
  end;
  update storage.objects set metadata = '{"size": 2}' where bucket_id = 'fassungen' and name = pfad || '/deck.html';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'F08: Co kann seine eigene Datei nicht ersetzen'; end if;
  -- Dateizugriff ist an den Besitzer-Ordner gebunden: eine Datei unter Nikos Ordner mit der id von Cos
  -- Fassung gehoert zu keiner Fassung, auch Co sieht sie nicht
  select count(*) into n from storage.objects
  where bucket_id = 'fassungen' and name = current_setting('kt.niko') || '/' || current_setting('kt.fassung_co') || '/deck.html';
  if n <> 0 then raise exception 'F09: Datei im fremden Ordner gilt als Teil der Fassung'; end if;
  -- unbekannte Dateinamen: grundsaetzlich gesperrt
  select count(*) into n from storage.objects where bucket_id = 'fassungen' and name = pfad || '/notiz.txt';
  if n <> 0 then raise exception 'F09b: Datei mit unbekanntem Namen ist lesbar'; end if;
end
$$;
reset role;

-- ---------------------------------------------------------------------------
-- Niko vor der Freigabe: sieht und aendert nichts (auch als Admin nicht)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', current_setting('kt.niko'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.kt_deck_fassungen where besitzer_id = current_setting('kt.co')::uuid;
  if n <> 0 then raise exception 'F10: Niko sieht % nicht freigegebene Fassungen von Co', n; end if;
  select count(*) into n from storage.objects where bucket_id = 'fassungen' and name like current_setting('kt.co') || '/%';
  if n <> 0 then raise exception 'F11: Niko sieht % Dateien fremder Fassungen', n; end if;
  update public.kt_deck_fassungen set titel = 'X' where besitzer_id = current_setting('kt.co')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'F12: Niko konnte eine fremde Fassung aendern'; end if;
  begin
    insert into public.kt_fassung_freigaben (fassung_id, trainer_id, stufe)
    values (current_setting('kt.fassung_co')::uuid, current_setting('kt.niko')::uuid, 'fassung');
    raise exception 'F13: Niko konnte sich eine fremde Fassung selbst freigeben';
  exception when insufficient_privilege then null;
  end;
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects where bucket_id = 'fassungen' and name like current_setting('kt.co') || '/%';
  get diagnostics n = row_count;
  perform set_config('storage.allow_delete_query', 'false', true);
  if n <> 0 then raise exception 'F14: Niko konnte Dateien fremder Fassungen loeschen'; end if;
end
$$;
reset role;

-- ---------------------------------------------------------------------------
-- Co gibt frei: an Niko (fassung), an Co2 (nutzen); an Co3 (kein Kurszugang) und Fremd verboten
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', current_setting('kt.co'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  insert into public.kt_fassung_freigaben (fassung_id, trainer_id, stufe) values
    (current_setting('kt.fassung_co')::uuid, current_setting('kt.niko')::uuid, 'fassung'),
    (current_setting('kt.fassung_co')::uuid, current_setting('kt.co2')::uuid, 'nutzen');
  begin
    insert into public.kt_fassung_freigaben (fassung_id, trainer_id, stufe)
    values (current_setting('kt.fassung_co')::uuid, current_setting('kt.co3')::uuid, 'nutzen');
    raise exception 'F20: Co konnte an jemanden ohne Zugang zum Kurs freigeben';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.kt_fassung_freigaben (fassung_id, trainer_id, stufe)
    values (current_setting('kt.fassung_co')::uuid, current_setting('kt.fremd')::uuid, 'nutzen');
    raise exception 'F20b: Co konnte an ein Konto ohne kt_trainer freigeben';
  exception when insufficient_privilege or foreign_key_violation then null;
  end;
end
$$;
reset role;

-- ---------------------------------------------------------------------------
-- Niko nach der Freigabe: sieht, kopiert; aendert und schreibt nichts Fremdes
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', current_setting('kt.niko'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int; fid uuid;
begin
  select count(*) into n from public.kt_deck_fassungen where id = current_setting('kt.fassung_co')::uuid;
  if n <> 1 then raise exception 'F21: Niko sieht die freigegebene Fassung nicht'; end if;
  select count(*) into n from storage.objects
  where bucket_id = 'fassungen' and name like current_setting('kt.co') || '/' || current_setting('kt.fassung_co') || '/%';
  if n <> 2 then raise exception 'F22: Niko sieht % statt 2 Dateien der freigegebenen Fassung', n; end if;

  insert into public.kt_deck_fassungen (kurstag_id, titel, grundlage_art, grundlage_fassung_id)
  values (current_setting('kt.weg_tag')::uuid, 'Nikos Kopie', 'fassung', current_setting('kt.fassung_co')::uuid)
  returning id into fid;
  if fid is null then raise exception 'F23: Niko kann keine Kopie der Fassung von Co anlegen'; end if;
  perform set_config('kt.fassung_niko', fid::text, true);
  begin
    insert into public.kt_deck_fassungen (kurstag_id, titel, grundlage_art, grundlage_fassung_id)
    values (current_setting('kt.weg_tag2')::uuid, 'falscher Tag', 'fassung', current_setting('kt.fassung_co')::uuid);
    raise exception 'F23b: Grundlage von einem anderen Kurstag wurde angenommen';
  exception when foreign_key_violation then null;
  end;

  select count(*) into n from public.kt_fassung_freigaben where fassung_id = current_setting('kt.fassung_co')::uuid;
  if n <> 1 then raise exception 'F24: Niko sieht % Freigaben der Fassung von Co statt nur seine', n; end if;

  update public.kt_deck_fassungen set titel = 'X' where id = current_setting('kt.fassung_co')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'F25: Niko konnte die freigegebene Fassung aendern'; end if;
  delete from public.kt_deck_fassungen where id = current_setting('kt.fassung_co')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'F25b: Niko konnte die freigegebene Fassung loeschen'; end if;

  begin
    insert into storage.objects (bucket_id, name, metadata)
    values ('fassungen', current_setting('kt.niko') || '/' || current_setting('kt.fassung_co') || '/deck.html', '{"size": 1}');
    raise exception 'F26: Niko konnte unter der id einer fremden Fassung in seinen Ordner schreiben';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects (bucket_id, name, metadata)
    values ('fassungen', current_setting('kt.co') || '/' || current_setting('kt.fassung_co') || '/deck.html', '{"size": 9}');
    raise exception 'F27: Niko konnte in den Ordner von Co schreiben';
  exception when insufficient_privilege or unique_violation then null;
  end;
  update storage.objects set metadata = '{"size": 9}' where bucket_id = 'fassungen' and name like current_setting('kt.co') || '/%';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'F28: Niko konnte Dateien von Co ersetzen'; end if;
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects where bucket_id = 'fassungen' and name like current_setting('kt.co') || '/%';
  get diagnostics n = row_count;
  perform set_config('storage.allow_delete_query', 'false', true);
  if n <> 0 then raise exception 'F28b: Niko konnte Dateien von Co loeschen'; end if;
end
$$;
reset role;

-- ---------------------------------------------------------------------------
-- Co2 (Kurs "nutzen"): Deck ja, Quellen nein, keine Kopie; auch mit Freigabe "fassung" gedeckelt
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', current_setting('kt.co2'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.kt_deck_fassungen where besitzer_id = current_setting('kt.co')::uuid;
  if n <> 1 then raise exception 'F30: Co2 sieht % statt 1 Fassung von Co', n; end if;
  select count(*) into n from storage.objects where bucket_id = 'fassungen' and name like current_setting('kt.co') || '/%/deck.html';
  if n <> 1 then raise exception 'F31: Co2 sieht das Deck der Fassung nicht'; end if;
  select count(*) into n from storage.objects where bucket_id = 'fassungen' and name like current_setting('kt.co') || '/%/quellen.zip';
  if n <> 0 then raise exception 'F32: Co2 sieht das Quellpaket ohne Stufe fassung'; end if;
  begin
    insert into public.kt_deck_fassungen (kurstag_id, titel, grundlage_art, grundlage_fassung_id)
    values (current_setting('kt.weg_tag')::uuid, 'Co2 Kopie', 'fassung', current_setting('kt.fassung_co')::uuid);
    raise exception 'F33: Co2 konnte ohne Stufe fassung eine Kopie anlegen';
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;

update public.kt_fassung_freigaben set stufe = 'fassung'
where fassung_id = current_setting('kt.fassung_co')::uuid and trainer_id = current_setting('kt.co2')::uuid;

set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from storage.objects where bucket_id = 'fassungen' and name like current_setting('kt.co') || '/%/quellen.zip';
  if n <> 0 then raise exception 'F34: Freigabe "fassung" hebt die Kursstufe "nutzen" auf (Quellpaket sichtbar)'; end if;
  if public.kt_fassung_stufe(current_setting('kt.fassung_co')::uuid) is distinct from 'nutzen' then
    raise exception 'F34b: Stufe an der Fassung nicht auf die Kursstufe gedeckelt';
  end if;
end
$$;
reset role;

-- Co2: Kurs "fassung", Fassung von Co nur "nutzen" -> vom Original ja, Kopie der Fassung nein
update public.kt_kurs_freigaben set stufe = 'fassung' where trainer_id = current_setting('kt.co2')::uuid;
update public.kt_fassung_freigaben set stufe = 'nutzen'
where fassung_id = current_setting('kt.fassung_co')::uuid and trainer_id = current_setting('kt.co2')::uuid;
set local role authenticated;
do $$
declare fid uuid;
begin
  insert into public.kt_deck_fassungen (kurstag_id, titel) values (current_setting('kt.weg_tag')::uuid, 'Co2 vom Original')
  returning id into fid;
  if fid is null then raise exception 'F35: Co2 kann mit Stufe fassung keine Fassung vom Original anlegen'; end if;
  begin
    insert into public.kt_deck_fassungen (kurstag_id, titel, grundlage_art, grundlage_fassung_id)
    values (current_setting('kt.weg_tag')::uuid, 'Co2 Kopie', 'fassung', current_setting('kt.fassung_co')::uuid);
    raise exception 'F36: Co2 konnte eine nur zum Ansehen freigegebene Fassung kopieren';
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;

-- Co zieht die Freigabe an Niko zurueck: Nikos Kopie bleibt aenderbar
select set_config('request.jwt.claims', json_build_object('sub', current_setting('kt.co'), 'role', 'authenticated')::text, true);
set local role authenticated;
delete from public.kt_fassung_freigaben where fassung_id = current_setting('kt.fassung_co')::uuid and trainer_id = current_setting('kt.niko')::uuid;
reset role;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('kt.niko'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  update public.kt_deck_fassungen set titel = 'Nikos Kopie, neu' where id = current_setting('kt.fassung_niko')::uuid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'F37: Nikos Kopie ist nach Entzug der Grundlage nicht mehr aenderbar'; end if;
  if exists (select 1 from public.kt_deck_fassungen where id = current_setting('kt.fassung_co')::uuid) then
    raise exception 'F38: Niko sieht die Fassung von Co nach dem Entzug weiter';
  end if;
end
$$;
reset role;

-- ---------------------------------------------------------------------------
-- Co3 (kein Kurszugang) und Fremd: nichts
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', current_setting('kt.co3'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  if exists (select 1 from public.kt_deck_fassungen where besitzer_id = current_setting('kt.co')::uuid) then raise exception 'F40: Co3 sieht Fassungen'; end if;
  if exists (select 1 from storage.objects where bucket_id = 'fassungen' and name like current_setting('kt.co') || '/%') then
    raise exception 'F41: Co3 sieht Dateien';
  end if;
  if public.kt_kurs_zugang_von(current_setting('kt.co')::uuid, current_setting('kt.weg')::uuid) then
    raise exception 'F42: Co3 erfaehrt ohne eigenen Kurszugang, ob Co Zugang hat';
  end if;
end
$$;
reset role;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('kt.fremd'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  if exists (select 1 from public.kt_deck_fassungen) then raise exception 'F43: fremdes Konto sieht Fassungen'; end if;
  if exists (select 1 from storage.objects where bucket_id = 'fassungen') then raise exception 'F44: fremdes Konto sieht Dateien'; end if;
  if exists (select 1 from public.kt_fassung_freigaben) then raise exception 'F45: fremdes Konto sieht Freigaben'; end if;
  if public.kt_fassung_kurs(current_setting('kt.fassung_co')::uuid) is not null then
    raise exception 'F46: fremdes Konto erfaehrt den Kurs einer Fassung';
  end if;
  begin
    insert into public.kt_deck_fassungen (kurstag_id, titel) values (current_setting('kt.weg_tag')::uuid, 'fremd');
    raise exception 'F47: fremdes Konto konnte eine Fassung anlegen';
  exception when insufficient_privilege or foreign_key_violation then null;
  end;
end
$$;
reset role;

-- Co2 sieht (mit Kurszugang) den Zugang von Co: die App braucht das fuer die Auswahl beim Freigeben
select set_config('request.jwt.claims', json_build_object('sub', current_setting('kt.co2'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  if not public.kt_kurs_zugang_von(current_setting('kt.co')::uuid, current_setting('kt.weg')::uuid) then
    raise exception 'F48: kt_kurs_zugang_von erkennt den Zugang eines Trainers nicht';
  end if;
end
$$;
reset role;

-- ---------------------------------------------------------------------------
-- Niko nimmt Co die Kursfreigabe: Co sieht seine Fassung nicht mehr und kann nicht freigeben;
-- gibt Niko sie wieder frei, ist alles wieder da
-- ---------------------------------------------------------------------------
delete from public.kt_kurs_freigaben where trainer_id = current_setting('kt.co')::uuid;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('kt.co'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  if exists (select 1 from public.kt_deck_fassungen where besitzer_id = current_setting('kt.co')::uuid) then
    raise exception 'F50: Co sieht seine Fassung ohne Kurszugang';
  end if;
  if exists (select 1 from storage.objects where bucket_id = 'fassungen' and name like current_setting('kt.co') || '/%') then
    raise exception 'F51: Co sieht Dateien ohne Kurszugang';
  end if;
  begin
    insert into public.kt_fassung_freigaben (fassung_id, trainer_id, stufe)
    values (current_setting('kt.fassung_co')::uuid, current_setting('kt.niko')::uuid, 'nutzen');
    raise exception 'F52: Co konnte ohne Kurszugang freigeben';
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;

insert into public.kt_kurs_freigaben (kurs_id, trainer_id, stufe)
values (current_setting('kt.weg')::uuid, current_setting('kt.co')::uuid, 'fassung');
set local role authenticated;
do $$
begin
  if not exists (select 1 from public.kt_deck_fassungen where id = current_setting('kt.fassung_co')::uuid) then
    raise exception 'F53: Co sieht seine Fassung nach erneuter Freigabe nicht';
  end if;
end
$$;
reset role;

-- Ein Kurstag mit Fassungen laesst sich nicht loeschen (keine Kaskade auf fremde Inhalte)
do $$
begin
  begin
    delete from public.kurstage where id = current_setting('kt.weg_tag')::uuid;
    raise exception 'F55: Kurstag mit fremden Fassungen liess sich loeschen';
  exception when foreign_key_violation then null;
  end;
end
$$;

-- anon
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
set local role anon;
do $$
begin
  begin
    perform 1 from public.kt_deck_fassungen;
    raise exception 'F60: anon kann Fassungen lesen';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.kt_fassung_freigaben;
    raise exception 'F61: anon kann Freigaben von Fassungen lesen';
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;

rollback;
