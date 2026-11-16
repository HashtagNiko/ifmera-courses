-- Rechte-Test zu Baustein 10: eigene Kurse im Tool, Startpaket (CLAUDE.md §4 Nr. 5).
--
--   node scripts/sql.mjs supabase/tests/20261116100000_kt_eigene_kurse_test.sql
--
-- Endet mit ROLLBACK. Erfolg = keine Ausgabe, kein Fehler. Jeder Fehler nennt seine Nummer (E..).
-- Alle Zaehlungen beziehen sich nur auf Testdaten (Kuerzel und Dateien beginnen mit "kt-test-").
-- Personen:
--   Niko     Admin (legt einen Testkurs an, wie der Deck-Sync)
--   Co       aktiver Trainer, legt einen eigenen Kurs an
--   Co2      aktiver Trainer ohne Freigabe
--   Inaktiv  Trainer, aber nicht aktiv
--   Fremd    Konto ohne kt_trainer (steht auch fuer Pruefungstool-Konten)

begin;

set local lock_timeout = '3s';
-- Supabase sperrt DELETE auf Storage-Tabellen per Trigger fuer alle; nur in diesem (zurueckgerollten)
-- Test aufgehoben, damit die Loeschregeln selbst geprueft werden koennen
select set_config('storage.allow_delete_query', 'true', true);

insert into public.eingeladene_trainer (email) values
  ('kt-test-co@example.invalid'), ('kt-test-co2@example.invalid'),
  ('kt-test-inaktiv@example.invalid'), ('kt-test-fremd@example.invalid');
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000000c1', 'kt-test-co@example.invalid',      'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000c2', 'kt-test-co2@example.invalid',     'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000d1', 'kt-test-inaktiv@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000f1', 'kt-test-fremd@example.invalid',   'authenticated', 'authenticated');
insert into public.kt_trainer (id, anzeigename, rolle, aktiv) values
  ('00000000-0000-4000-8000-0000000000c1', 'Test Co', 'trainer', true),
  ('00000000-0000-4000-8000-0000000000c2', 'Test Co2', 'trainer', true),
  ('00000000-0000-4000-8000-0000000000d1', 'Test Inaktiv', 'trainer', false);

select set_config('kt.niko', (select t.id::text from public.kt_trainer t where t.rolle = 'admin' and t.aktiv limit 1), true);
select set_config('kt.co',      '00000000-0000-4000-8000-0000000000c1', true);
select set_config('kt.co2',     '00000000-0000-4000-8000-0000000000c2', true);
select set_config('kt.inaktiv', '00000000-0000-4000-8000-0000000000d1', true);
select set_config('kt.fremd',   '00000000-0000-4000-8000-0000000000f1', true);

-- Dateien als postgres: ein verwaister Ordner (wie Reste eines geloeschten Kurses) und ein Startpaket
insert into storage.objects (bucket_id, name, metadata) values
  ('decks', 'kt-test-verwaist-ccccc/alt.html', '{"size": 1}'),
  ('kt-vorlagen', 'kt-test-start.zip', '{"size": 1}');

do $$
begin
  if nullif(current_setting('kt.niko', true), '') is null then raise exception 'E00: Testgrundlage fehlt'; end if;
  if exists (select 1 from public.kurse where slug like 'kt-test-%') then raise exception 'E00b: Testkuerzel schon vergeben'; end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Niko: Testkurs anlegen wie der Deck-Sync (Upsert auf slug), ein Deck hochladen, dann erneut
-- synchronisieren: Der zweite Upsert muss gelingen, obwohl unter dem Kuerzel jetzt Dateien liegen.
-- Ein verwaistes Kuerzel bekommt auch der Admin nicht.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', current_setting('kt.niko'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  insert into public.kurse (slug, name) values ('kt-test-niko-bbbbb', 'Testkurs Niko')
  on conflict (slug) do update set slug = excluded.slug, name = excluded.name;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'E01: Kurs per Upsert nicht angelegt'; end if;
  insert into storage.objects (bucket_id, name, metadata) values ('decks', 'kt-test-niko-bbbbb/trainer/Tag1.html', '{"size": 1}');
  insert into public.kurse (slug, name) values ('kt-test-niko-bbbbb', 'Testkurs Niko neu')
  on conflict (slug) do update set slug = excluded.slug, name = excluded.name;
  if (select name from public.kurse where slug = 'kt-test-niko-bbbbb') <> 'Testkurs Niko neu' then
    raise exception 'E02: Upsert eines bestehenden Kurses (Deck-Sync) scheitert';
  end if;
  if (select angelegt_im_tool from public.kurse where slug = 'kt-test-niko-bbbbb') then
    raise exception 'E03: per Sync angelegter Kurs gilt als im Tool angelegt';
  end if;
  insert into public.kurstage (kurs_id, art, nummer, deck_pfad)
  values ((select id from public.kurse where slug = 'kt-test-niko-bbbbb'), 'kurstag', 1, 'kt-test-niko-bbbbb/trainer/Tag1.html');
  -- Admin-Kuerzel duerfen ohne Zufallsendung sein (Deck-Sync), das Format gilt trotzdem
  insert into public.kurse (slug, name) values ('kt-test-admin', 'Kurs ohne Endung');
  begin
    insert into public.kurse (slug, name) values ('Kt-Test-Gross', 'Kurs');
    raise exception 'E04: Admin konnte ein Kuerzel in falschem Format anlegen';
  exception when check_violation then null;
  end;
  begin
    insert into public.kurse (slug, name) values ('kt-test-verwaist-ccccc', 'Kurs');
    raise exception 'E05: Admin bekam ein Kuerzel mit verwaisten Dateien';
  exception when unique_violation then null;
  end;
  begin
    insert into public.kurse (slug, name) values ('kt-test-verwaist-ccccc', 'Kurs')
    on conflict (slug) do update set slug = excluded.slug, name = excluded.name;
    raise exception 'E06: Admin bekam ein Kuerzel mit verwaisten Dateien per Upsert';
  exception when unique_violation then null;
  end;
end
$$;
reset role;

select set_config('kt.niko_kurs', (select k.id::text from public.kurse k where k.slug = 'kt-test-niko-bbbbb'), true);

-- ---------------------------------------------------------------------------
-- Co: eigener Kurs, Kuerzel, Name
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', current_setting('kt.co'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int; k text;
begin
  insert into public.kurse (slug, name, besitzer_id, angelegt_im_tool)
  values ('kt-test-eigen-aaaaa', '  Mein   Testkurs  ', current_setting('kt.co')::uuid, true);
  select count(*) into n from public.kurse where slug = 'kt-test-eigen-aaaaa';
  if n <> 1 then raise exception 'E10: Co sieht seinen neuen Kurs nicht'; end if;
  if (select name from public.kurse where slug = 'kt-test-eigen-aaaaa') <> 'Mein Testkurs' then
    raise exception 'E11: Kursname nicht bereinigt';
  end if;

  -- ungueltige Kuerzel, auch gueltige ohne Zufallsendung (Nicht-Admin)
  foreach k in array array['Kt-test-gross-aaaaa', 'k', '-kt-test-aaaaa', 'kt-test/x-aaaaa', 'kt_test-aaaaa', '..',
                           'kt-test-%-aaaaa', repeat('a', 35) || '-aaaaa', '', 'kt-test-ohne', 'kt-test-aaaa1'] loop
    begin
      insert into public.kurse (slug, name, angelegt_im_tool) values (k, 'Kurs', true);
      raise exception 'E12: ungueltiges Kuerzel angenommen: %', k;
    exception when check_violation then null;
    end;
  end loop;

  -- Kuerzel eines verwaisten Ordners: belegt
  begin
    insert into public.kurse (slug, name, angelegt_im_tool) values ('kt-test-verwaist-ccccc', 'Kurs', true);
    raise exception 'E13: Kurs mit dem Kuerzel eines verwaisten Ordners angelegt';
  exception when unique_violation then null;
  end;

  -- Kuerzel eines bestehenden fremden Kurses: belegt, und kein Kapern per Upsert
  begin
    insert into public.kurse (slug, name, angelegt_im_tool) values ('kt-test-niko-bbbbb', 'Kurs', true);
    raise exception 'E14: Kurs mit fremdem Kuerzel angelegt';
  exception when unique_violation then null;
  end;
  begin
    insert into public.kurse (slug, name) values ('kt-test-niko-bbbbb', 'Gekapert')
    on conflict (slug) do update set name = excluded.name;
    raise exception 'E15: Co konnte Nikos Kurs per Upsert umbenennen';
  exception when insufficient_privilege then null;
  end;
  -- Kurs auf einen anderen Besitzer anlegen
  begin
    insert into public.kurse (slug, name, besitzer_id) values ('kt-test-fuer-niko-aaaaa', 'Kurs', current_setting('kt.niko')::uuid);
    raise exception 'E15b: Co konnte einen Kurs auf Niko anlegen';
  exception when insufficient_privilege then null;
  end;

  -- Kuerzel und Kennzeichen bleiben, Name nur gueltig
  begin
    update public.kurse set slug = 'kt-test-anders-aaaaa' where slug = 'kt-test-eigen-aaaaa';
    raise exception 'E16: Kuerzel geaendert';
  exception when check_violation then null;
  end;
  begin
    update public.kurse set angelegt_im_tool = false where slug = 'kt-test-eigen-aaaaa';
    raise exception 'E16b: Kennzeichen geaendert';
  exception when check_violation then null;
  end;
  foreach k in array array['X', 'Kurs <b>fett</b>', 'Kurs' || chr(8203) || 'x', 'Kurs ' || chr(8238) || 'x',
                           'Kurs' || chr(7) || 'x', 'Kurs' || chr(150) || 'x', 'Kurs' || chr(1564) || 'x', repeat('n', 81)] loop
    begin
      update public.kurse set name = k where slug = 'kt-test-eigen-aaaaa';
      raise exception 'E17: ungueltiger Kursname angenommen: %', left(k, 20);
    exception when check_violation then null;
    end;
  end loop;
  update public.kurse set name = 'Testkurs Co' where slug = 'kt-test-eigen-aaaaa';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'E18: Co kann seinen Kurs nicht umbenennen'; end if;

  -- fremde Kurse sieht Co nicht
  select count(*) into n from public.kurse where slug = 'kt-test-niko-bbbbb';
  if n <> 0 then raise exception 'E19: Co sieht Nikos Kurs ohne Freigabe'; end if;
end
$$;

-- Co: Kurstage und ihre Dateipfade
do $$
declare n int; p text; spalte text; kurs uuid := (select id from public.kurse where slug = 'kt-test-eigen-aaaaa');
begin
  insert into public.kurstage (kurs_id, art, nummer, titel, deck_pfad, teilnehmer_pfad, pdf_pfad, quellen_pfad)
  values (kurs, 'kurstag', 1, 'Erster Tag', 'kt-test-eigen-aaaaa/trainer/Tag1.html', 'kt-test-eigen-aaaaa/teilnehmer/Tag1.html',
          'kt-test-eigen-aaaaa/pdf/Tag1.pdf', 'kt-test-eigen-aaaaa/quellen/Tag1.zip');
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'E20: Co kann keinen Kurstag anlegen'; end if;

  foreach p in array array[
    'kt-test-niko-bbbbb/trainer/Tag1.html',          -- fremder Kurs
    'kt-test-eigen-aaaaa/quellen/Tag1.html',         -- falscher Unterordner fuer deck_pfad
    'kt-test-eigen-aaaaa/trainer/x/Tag1.html',       -- zusaetzlicher Ordner
    'kt-test-eigen-aaaaa/trainer/../Tag1.html',
    'kt-test-eigen-aaaaa/trainer/',                  -- ohne Dateiname
    'kt-test-eigen-aaaaa/trainer/..',
    'kt-test-eigen-aaaaa/Tag1.html',
    '/kt-test-eigen-aaaaa/trainer/Tag1.html',
    'kt-test-eigen-aaaaa/trainer/a\b.html',          -- Backslash
    'kt-test-eigen-aaaaa/trainer/a' || chr(10) || 'b.html'
  ] loop
    begin
      insert into public.kurstage (kurs_id, art, nummer, deck_pfad) values (kurs, 'kurstag', 2, p);
      raise exception 'E21: ungueltiger Pfad angenommen: %', p;
    exception when check_violation then null;
    end;
    begin
      update public.kurstage set deck_pfad = p where kurs_id = kurs and nummer = 1;
      raise exception 'E22: ungueltiger Pfad per Aenderung angenommen: %', p;
    exception when check_violation then null;
    end;
  end loop;
  -- jede Spalte nur in ihrem Unterordner (hier jeweils der Trainerordner, nur fuer deck_pfad richtig)
  foreach spalte in array array['teilnehmer_pfad', 'pdf_pfad', 'quellen_pfad', 'trainer_kurz_pfad', 'quellen_kurz_pfad'] loop
    begin
      execute format('update public.kurstage set %I = %L where kurs_id = %L and nummer = 1',
                     spalte, 'kt-test-eigen-aaaaa/trainer/Tag1.html', kurs);
      raise exception 'E23: % im Trainerordner angenommen', spalte;
    exception when check_violation then null;
    end;
  end loop;

  -- in Nikos Kurs: keine Tage
  begin
    insert into public.kurstage (kurs_id, art, nummer)
    values ((select k.id from public.kurse k where k.slug = 'kt-test-niko-bbbbb'), 'kurstag', 9);
    raise exception 'E24: Co konnte einen Tag in einem fremden Kurs anlegen';
  exception when insufficient_privilege then null;
  end;
end
$$;

-- Co: Dateien im Bucket decks und das Startpaket
do $$
declare n int;
begin
  insert into storage.objects (bucket_id, name, metadata) values ('decks', 'kt-test-eigen-aaaaa/trainer/Tag1.html', '{"size": 1}');
  select count(*) into n from storage.objects where bucket_id = 'decks' and name = 'kt-test-eigen-aaaaa/trainer/Tag1.html';
  if n <> 1 then raise exception 'E30: Co sieht seine eigene Datei nicht'; end if;
  begin
    insert into storage.objects (bucket_id, name, metadata) values ('decks', 'kt-test-niko-bbbbb/trainer/Tag2.html', '{"size": 1}');
    raise exception 'E31: Co konnte in Nikos Kursordner schreiben';
  exception when insufficient_privilege then null;
  end;
  select count(*) into n from storage.objects where bucket_id = 'decks' and name like 'kt-test-niko-bbbbb/%';
  if n <> 0 then raise exception 'E32: Co sieht Dateien in Nikos Kursordner'; end if;
  select count(*) into n from storage.objects where bucket_id = 'decks' and name like 'kt-test-verwaist-ccccc/%';
  if n <> 0 then raise exception 'E33: Co sieht verwaiste Dateien'; end if;

  select count(*) into n from storage.objects where bucket_id = 'kt-vorlagen' and name = 'kt-test-start.zip';
  if n <> 1 then raise exception 'E34: Co kann das Startpaket nicht lesen'; end if;
  begin
    insert into storage.objects (bucket_id, name, metadata) values ('kt-vorlagen', 'kt-test-eigenes.zip', '{"size": 1}');
    raise exception 'E35: Co konnte ins Startpaket-Bucket schreiben';
  exception when insufficient_privilege then null;
  end;
  update storage.objects set metadata = '{"size": 2}' where bucket_id = 'kt-vorlagen' and name = 'kt-test-start.zip';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'E36: Co konnte das Startpaket ersetzen'; end if;
  delete from storage.objects where bucket_id = 'kt-vorlagen' and name = 'kt-test-start.zip';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'E37: Co konnte das Startpaket loeschen'; end if;
  delete from storage.objects where bucket_id = 'decks' and name like 'kt-test-niko-bbbbb/%';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'E38: Co konnte Nikos Dateien loeschen'; end if;
  delete from storage.objects where bucket_id = 'decks' and name like 'kt-test-verwaist-ccccc/%';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'E39: Co konnte verwaiste Dateien loeschen'; end if;
end
$$;
reset role;

-- ---------------------------------------------------------------------------
-- Niko und Co2 sehen Cos Kurs nicht (ohne Freigabe); Niko darf das Startpaket pflegen
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', current_setting('kt.niko'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.kurse where slug = 'kt-test-eigen-aaaaa';
  if n <> 0 then raise exception 'E40: Niko sieht Cos Kurs ohne Freigabe'; end if;
  select count(*) into n from storage.objects where bucket_id = 'decks' and name like 'kt-test-eigen-aaaaa/%';
  if n <> 0 then raise exception 'E41: Niko sieht Cos Dateien ohne Freigabe'; end if;
  insert into storage.objects (bucket_id, name, metadata) values ('kt-vorlagen', 'kt-test-neu.zip', '{"size": 1}');
  update storage.objects set metadata = '{"size": 2}' where bucket_id = 'kt-vorlagen' and name = 'kt-test-start.zip';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'E42: Niko kann das Startpaket nicht ersetzen'; end if;
  delete from storage.objects where bucket_id = 'kt-vorlagen' and name = 'kt-test-neu.zip';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'E42b: Niko kann ein Startpaket nicht loeschen'; end if;
end
$$;
reset role;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('kt.co2'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.kurse where slug in ('kt-test-eigen-aaaaa', 'kt-test-niko-bbbbb');
  if n <> 0 then raise exception 'E43: Co2 sieht fremde Kurse ohne Freigabe'; end if;
  select count(*) into n from storage.objects where bucket_id = 'decks' and name like 'kt-test-%';
  if n <> 0 then raise exception 'E44: Co2 sieht fremde Dateien'; end if;
  select count(*) into n from storage.objects where bucket_id = 'kt-vorlagen' and name = 'kt-test-start.zip';
  if n <> 1 then raise exception 'E45: Co2 kann das Startpaket nicht lesen'; end if;
end
$$;
reset role;

-- ---------------------------------------------------------------------------
-- Inaktiv, Fremd, anon: kein Kurs, kein Startpaket, und keine Auskunft ueber Kuerzel (immer 42501)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', current_setting('kt.inaktiv'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int; k text;
begin
  foreach k in array array['kt-test-inaktiv-aaaaa', 'kt-test-verwaist-ccccc', 'kt-test-niko-bbbbb', 'Ungueltig'] loop
    begin
      insert into public.kurse (slug, name, angelegt_im_tool) values (k, 'Kurs', true);
      raise exception 'E50: Inaktiv konnte einen Kurs anlegen: %', k;
    exception when insufficient_privilege then null;
    end;
  end loop;
  select count(*) into n from storage.objects where bucket_id = 'kt-vorlagen' and name like 'kt-test-%';
  if n <> 0 then raise exception 'E51: Inaktiv sieht das Startpaket'; end if;
end
$$;
reset role;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('kt.fremd'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int; k text;
begin
  foreach k in array array['kt-test-fremd-aaaaa', 'kt-test-verwaist-ccccc', 'kt-test-niko-bbbbb', 'Ungueltig'] loop
    begin
      insert into public.kurse (slug, name, angelegt_im_tool) values (k, 'Kurs', true);
      raise exception 'E52: Fremd konnte einen Kurs anlegen: %', k;
    exception when insufficient_privilege then null;
    end;
  end loop;
  -- in einen echten Kurs (Nikos Testkurs), mit gueltigem und mit ungueltigem Pfad: immer 42501
  foreach k in array array['kt-test-niko-bbbbb/trainer/Tag2.html', 'x'] loop
    begin
      insert into public.kurstage (kurs_id, art, nummer, deck_pfad)
      values (current_setting('kt.niko_kurs')::uuid, 'kurstag', 99, k);
      raise exception 'E52b: Fremd konnte einen Kurstag anlegen: %', k;
    exception when insufficient_privilege then null;
    end;
  end loop;
  select count(*) into n from storage.objects where bucket_id = 'kt-vorlagen' and name like 'kt-test-%';
  if n <> 0 then raise exception 'E53: Fremd sieht das Startpaket'; end if;
end
$$;
reset role;

select set_config('request.jwt.claims', '', true);
set local role anon;
do $$
declare n int;
begin
  begin
    insert into public.kurse (slug, name) values ('kt-test-anon-aaaaa', 'Kurs');
    raise exception 'E54: anon konnte einen Kurs anlegen';
  exception when insufficient_privilege then null;
  end;
  begin
    select count(*) into n from storage.objects where bucket_id = 'kt-vorlagen' and name like 'kt-test-%';
    if n <> 0 then raise exception 'E55: anon sieht das Startpaket'; end if;
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;

-- ---------------------------------------------------------------------------
-- Co loescht seinen Kurs: erst wenn die Dateien weg sind (keine verwaisten Dateien); danach ist das
-- Kuerzel wieder frei
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', current_setting('kt.co'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  begin
    delete from public.kurse where slug = 'kt-test-eigen-aaaaa';
    raise exception 'E60: Kurs mit Dateien geloescht (Dateien waeren verwaist)';
  exception when dependent_objects_still_exist then null;
  end;
  delete from storage.objects where bucket_id = 'decks' and name like 'kt-test-eigen-aaaaa/%';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'E61: Co kann seine eigenen Dateien nicht loeschen'; end if;
  delete from public.kurse where slug = 'kt-test-eigen-aaaaa';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'E62: Co kann seinen Kurs ohne Dateien nicht loeschen'; end if;
  insert into public.kurse (slug, name, angelegt_im_tool) values ('kt-test-eigen-aaaaa', 'Wieder da', true);
  delete from public.kurse where slug = 'kt-test-niko-bbbbb';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'E63: Co konnte Nikos Kurs loeschen'; end if;
end
$$;
reset role;

do $$
begin
  if (select count(*) from public.kurstage t join public.kurse k on k.id = t.kurs_id where k.slug = 'kt-test-niko-bbbbb') <> 1
     or (select name from public.kurse where slug = 'kt-test-niko-bbbbb') <> 'Testkurs Niko neu' then
    raise exception 'E64: Nikos Testkurs wurde veraendert';
  end if;
  if (select count(*) from storage.objects where bucket_id = 'kt-vorlagen' and name = 'kt-test-start.zip') <> 1 then
    raise exception 'E65: Startpaket verschwunden';
  end if;
  if (select count(*) from storage.objects where bucket_id = 'decks' and name like 'kt-test-verwaist-ccccc/%') <> 1 then
    raise exception 'E66: verwaiste Testdatei verschwunden';
  end if;
end
$$;

rollback;
