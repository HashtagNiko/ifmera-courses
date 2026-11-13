-- Rechte-Test zu Baustein 1, Schritt C (CLAUDE.md §4 Nr. 5).
--
--   nach dem Einspielen:  node scripts/sql.mjs supabase/tests/20261113160000_kt_regeln_nach_besitz_test.sql
--   als Probelauf vorher: Migration ohne begin/commit + dieser Test ohne begin/rollback in EINER
--                         Transaktion, die zurueckgerollt wird (siehe CHANGELOG, Baustein 1)
--
-- Endet mit ROLLBACK; Testkonten, Freigaben, Durchlaeufe und Test-Dateieintraege verschwinden wieder.
-- Erfolg = keine Ausgabe, kein Fehler. Jeder Fehler nennt seine Nummer (C..).
--
-- Personen wie im Test zu Schritt A: Niko (Besitzer von allem), Co (Freigabe "nutzen" auf weg),
-- Inaktiv (abgeschaltet, Freigabe auf hg), Fremd (nur Pruefungstool), anon.

begin;

-- ---------------------------------------------------------------------------
-- Testdaten (nur in dieser Transaktion)
-- ---------------------------------------------------------------------------
insert into public.eingeladene_trainer (email) values
  ('kt-test-co@example.invalid'),
  ('kt-test-inaktiv@example.invalid'),
  ('kt-test-fremd@example.invalid');

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000000c1', 'kt-test-co@example.invalid',      'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000d1', 'kt-test-inaktiv@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000f1', 'kt-test-fremd@example.invalid',   'authenticated', 'authenticated');

insert into public.kt_trainer (id, anzeigename, rolle, aktiv) values
  ('00000000-0000-4000-8000-0000000000c1', 'Test Co',      'trainer', true),
  ('00000000-0000-4000-8000-0000000000d1', 'Test Inaktiv', 'trainer', false);

insert into public.kt_kurs_freigaben (kurs_id, trainer_id, stufe) values
  ((select id from public.kurse where slug = 'weg'), '00000000-0000-4000-8000-0000000000c1', 'nutzen'),
  ((select id from public.kurse where slug = 'hg'),  '00000000-0000-4000-8000-0000000000d1', 'fassung');

-- Ein Quellpaket-Eintrag im Bucket (nur der Datensatz, keine Datei), um die Stufe "fassung" zu pruefen
insert into storage.objects (bucket_id, name, owner, metadata)
values ('decks', 'weg/quellen/kt-test.zip', null, '{"size": 1}');

-- Downloads (Baustein 2): Teilnehmerfassung und PDF, bei weg und bei hg
insert into storage.objects (bucket_id, name, owner, metadata) values
  ('decks', 'weg/teilnehmer/kt-test.html', null, '{"size": 1}'),
  ('decks', 'weg/pdf/kt-test.pdf',         null, '{"size": 1}'),
  ('decks', 'hg/pdf/kt-test.pdf',          null, '{"size": 1}');

select set_config('kt.niko',  (select t.id::text from public.kt_trainer t where t.rolle = 'admin'), true);
select set_config('kt.co',    '00000000-0000-4000-8000-0000000000c1', true);
select set_config('kt.weg',   (select k.id::text from public.kurse k where k.slug = 'weg'), true);
select set_config('kt.hg',    (select k.id::text from public.kurse k where k.slug = 'hg'), true);
-- ein Durchlauf von Niko mit einem noch nicht abgehakten Tag, damit C31 an den Regeln scheitert und
-- nicht an der Eindeutigkeit (durchlauf_id, kurstag_id)
select set_config('kt.niko_durchlauf', (
  select d.id::text from public.durchlaeufe d
  where exists (select 1 from public.kurstage t where t.kurs_id = d.kurs_id
                and not exists (select 1 from public.fortschritt f where f.durchlauf_id = d.id and f.kurstag_id = t.id))
  limit 1), true);
select set_config('kt.niko_freier_tag', (
  select t.id::text from public.kurstage t
  where t.kurs_id = (select d.kurs_id from public.durchlaeufe d where d.id = current_setting('kt.niko_durchlauf')::uuid)
    and not exists (select 1 from public.fortschritt f
                    where f.durchlauf_id = current_setting('kt.niko_durchlauf')::uuid and f.kurstag_id = t.id)
  limit 1), true);
select set_config('kt.weg_tag', (select t.id::text from public.kurstage t
                                  where t.kurs_id = (select id from public.kurse where slug = 'weg') limit 1), true);
select set_config('kt.hg_tag',  (select t.id::text from public.kurstage t
                                  where t.kurs_id = (select id from public.kurse where slug = 'hg') limit 1), true);
select set_config('kt.n_kurse',       (select count(*)::text from public.kurse), true);
select set_config('kt.n_kurstage',    (select count(*)::text from public.kurstage), true);
select set_config('kt.n_weg_tage',    (select count(*)::text from public.kurstage
                                       where kurs_id = (select id from public.kurse where slug = 'weg')), true);
select set_config('kt.n_durchlaeufe', (select count(*)::text from public.durchlaeufe), true);
select set_config('kt.n_fortschritt', (select count(*)::text from public.fortschritt), true);
select set_config('kt.n_dateien',     (select count(*)::text from storage.objects where bucket_id = 'decks'), true);

-- Ohne diese Grundlage wuerden einzelne Pruefungen ins Leere laufen und faelschlich bestehen.
do $$
begin
  if nullif(current_setting('kt.niko', true), '') is null
     or nullif(current_setting('kt.weg', true), '') is null
     or nullif(current_setting('kt.hg', true), '') is null
     or nullif(current_setting('kt.weg_tag', true), '') is null
     or nullif(current_setting('kt.niko_durchlauf', true), '') is null
     or nullif(current_setting('kt.niko_freier_tag', true), '') is null then
    raise exception 'C00: Testgrundlage fehlt (Kurs, Kurstag oder Durchlauf nicht gefunden)';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'decks' and name like 'weg/trainer/%') then
    raise exception 'C00: keine Decks von weg im Bucket';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Als Niko: alles wie bisher
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('kt.niko'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare n int;
begin
  select count(*) into n from public.kurse;
  if n <> current_setting('kt.n_kurse')::int then raise exception 'C01: Niko sieht % statt % Kurse', n, current_setting('kt.n_kurse'); end if;
  select count(*) into n from public.kurstage;
  if n <> current_setting('kt.n_kurstage')::int then raise exception 'C02: Niko sieht % Kurstage', n; end if;
  select count(*) into n from public.durchlaeufe;
  if n <> current_setting('kt.n_durchlaeufe')::int then raise exception 'C03: Niko sieht % Durchlaeufe', n; end if;
  select count(*) into n from public.fortschritt;
  if n <> current_setting('kt.n_fortschritt')::int then raise exception 'C04: Niko sieht % Haken', n; end if;
  -- alle Dateien: eigene Kurse, Quellen, verwaiste Testdateien (als Admin)
  select count(*) into n from storage.objects where bucket_id = 'decks';
  if n <> current_setting('kt.n_dateien')::int then raise exception 'C05: Niko sieht % von % Dateien', n, current_setting('kt.n_dateien'); end if;

  -- aendern wie bisher (Sync, Import)
  update public.kurse set name = name where slug = 'weg';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'C06: Niko kann seinen Kurs nicht aendern'; end if;
  update public.kurstage set titel = titel where id = current_setting('kt.weg_tag')::uuid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'C07: Niko kann seinen Kurstag nicht aendern'; end if;

  -- den Besitz weitergeben: verboten
  begin
    update public.kurse set besitzer_id = current_setting('kt.co')::uuid where slug = 'weg';
    raise exception 'C08: Niko konnte den Besitz weitergeben';
  exception when insufficient_privilege then null;
  end;

  -- neuer Kurs wie beim Deck-Sync: upsert auf das Kuerzel und gleich zuruecklesen (RETURNING)
  insert into public.kurse (slug, name) values ('kt-test-neu', 'Test')
  on conflict (slug) do update set name = excluded.name
  returning 1 into n;
  if n is distinct from 1 then raise exception 'C09: Niko kann keinen neuen Kurs anlegen und zuruecklesen'; end if;

  -- neuer Durchlauf und Haken wie bisher
  insert into public.durchlaeufe (kurs_id, name) values (current_setting('kt.weg')::uuid, 'kt-test Niko');
  update public.fortschritt set vermittelt = vermittelt where durchlauf_id = current_setting('kt.niko_durchlauf')::uuid;
end
$$;

reset role;

-- ---------------------------------------------------------------------------
-- Als Co-Trainer mit Freigabe "nutzen" auf weg
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('kt.co'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  n int;
  eigener uuid;
begin
  select count(*) into n from public.kurse;
  if n <> 1 then raise exception 'C20: Co sieht % Kurse statt 1', n; end if;
  if not exists (select 1 from public.kurse where slug = 'weg') then raise exception 'C21: Co sieht weg nicht'; end if;
  select count(*) into n from public.kurstage;
  if n <> current_setting('kt.n_weg_tage')::int then raise exception 'C22: Co sieht % Kurstage statt nur die von weg', n; end if;

  -- nichts aendern, nichts loeschen
  update public.kurse set name = 'X' where slug = 'weg';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'C23: Co konnte Nikos Kurs aendern'; end if;
  update public.kurstage set titel = 'X' where id = current_setting('kt.weg_tag')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'C24: Co konnte Nikos Kurstag aendern'; end if;
  delete from public.kurstage where id = current_setting('kt.weg_tag')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'C25: Co konnte Nikos Kurstag loeschen'; end if;
  delete from public.kurse where slug = 'weg';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'C26: Co konnte Nikos Kurs loeschen'; end if;
  begin
    insert into public.kurstage (kurs_id, art, nummer) values (current_setting('kt.weg')::uuid, 'kurstag', 999);
    raise exception 'C27: Co konnte in Nikos Kurs einen Tag anlegen';
  exception when insufficient_privilege then null;
  end;
  -- einen Kurs unter fremdem Namen anlegen: verboten
  begin
    insert into public.kurse (slug, name, besitzer_id) values ('kt-test-x', 'X', current_setting('kt.niko')::uuid);
    raise exception 'C28: Co konnte einen Kurs auf Nikos Namen anlegen';
  exception when insufficient_privilege then null;
  end;

  -- Nikos Durchlaeufe und Haken: unsichtbar und unveraenderlich
  select count(*) into n from public.durchlaeufe;
  if n <> 0 then raise exception 'C29: Co sieht % fremde Durchlaeufe', n; end if;
  select count(*) into n from public.fortschritt;
  if n <> 0 then raise exception 'C30: Co sieht % fremde Haken', n; end if;
  begin
    insert into public.fortschritt (durchlauf_id, kurstag_id, vermittelt)
    values (current_setting('kt.niko_durchlauf')::uuid, current_setting('kt.niko_freier_tag')::uuid, true);
    raise exception 'C31: Co konnte in Nikos Durchlauf abhaken';
  exception when insufficient_privilege then null;
  end;

  -- eigener Durchlauf zu weg: erlaubt; zu hg (keine Freigabe): verboten
  insert into public.durchlaeufe (kurs_id, name) values (current_setting('kt.weg')::uuid, 'kt-test Co')
  returning id into eigener;
  insert into public.fortschritt (durchlauf_id, kurstag_id, vermittelt)
  values (eigener, current_setting('kt.weg_tag')::uuid, true);
  select count(*) into n from public.durchlaeufe;
  if n <> 1 then raise exception 'C32: Co sieht % Durchlaeufe statt seinen einen', n; end if;
  begin
    insert into public.durchlaeufe (kurs_id, name) values (current_setting('kt.hg')::uuid, 'kt-test Co hg');
    raise exception 'C33: Co konnte einen Durchlauf zu einem nicht freigegebenen Kurs anlegen';
  exception when insufficient_privilege then null;
  end;

  -- Bucket: Decks von weg ja, Quellen von weg nein (nur "nutzen"), hg nein, Testdateien nein
  select count(*) into n from storage.objects where bucket_id = 'decks' and name like 'weg/trainer/%';
  if n = 0 then raise exception 'C34: Co sieht die Decks von weg nicht'; end if;
  select count(*) into n from storage.objects where bucket_id = 'decks' and name like 'weg/quellen/%';
  if n <> 0 then raise exception 'C35: Co sieht Quellen ohne Stufe fassung'; end if;
  select count(*) into n from storage.objects
  where bucket_id = 'decks' and name in ('weg/teilnehmer/kt-test.html', 'weg/pdf/kt-test.pdf');
  if n <> 2 then raise exception 'C35b: Co sieht Teilnehmerfassung/PDF von weg nicht (% von 2)', n; end if;
  select count(*) into n from storage.objects where bucket_id = 'decks' and name not like 'weg/%';
  if n <> 0 then raise exception 'C36: Co sieht % Dateien ausserhalb von weg', n; end if;
  begin
    insert into storage.objects (bucket_id, name, metadata) values ('decks', 'weg/trainer/kt-test-co.html', '{"size": 1}');
    raise exception 'C37: Co konnte eine Datei in Nikos Kurs hochladen';
  exception when insufficient_privilege then null;
  end;
  -- Supabase sperrt direktes Loeschen in storage.objects grundsaetzlich (storage.protect_delete, gleicher
  -- Fehlercode 42501). Damit hier die Regeln geprueft werden und nicht diese Sperre, wird sie nur fuer
  -- diese Transaktion geoeffnet; der Test endet ohnehin mit ROLLBACK.
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects where bucket_id = 'decks' and name like 'weg/%';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'C38: Co konnte Dateien in Nikos Kurs loeschen'; end if;
  perform set_config('storage.allow_delete_query', 'false', true);
end
$$;

reset role;

-- Stufe hochsetzen: jetzt sieht Co auch die Quellen
update public.kt_kurs_freigaben set stufe = 'fassung'
where trainer_id = current_setting('kt.co')::uuid;

set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from storage.objects where bucket_id = 'decks' and name like 'weg/quellen/%';
  if n <> 1 then raise exception 'C39: Co sieht mit Stufe fassung die Quellen nicht (%)', n; end if;
end
$$;
reset role;

-- ---------------------------------------------------------------------------
-- Als inaktiver Trainer (Freigabe "fassung" auf hg)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-8000-0000000000d1', 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare n int;
begin
  select count(*) into n from public.kurse;
  if n <> 0 then raise exception 'C40: inaktiver Trainer sieht % Kurse', n; end if;
  select count(*) into n from storage.objects where bucket_id = 'decks';
  if n <> 0 then raise exception 'C41: inaktiver Trainer sieht % Dateien', n; end if;
end
$$;

reset role;

-- ---------------------------------------------------------------------------
-- Als fremdes Konto (nur Pruefungstool)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-8000-0000000000f1', 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare n int;
begin
  select count(*) into n from public.kurse;
  if n <> 0 then raise exception 'C50: fremdes Konto sieht % Kurse', n; end if;
  select count(*) into n from public.kurstage;
  if n <> 0 then raise exception 'C51: fremdes Konto sieht % Kurstage', n; end if;
  select count(*) into n from public.durchlaeufe;
  if n <> 0 then raise exception 'C52: fremdes Konto sieht % Durchlaeufe', n; end if;
  select count(*) into n from storage.objects where bucket_id = 'decks';
  if n <> 0 then raise exception 'C53: fremdes Konto sieht % Dateien', n; end if;
  begin
    insert into public.kurse (slug, name) values ('kt-test-fremd', 'X');
    raise exception 'C54: fremdes Konto konnte einen Kurs anlegen';
  exception when insufficient_privilege then null;
  end;
end
$$;

reset role;

-- ---------------------------------------------------------------------------
-- Als nicht angemeldeter Besucher (anon)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
set local role anon;

do $$
begin
  begin
    perform 1 from public.kurse;
    raise exception 'C60: anon kann kurse lesen';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.durchlaeufe;
    raise exception 'C61: anon kann durchlaeufe lesen';
  exception when insufficient_privilege then null;
  end;
end
$$;

reset role;

rollback;
