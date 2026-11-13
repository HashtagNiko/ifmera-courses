-- Rechte-Test zu Baustein 1, Schritt A (CLAUDE.md §4 Nr. 5).
--
--   node scripts/sql.mjs supabase/tests/20261113150000_kt_besitz_und_freigaben_test.sql
--
-- Laeuft in einer Transaktion und endet mit ROLLBACK: Testkonten, Freigaben und der kurze Eintrag in
-- eingeladene_trainer (den der Trigger des Pruefungstools fuer neue Konten verlangt) verschwinden
-- wieder. Erfolg = keine Ausgabe, kein Fehler. Jeder Fehler nennt seine Nummer (T..).
--
-- Personen:
--   Niko     bisher einziger Trainer, Admin, Besitzer aller Kurse
--   Co       aktiver Trainer ohne eigene Kurse
--   Inaktiv  Trainer, der abgeschaltet ist, aber eine Freigabe hat
--   Fremd    Konto ohne kt_trainer, wie ein Trainer, der nur das Pruefungstool nutzt

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

select set_config('kt.niko',    (select t.id::text from public.kt_trainer t where t.rolle = 'admin'), true);
select set_config('kt.co',      '00000000-0000-4000-8000-0000000000c1', true);
select set_config('kt.inaktiv', '00000000-0000-4000-8000-0000000000d1', true);
select set_config('kt.fremd',   '00000000-0000-4000-8000-0000000000f1', true);
select set_config('kt.weg',     (select k.id::text from public.kurse k where k.slug = 'weg'), true);
select set_config('kt.hg',      (select k.id::text from public.kurse k where k.slug = 'hg'), true);
select set_config('kt.n_kurse', (select count(*)::text from public.kurse), true);
-- Der Test laeuft vor und nach Schritt C (Regeln nach Besitz); T35 erwartet je nach Stand anderes.
select set_config('kt.schritt_c',
  (exists (select 1 from public.kt_migrationen where version = '20261113160000'))::text, true);

do $$
begin
  if nullif(current_setting('kt.niko', true), '') is null
     or nullif(current_setting('kt.weg', true), '') is null
     or nullif(current_setting('kt.hg', true), '') is null then
    raise exception 'T00: Testgrundlage fehlt (Admin oder Kurse weg/hg nicht gefunden)';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Als Niko
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('kt.niko'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  weg uuid := current_setting('kt.weg')::uuid;
  hg  uuid := current_setting('kt.hg')::uuid;
  n int;
  b uuid;
begin
  if not public.kt_ist_trainer() then raise exception 'T01: Niko ist kein Trainer'; end if;
  if not public.kt_ist_admin()   then raise exception 'T02: Niko ist kein Admin'; end if;
  if public.kt_kurs_stufe(weg) is distinct from 'besitzer' then
    raise exception 'T03: Niko ist nicht Besitzer von weg (%)', public.kt_kurs_stufe(weg);
  end if;
  if not public.kt_ist_kursbesitzer(hg) then raise exception 'T04: Niko ist nicht Besitzer von hg'; end if;
  if not public.kt_kurs_stufe_mindestens(weg, 'fassung') then raise exception 'T05: Stufenvergleich fuer Besitzer falsch'; end if;

  -- sieht sich und den aktiven Co, nicht den Inaktiven
  select count(*) into n from public.kt_trainer;
  if n < 2 then raise exception 'T06: Niko sieht zu wenige Trainer (%)', n; end if;
  if exists (select 1 from public.kt_trainer where id = current_setting('kt.inaktiv')::uuid) then
    raise exception 'T07: Niko sieht den inaktiven Trainer';
  end if;

  -- freigeben, Stufe aendern
  insert into public.kt_kurs_freigaben (kurs_id, trainer_id, stufe)
  values (weg, current_setting('kt.co')::uuid, 'notizen');
  update public.kt_kurs_freigaben set stufe = 'fassung'
  where kurs_id = weg and trainer_id = current_setting('kt.co')::uuid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T08: Niko konnte die Stufe nicht aendern'; end if;

  -- Freigabe fuer den Inaktiven (darf er trotzdem nicht nutzen, siehe T40)
  insert into public.kt_kurs_freigaben (kurs_id, trainer_id, stufe)
  values (hg, current_setting('kt.inaktiv')::uuid, 'nutzen');

  -- an sich selbst freigeben: verboten
  begin
    insert into public.kt_kurs_freigaben (kurs_id, trainer_id, stufe)
    values (hg, current_setting('kt.niko')::uuid, 'nutzen');
    raise exception 'T09: Niko konnte an sich selbst freigeben';
  exception when insufficient_privilege then null;
  end;

  -- an kt_trainer darf auch der Admin ueber die API nichts aendern
  begin
    update public.kt_trainer set anzeigename = 'X' where id = current_setting('kt.niko')::uuid;
    raise exception 'T10: kt_trainer liess sich ueber die API aendern';
  exception when insufficient_privilege then null;
  end;

  -- eine bestehende Freigabe auf sich selbst umschreiben: verboten (WITH CHECK von "freigaben aendern")
  begin
    update public.kt_kurs_freigaben set trainer_id = current_setting('kt.niko')::uuid
    where kurs_id = weg and trainer_id = current_setting('kt.co')::uuid;
    raise exception 'T11: Niko konnte eine Freigabe auf sich selbst umschreiben';
  exception when insufficient_privilege then null;
  end;

  -- Was die App und der Sync bisher tun, geht weiter (neue Spalte, Standardwert, Verweis):
  select count(*) into n from public.kurse;
  if n <> current_setting('kt.n_kurse')::int then raise exception 'T12: Niko sieht % statt % Kurse', n, current_setting('kt.n_kurse'); end if;

  insert into public.durchlaeufe (kurs_id, name) values (weg, 'kt-test Niko')
  returning besitzer_id into b;
  if b is distinct from current_setting('kt.niko')::uuid then raise exception 'T13: neuer Durchlauf gehoert nicht Niko (%)', b; end if;

  -- wie scripts/sync-decks.mjs: upsert auf das Kuerzel
  insert into public.kurse (slug, name) values ('kt-test-neu', 'Test') on conflict (slug) do update set name = excluded.name
  returning besitzer_id into b;
  if b is distinct from current_setting('kt.niko')::uuid then raise exception 'T14: neuer Kurs gehoert nicht Niko (%)', b; end if;
  insert into public.kurse (slug, name) values ('weg', (select name from public.kurse where slug = 'weg'))
  on conflict (slug) do update set name = excluded.name
  returning besitzer_id into b;
  if b is distinct from current_setting('kt.niko')::uuid then raise exception 'T15: Upsert auf weg hat den Besitzer veraendert (%)', b; end if;
end
$$;

reset role;

-- ---------------------------------------------------------------------------
-- Als Co-Trainer
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('kt.co'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  weg uuid := current_setting('kt.weg')::uuid;
  hg  uuid := current_setting('kt.hg')::uuid;
  n int;
begin
  if not public.kt_ist_trainer() then raise exception 'T20: Co ist kein Trainer'; end if;
  if public.kt_ist_admin()       then raise exception 'T21: Co ist Admin'; end if;
  if public.kt_kurs_stufe(weg) is distinct from 'fassung' then
    raise exception 'T22: Co hat an weg die Stufe % statt fassung', public.kt_kurs_stufe(weg);
  end if;
  if public.kt_kurs_stufe(hg) is not null then raise exception 'T23: Co hat Zugriff auf hg ohne Freigabe'; end if;
  if public.kt_ist_kursbesitzer(weg) then raise exception 'T24: Co gilt als Besitzer von weg'; end if;
  if not public.kt_kurs_stufe_mindestens(weg, 'notizen') then raise exception 'T25: Stufenvergleich notizen falsch'; end if;
  if public.kt_kurs_stufe_mindestens(weg, 'besitzer')    then raise exception 'T26: Co gilt per Stufe als Besitzer'; end if;
  if public.kt_kurs_stufe_mindestens(hg, 'nutzen')       then raise exception 'T27: Stufenvergleich ohne Freigabe falsch'; end if;
  if public.kt_kurs_stufe_mindestens(weg, 'unsinn')      then raise exception 'T28: unbekannte Stufe gilt als erreicht'; end if;

  -- sieht nur die eigene Freigabe
  select count(*) into n from public.kt_kurs_freigaben;
  if n <> 1 then raise exception 'T29: Co sieht % Freigaben statt 1', n; end if;

  -- sieht aktive Trainer, nicht den Inaktiven
  if not exists (select 1 from public.kt_trainer where id = current_setting('kt.niko')::uuid) then
    raise exception 'T30: Co sieht Niko nicht';
  end if;
  if exists (select 1 from public.kt_trainer where id = current_setting('kt.inaktiv')::uuid) then
    raise exception 'T31: Co sieht den inaktiven Trainer';
  end if;

  -- kann fremde Kurse niemandem freigeben (geprueft mit anderen Empfaengern als sich selbst, damit
  -- wirklich die Besitzer-Pruefung greift und nicht nur "nicht an sich selbst")
  begin
    insert into public.kt_kurs_freigaben (kurs_id, trainer_id, stufe)
    values (weg, current_setting('kt.inaktiv')::uuid, 'nutzen');
    raise exception 'T32: Co konnte Nikos Kurs einem anderen Trainer freigeben';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.kt_kurs_freigaben (kurs_id, trainer_id, stufe)
    values (hg, current_setting('kt.niko')::uuid, 'nutzen');
    raise exception 'T32b: Co konnte Nikos Kurs an Niko freigeben';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.kt_kurs_freigaben (kurs_id, trainer_id, stufe)
    values (hg, current_setting('kt.co')::uuid, 'fassung');
    raise exception 'T32c: Co konnte sich selbst einen Kurs freigeben';
  exception when insufficient_privilege then null;
  end;

  update public.kt_kurs_freigaben set stufe = 'nutzen' where trainer_id = current_setting('kt.co')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T33: Co konnte seine Freigabe aendern'; end if;

  delete from public.kt_kurs_freigaben where trainer_id = current_setting('kt.co')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T34: Co konnte seine Freigabe loeschen'; end if;

  -- Vor Schritt C oeffnet Schritt A noch nichts (die alten Regeln lassen nur kurs_zugriff durch);
  -- nach Schritt C sieht Co genau den einen freigegebenen Kurs.
  select count(*) into n from public.kurse;
  if current_setting('kt.schritt_c')::boolean then
    if n <> 1 then raise exception 'T35: Co sieht nach Schritt C % Kurse statt 1', n; end if;
  else
    if n <> 0 then raise exception 'T35: Co sieht schon vor Schritt C % Kurse', n; end if;
  end if;
end
$$;

reset role;

-- Gegenkontrolle ohne Regeln (als postgres): Hat Co wirklich nichts veraendert?
do $$
begin
  if not exists (select 1 from public.kt_kurs_freigaben
                 where kurs_id = current_setting('kt.weg')::uuid
                   and trainer_id = current_setting('kt.co')::uuid and stufe = 'fassung') then
    raise exception 'T36: Co hat seine Freigabe veraendert oder geloescht';
  end if;
  if exists (select 1 from public.kt_kurs_freigaben
             where trainer_id = current_setting('kt.co')::uuid and kurs_id = current_setting('kt.hg')::uuid) then
    raise exception 'T37: Co hat sich hg freigegeben';
  end if;
  if exists (select 1 from public.kt_kurs_freigaben
             where trainer_id = current_setting('kt.niko')::uuid) then
    raise exception 'T38: es gibt eine Freigabe an Niko';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Als inaktiver Trainer (mit Freigabe auf hg)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('kt.inaktiv'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare n int;
begin
  if public.kt_ist_trainer() then raise exception 'T40: inaktiver Trainer gilt als Trainer'; end if;
  if public.kt_kurs_stufe(current_setting('kt.hg')::uuid) is not null then
    raise exception 'T41: inaktiver Trainer hat trotz Abschaltung Zugriff auf hg';
  end if;
  select count(*) into n from public.kt_trainer;
  if n <> 1 then raise exception 'T42: inaktiver Trainer sieht % Trainer statt nur sich', n; end if;
  select count(*) into n from public.kt_kurs_freigaben;
  if n <> 0 then raise exception 'T43: inaktiver Trainer sieht % Freigaben', n; end if;
end
$$;

reset role;

-- ---------------------------------------------------------------------------
-- Als fremdes Konto (nur Pruefungstool)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('kt.fremd'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare n int;
begin
  if public.kt_ist_trainer() then raise exception 'T50: fremdes Konto gilt als Trainer'; end if;
  if public.kt_kurs_stufe(current_setting('kt.weg')::uuid) is not null then
    raise exception 'T51: fremdes Konto hat Zugriff auf weg';
  end if;
  select count(*) into n from public.kt_trainer;
  if n <> 0 then raise exception 'T52: fremdes Konto sieht % Trainer', n; end if;
  select count(*) into n from public.kt_kurs_freigaben;
  if n <> 0 then raise exception 'T53: fremdes Konto sieht % Freigaben', n; end if;
  select count(*) into n from public.kurse;
  if n <> 0 then raise exception 'T54: fremdes Konto sieht % Kurse', n; end if;
  -- auch nicht ueber die Hilfsfunktion (anonyme Teilnehmer des Pruefungstools sind ebenfalls "authenticated")
  if public.kt_kurs_id('weg') is not null then raise exception 'T55: fremdes Konto erfaehrt die Kurs-ID ueber kt_kurs_id'; end if;
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
    perform 1 from public.kt_trainer;
    raise exception 'T60: anon kann kt_trainer lesen';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.kt_kurs_freigaben;
    raise exception 'T61: anon kann kt_kurs_freigaben lesen';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.kt_ist_trainer();
    raise exception 'T62: anon kann kt_ist_trainer ausfuehren';
  exception when insufficient_privilege then null;
  end;
end
$$;

reset role;

rollback;
