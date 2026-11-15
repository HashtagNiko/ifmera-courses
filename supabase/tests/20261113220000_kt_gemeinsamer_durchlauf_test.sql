-- Rechte-Test zu Baustein 5: gemeinsamer Durchlauf (CLAUDE.md §4 Nr. 5).
--
--   node scripts/sql.mjs supabase/tests/20261113220000_kt_gemeinsamer_durchlauf_test.sql
--
-- Endet mit ROLLBACK. Erfolg = keine Ausgabe, kein Fehler. Jeder Fehler nennt seine Nummer (G..).
-- Zaehlungen nur ueber Testdaten.
-- Personen: Niko (Besitzer von Kurs und Durchlauf), Co (Kurs "fassung", Mitwirkender), Co2 (Kurs "nutzen",
-- nicht im Durchlauf), Co3 (kein Kurszugang), Fremd (kein kt_trainer).

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
select set_config('kt.hg',  (select k.id::text from public.kurse k where k.slug = 'hg'), true);
select set_config('kt.weg_tag', (select t.id::text from public.kurstage t
  where t.kurs_id = current_setting('kt.weg')::uuid and t.art = 'kurstag' order by t.nummer limit 1), true);
select set_config('kt.weg_tag2', (select t.id::text from public.kurstage t
  where t.kurs_id = current_setting('kt.weg')::uuid and t.art = 'kurstag' order by t.nummer offset 1 limit 1), true);
select set_config('kt.weg_tag3', (select t.id::text from public.kurstage t
  where t.kurs_id = current_setting('kt.weg')::uuid and t.art = 'kurstag' order by t.nummer offset 2 limit 1), true);
select set_config('kt.hg_tag', (select t.id::text from public.kurstage t
  where t.kurs_id = current_setting('kt.hg')::uuid and t.art = 'kurstag' order by t.nummer limit 1), true);

-- Zwei Test-Durchlaeufe von Niko: der gemeinsame und ein zweiter (Ziel fuer "Haken verschieben")
insert into public.durchlaeufe (kurs_id, name, besitzer_id) values
  (current_setting('kt.weg')::uuid, 'kt-test gemeinsam', current_setting('kt.niko')::uuid),
  (current_setting('kt.weg')::uuid, 'kt-test zweiter',   current_setting('kt.niko')::uuid);
select set_config('kt.dl',  (select d.id::text from public.durchlaeufe d where d.name = 'kt-test gemeinsam'), true);
select set_config('kt.dl2', (select d.id::text from public.durchlaeufe d where d.name = 'kt-test zweiter'), true);

do $$
begin
  if nullif(current_setting('kt.niko', true), '') is null or nullif(current_setting('kt.dl', true), '') is null
     or nullif(current_setting('kt.dl2', true), '') is null or nullif(current_setting('kt.weg_tag3', true), '') is null
     or nullif(current_setting('kt.hg_tag', true), '') is null then
    raise exception 'G00: Testgrundlage fehlt';
  end if;
end
$$;

-- ===========================================================================
-- A. Niko (Besitzer) stellt das Team und den Plan zusammen
-- ===========================================================================
select set_config('request.jwt.claims', json_build_object('sub', current_setting('kt.niko'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  insert into public.kt_durchlauf_trainer (durchlauf_id, trainer_id) values (current_setting('kt.dl')::uuid, current_setting('kt.co')::uuid);
  begin
    insert into public.kt_durchlauf_trainer (durchlauf_id, trainer_id) values (current_setting('kt.dl')::uuid, current_setting('kt.co3')::uuid);
    raise exception 'G01: Niko konnte jemanden ohne Kurszugang aufnehmen';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.kt_durchlauf_trainer (durchlauf_id, trainer_id) values (current_setting('kt.dl')::uuid, current_setting('kt.niko')::uuid);
    raise exception 'G01b: Niko konnte sich selbst als Mitwirkenden eintragen';
  exception when insufficient_privilege then null;
  end;
  -- Plan: Tag 1 haelt Co, Tag 2 Niko
  insert into public.kt_durchlauf_tage (durchlauf_id, kurstag_id, trainer_id) values
    (current_setting('kt.dl')::uuid, current_setting('kt.weg_tag')::uuid, current_setting('kt.co')::uuid),
    (current_setting('kt.dl')::uuid, current_setting('kt.weg_tag2')::uuid, current_setting('kt.niko')::uuid);
  begin
    update public.kt_durchlauf_tage set trainer_id = current_setting('kt.co2')::uuid
    where durchlauf_id = current_setting('kt.dl')::uuid and kurstag_id = current_setting('kt.weg_tag2')::uuid;
    raise exception 'G02: Niko konnte einen Tag an jemanden ausserhalb des Durchlaufs geben';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.kt_durchlauf_tage (durchlauf_id, kurstag_id, trainer_id)
    values (current_setting('kt.dl')::uuid, current_setting('kt.hg_tag')::uuid, current_setting('kt.niko')::uuid);
    raise exception 'G03: Niko konnte einen Tag eines anderen Kurses einplanen';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.durchlaeufe set kurs_id = current_setting('kt.hg')::uuid where id = current_setting('kt.dl')::uuid;
    raise exception 'G04: Der Kurs eines Durchlaufs liess sich aendern';
  exception when insufficient_privilege then null;
  end;
  update public.durchlaeufe set name = 'kt-test gemeinsam' where id = current_setting('kt.dl')::uuid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'G05: Niko kann seinen Durchlauf nicht mehr umbenennen'; end if;
end
$$;
reset role;

-- ===========================================================================
-- B. Co legt zwei eigene Fassungen an (Tag 1 und Tag 2), noch nicht freigegeben, noch nicht im Plan
-- ===========================================================================
select set_config('request.jwt.claims', json_build_object('sub', current_setting('kt.co'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare fid uuid;
begin
  insert into public.kt_deck_fassungen (kurstag_id, titel) values (current_setting('kt.weg_tag')::uuid, 'Cos Fassung Tag 1')
  returning id into fid;
  perform set_config('kt.f_co', fid::text, true);
  insert into public.kt_deck_fassungen (kurstag_id, titel) values (current_setting('kt.weg_tag2')::uuid, 'Cos Fassung Tag 2')
  returning id into fid;
  perform set_config('kt.f_co_t2', fid::text, true);
end
$$;
reset role;

insert into storage.objects (bucket_id, name, metadata) values
  ('fassungen', current_setting('kt.co') || '/' || current_setting('kt.f_co') || '/deck.html',   '{"size": 1}'),
  ('fassungen', current_setting('kt.co') || '/' || current_setting('kt.f_co') || '/quellen.zip', '{"size": 1}');

-- ===========================================================================
-- C. Niko darf Cos Fassung NICHT selbst in den Plan setzen (sonst koennte er sie so lesen)
-- ===========================================================================
select set_config('request.jwt.claims', json_build_object('sub', current_setting('kt.niko'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int; f uuid;
begin
  select count(*) into n from public.kt_deck_fassungen where id = current_setting('kt.f_co')::uuid;
  if n <> 0 then raise exception 'G06: Niko sieht Cos nicht freigegebene Fassung'; end if;
  -- per Aendern in Cos Tag
  begin
    update public.kt_durchlauf_tage set fassung_id = current_setting('kt.f_co')::uuid
    where durchlauf_id = current_setting('kt.dl')::uuid and kurstag_id = current_setting('kt.weg_tag')::uuid;
    raise exception 'G07: Niko konnte Cos Fassung per Aendern in den Plan setzen';
  exception when insufficient_privilege then null;
  end;
  -- per Neuanlegen des Tages (Loeschen wird beim Abfangen mit zurueckgenommen)
  begin
    delete from public.kt_durchlauf_tage
    where durchlauf_id = current_setting('kt.dl')::uuid and kurstag_id = current_setting('kt.weg_tag')::uuid;
    insert into public.kt_durchlauf_tage (durchlauf_id, kurstag_id, trainer_id, fassung_id)
    values (current_setting('kt.dl')::uuid, current_setting('kt.weg_tag')::uuid, current_setting('kt.co')::uuid, current_setting('kt.f_co')::uuid);
    raise exception 'G08: Niko konnte Cos Fassung per Neuanlegen in den Plan setzen';
  exception when insufficient_privilege then null;
  end;
  -- per Trainerwechsel mit Fassung in einem Schritt: der Wechsel gelingt, die Fassung faellt weg
  update public.kt_durchlauf_tage set trainer_id = current_setting('kt.co')::uuid, fassung_id = current_setting('kt.f_co_t2')::uuid
  where durchlauf_id = current_setting('kt.dl')::uuid and kurstag_id = current_setting('kt.weg_tag2')::uuid;
  select fassung_id into f from public.kt_durchlauf_tage
  where durchlauf_id = current_setting('kt.dl')::uuid and kurstag_id = current_setting('kt.weg_tag2')::uuid;
  if f is not null then raise exception 'G09: Beim Trainerwechsel blieb eine (fremde) Fassung im Plan'; end if;
  update public.kt_durchlauf_tage set trainer_id = current_setting('kt.niko')::uuid
  where durchlauf_id = current_setting('kt.dl')::uuid and kurstag_id = current_setting('kt.weg_tag2')::uuid;
  -- Tag 1 ist weiter da und gehoert Co
  select count(*) into n from public.kt_durchlauf_tage
  where durchlauf_id = current_setting('kt.dl')::uuid and kurstag_id = current_setting('kt.weg_tag')::uuid
    and trainer_id = current_setting('kt.co')::uuid and fassung_id is null;
  if n <> 1 then raise exception 'G09b: Plan nach den Abwehrversuchen nicht wie vorher'; end if;
end
$$;
reset role;

-- ===========================================================================
-- D. Co als Mitwirkender: sieht alles, hakt ab, waehlt seine Fassung; aendert sonst nichts
-- ===========================================================================
select set_config('request.jwt.claims', json_build_object('sub', current_setting('kt.co'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.durchlaeufe where id = current_setting('kt.dl')::uuid;
  if n <> 1 then raise exception 'G10: Co sieht den gemeinsamen Durchlauf nicht'; end if;
  select count(*) into n from public.kt_durchlauf_tage where durchlauf_id = current_setting('kt.dl')::uuid;
  if n <> 2 then raise exception 'G11: Co sieht % statt 2 Plantage', n; end if;
  select count(*) into n from public.kt_durchlauf_trainer where durchlauf_id = current_setting('kt.dl')::uuid;
  if n <> 1 then raise exception 'G12: Co sieht % Mitwirkende statt 1', n; end if;
  if exists (select 1 from public.durchlaeufe where id = current_setting('kt.dl2')::uuid) then
    raise exception 'G12b: Co sieht Nikos anderen Durchlauf';
  end if;

  -- Abhaken; "wer" laesst sich nicht faelschen
  insert into public.fortschritt (durchlauf_id, kurstag_id, vermittelt, geaendert_von)
  values (current_setting('kt.dl')::uuid, current_setting('kt.weg_tag')::uuid, true, current_setting('kt.niko')::uuid);
  begin
    insert into public.fortschritt (durchlauf_id, kurstag_id, vermittelt)
    values (current_setting('kt.dl')::uuid, current_setting('kt.hg_tag')::uuid, true);
    raise exception 'G13: Co konnte einen Tag eines anderen Kurses abhaken';
  exception when insufficient_privilege then null;
  end;
  -- Notiz aendern und dabei "wer" faelschen wollen: "wer" bleibt
  update public.fortschritt set notiz = 'von Co', geaendert_von = current_setting('kt.niko')::uuid
  where durchlauf_id = current_setting('kt.dl')::uuid and kurstag_id = current_setting('kt.weg_tag')::uuid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'G14: Co kann die Tagesnotiz nicht aendern'; end if;
  -- Weg der App (upsert): nur die Notiz
  insert into public.fortschritt (durchlauf_id, kurstag_id, notiz, titel_damals)
  values (current_setting('kt.dl')::uuid, current_setting('kt.weg_tag')::uuid, 'von Co per upsert', 'Titel')
  on conflict (durchlauf_id, kurstag_id) do update
    set durchlauf_id = excluded.durchlauf_id, kurstag_id = excluded.kurstag_id,
        notiz = excluded.notiz, titel_damals = excluded.titel_damals;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'G15: Co kann nicht ueber den Weg der App speichern'; end if;
  -- Haken verschieben: nein
  begin
    update public.fortschritt set kurstag_id = current_setting('kt.weg_tag2')::uuid
    where durchlauf_id = current_setting('kt.dl')::uuid and kurstag_id = current_setting('kt.weg_tag')::uuid;
    raise exception 'G16: Co konnte einen Haken auf einen anderen Tag verschieben';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.fortschritt set durchlauf_id = current_setting('kt.dl2')::uuid
    where durchlauf_id = current_setting('kt.dl')::uuid and kurstag_id = current_setting('kt.weg_tag')::uuid;
    raise exception 'G16b: Co konnte einen Haken in einen anderen Durchlauf verschieben';
  exception when insufficient_privilege then null;
  end;
  delete from public.fortschritt where durchlauf_id = current_setting('kt.dl')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'G17: Co konnte Haken loeschen'; end if;

  -- Durchlauf, Team und Plan: nur lesen
  update public.durchlaeufe set name = 'X' where id = current_setting('kt.dl')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'G18: Co konnte den Durchlauf umbenennen'; end if;
  begin
    insert into public.kt_durchlauf_trainer (durchlauf_id, trainer_id) values (current_setting('kt.dl')::uuid, current_setting('kt.co2')::uuid);
    raise exception 'G19: Co konnte jemanden aufnehmen';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.kt_durchlauf_tage set trainer_id = current_setting('kt.niko')::uuid
    where durchlauf_id = current_setting('kt.dl')::uuid and kurstag_id = current_setting('kt.weg_tag')::uuid;
    raise exception 'G20: Co konnte seinen Tag an Niko weitergeben';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.kt_durchlauf_tage (durchlauf_id, kurstag_id, trainer_id)
    values (current_setting('kt.dl')::uuid, current_setting('kt.weg_tag3')::uuid, current_setting('kt.co')::uuid);
    raise exception 'G21: Co konnte einen Plantag anlegen';
  exception when insufficient_privilege then null;
  end;
  delete from public.kt_durchlauf_tage where durchlauf_id = current_setting('kt.dl')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'G22: Co konnte Plantage loeschen'; end if;

  -- Fassung waehlen: nicht fuer Nikos Tag, nicht die Fassung eines anderen Tages, aber die eigene fuer den eigenen Tag
  update public.kt_durchlauf_tage set fassung_id = current_setting('kt.f_co_t2')::uuid
  where durchlauf_id = current_setting('kt.dl')::uuid and kurstag_id = current_setting('kt.weg_tag2')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'G23: Co konnte eine Fassung fuer Nikos Tag waehlen'; end if;
  begin
    update public.kt_durchlauf_tage set fassung_id = current_setting('kt.f_co_t2')::uuid
    where durchlauf_id = current_setting('kt.dl')::uuid and kurstag_id = current_setting('kt.weg_tag')::uuid;
    raise exception 'G24: Co konnte die Fassung eines anderen Tages waehlen';
  exception when insufficient_privilege or foreign_key_violation then null;
  end;
  update public.kt_durchlauf_tage set fassung_id = current_setting('kt.f_co')::uuid
  where durchlauf_id = current_setting('kt.dl')::uuid and kurstag_id = current_setting('kt.weg_tag')::uuid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'G25: Co kann fuer seinen Tag keine eigene Fassung waehlen'; end if;
end
$$;
reset role;

do $$
begin
  if (select geaendert_von from public.fortschritt
      where durchlauf_id = current_setting('kt.dl')::uuid and kurstag_id = current_setting('kt.weg_tag')::uuid)
     is distinct from current_setting('kt.co')::uuid then
    raise exception 'G26: geaendert_von ist nicht Co (faelschbar oder nicht gesetzt)';
  end if;
  if (select notiz from public.fortschritt
      where durchlauf_id = current_setting('kt.dl')::uuid and kurstag_id = current_setting('kt.weg_tag')::uuid)
     is distinct from 'von Co per upsert' then
    raise exception 'G26b: Tagesnotiz nicht gespeichert';
  end if;
end
$$;

-- ===========================================================================
-- E. Niko: Notiz aendern laesst "wer" stehen, Haken umschalten setzt ihn; Haken verschieben: nein
-- ===========================================================================
select set_config('request.jwt.claims', json_build_object('sub', current_setting('kt.niko'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int; wer uuid;
begin
  insert into public.fortschritt (durchlauf_id, kurstag_id, notiz, titel_damals)
  values (current_setting('kt.dl')::uuid, current_setting('kt.weg_tag')::uuid, 'von Niko', 'Titel')
  on conflict (durchlauf_id, kurstag_id) do update
    set durchlauf_id = excluded.durchlauf_id, kurstag_id = excluded.kurstag_id,
        notiz = excluded.notiz, titel_damals = excluded.titel_damals;
  select geaendert_von into wer from public.fortschritt
  where durchlauf_id = current_setting('kt.dl')::uuid and kurstag_id = current_setting('kt.weg_tag')::uuid;
  if wer is distinct from current_setting('kt.co')::uuid then
    raise exception 'G27: Eine reine Notizaenderung hat "wer zuletzt abgehakt" ueberschrieben';
  end if;
  insert into public.fortschritt (durchlauf_id, kurstag_id, vermittelt, titel_damals)
  values (current_setting('kt.dl')::uuid, current_setting('kt.weg_tag')::uuid, false, 'Titel')
  on conflict (durchlauf_id, kurstag_id) do update
    set durchlauf_id = excluded.durchlauf_id, kurstag_id = excluded.kurstag_id,
        vermittelt = excluded.vermittelt, titel_damals = excluded.titel_damals;
  select geaendert_von into wer from public.fortschritt
  where durchlauf_id = current_setting('kt.dl')::uuid and kurstag_id = current_setting('kt.weg_tag')::uuid;
  if wer is distinct from current_setting('kt.niko')::uuid then
    raise exception 'G28: Haken umschalten setzt "wer" nicht auf Niko';
  end if;
  begin
    update public.fortschritt set durchlauf_id = current_setting('kt.dl2')::uuid
    where durchlauf_id = current_setting('kt.dl')::uuid and kurstag_id = current_setting('kt.weg_tag')::uuid;
    raise exception 'G29: Niko konnte einen Haken in einen anderen Durchlauf verschieben';
  exception when insufficient_privilege then null;
  end;

  -- Cos eingeplante Fassung: sichtbar zum Ansehen (Deck), nicht das Quellpaket
  select count(*) into n from public.kt_deck_fassungen where id = current_setting('kt.f_co')::uuid;
  if n <> 1 then raise exception 'G30: Niko sieht die Fassung im Plan nicht'; end if;
  if public.kt_fassung_stufe(current_setting('kt.f_co')::uuid) is distinct from 'nutzen' then
    raise exception 'G31: Stufe der eingeplanten Fassung ist nicht "nutzen"';
  end if;
  select count(*) into n from storage.objects where bucket_id = 'fassungen' and name like current_setting('kt.co') || '/%/deck.html';
  if n <> 1 then raise exception 'G32: Niko kann das Deck der Fassung im Plan nicht laden'; end if;
  select count(*) into n from storage.objects where bucket_id = 'fassungen' and name like current_setting('kt.co') || '/%/quellen.zip';
  if n <> 0 then raise exception 'G33: Niko sieht das Quellpaket einer nur eingeplanten Fassung'; end if;
  -- die nicht eingeplante Tag-2-Fassung bleibt unsichtbar
  select count(*) into n from public.kt_deck_fassungen where id = current_setting('kt.f_co_t2')::uuid;
  if n <> 0 then raise exception 'G34: Niko sieht eine nicht eingeplante Fassung von Co'; end if;
end
$$;
reset role;

-- ===========================================================================
-- F. Co2 (Kurszugang, aber nicht im Durchlauf): sieht nichts, darf nichts
-- ===========================================================================
select set_config('request.jwt.claims', json_build_object('sub', current_setting('kt.co2'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  if exists (select 1 from public.durchlaeufe where id = current_setting('kt.dl')::uuid) then raise exception 'G35: Co2 sieht den Durchlauf'; end if;
  if exists (select 1 from public.kt_durchlauf_tage where durchlauf_id = current_setting('kt.dl')::uuid) then raise exception 'G36: Co2 sieht den Plan'; end if;
  if exists (select 1 from public.kt_durchlauf_trainer where durchlauf_id = current_setting('kt.dl')::uuid) then raise exception 'G36b: Co2 sieht das Team'; end if;
  if exists (select 1 from public.fortschritt where durchlauf_id = current_setting('kt.dl')::uuid) then raise exception 'G37: Co2 sieht Haken'; end if;
  if exists (select 1 from public.kt_deck_fassungen where id = current_setting('kt.f_co')::uuid) then
    raise exception 'G38: Co2 sieht eine Fassung aus einem fremden Durchlauf';
  end if;
  if exists (select 1 from storage.objects where bucket_id = 'fassungen' and name like current_setting('kt.co') || '/%') then
    raise exception 'G38b: Co2 sieht Dateien aus einem fremden Durchlauf';
  end if;
  begin
    insert into public.fortschritt (durchlauf_id, kurstag_id, vermittelt)
    values (current_setting('kt.dl')::uuid, current_setting('kt.weg_tag2')::uuid, true);
    raise exception 'G39: Co2 konnte im fremden Durchlauf abhaken';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.kt_durchlauf_trainer (durchlauf_id, trainer_id) values (current_setting('kt.dl')::uuid, current_setting('kt.co2')::uuid);
    raise exception 'G40: Co2 konnte sich selbst in den Durchlauf eintragen';
  exception when insufficient_privilege then null;
  end;
  if public.kt_durchlauf_rolle(current_setting('kt.dl')::uuid) is not null
     or public.kt_durchlauf_kurs(current_setting('kt.dl')::uuid) is not null
     or public.kt_tag_im_durchlauf(current_setting('kt.dl')::uuid, current_setting('kt.weg_tag')::uuid)
     or public.kt_ist_im_durchlauf(current_setting('kt.dl')::uuid, current_setting('kt.niko')::uuid) then
    raise exception 'G41: Hilfsfunktionen verraten Co2 etwas ueber einen fremden Durchlauf';
  end if;
end
$$;
reset role;

-- ===========================================================================
-- G. Fremdes Konto (kein Trainer) und anon: nichts
-- ===========================================================================
select set_config('request.jwt.claims', json_build_object('sub', current_setting('kt.fremd'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  if exists (select 1 from public.kt_durchlauf_trainer) or exists (select 1 from public.kt_durchlauf_tage)
     or exists (select 1 from public.durchlaeufe where id = current_setting('kt.dl')::uuid)
     or exists (select 1 from public.fortschritt where durchlauf_id = current_setting('kt.dl')::uuid) then
    raise exception 'G42: fremdes Konto sieht etwas vom gemeinsamen Durchlauf';
  end if;
  if public.kt_durchlauf_kurs(current_setting('kt.dl')::uuid) is not null
     or public.kt_fassung_passt(current_setting('kt.f_co')::uuid, current_setting('kt.co')::uuid, current_setting('kt.weg_tag')::uuid) then
    raise exception 'G43: Hilfsfunktionen verraten einem fremden Konto etwas';
  end if;
  begin
    insert into public.fortschritt (durchlauf_id, kurstag_id, vermittelt)
    values (current_setting('kt.dl')::uuid, current_setting('kt.weg_tag2')::uuid, true);
    raise exception 'G44: fremdes Konto konnte abhaken';
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;

select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
set local role anon;
do $$
begin
  begin
    perform 1 from public.kt_durchlauf_tage;
    raise exception 'G45: anon kann den Plan lesen';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.kt_durchlauf_trainer;
    raise exception 'G46: anon kann Mitwirkende lesen';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.kt_durchlauf_rolle(current_setting('kt.dl')::uuid);
    raise exception 'G47: anon kann Hilfsfunktionen aufrufen';
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;

-- ===========================================================================
-- H. Co abgemeldet (inaktiv): seine eingeplante Fassung verschwindet, neue Tage bekommt er nicht
-- ===========================================================================
update public.kt_trainer set aktiv = false where id = current_setting('kt.co')::uuid;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('kt.niko'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  if exists (select 1 from public.kt_deck_fassungen where id = current_setting('kt.f_co')::uuid) then
    raise exception 'G48: Fassung eines inaktiven Trainers ist weiter sichtbar';
  end if;
  begin
    insert into public.kt_durchlauf_tage (durchlauf_id, kurstag_id, trainer_id)
    values (current_setting('kt.dl')::uuid, current_setting('kt.weg_tag3')::uuid, current_setting('kt.co')::uuid);
    raise exception 'G49: Niko konnte einem inaktiven Trainer einen Tag geben';
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;
update public.kt_trainer set aktiv = true where id = current_setting('kt.co')::uuid;

-- ===========================================================================
-- I. Kurszugang entzogen: Co sieht den Durchlauf nicht mehr; zurueck: wieder da
-- ===========================================================================
delete from public.kt_kurs_freigaben where trainer_id = current_setting('kt.co')::uuid;
select set_config('request.jwt.claims', json_build_object('sub', current_setting('kt.co'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  if exists (select 1 from public.durchlaeufe where id = current_setting('kt.dl')::uuid)
     or exists (select 1 from public.kt_durchlauf_tage where durchlauf_id = current_setting('kt.dl')::uuid) then
    raise exception 'G50: Co sieht den Durchlauf ohne Kurszugang';
  end if;
end
$$;
reset role;
insert into public.kt_kurs_freigaben (kurs_id, trainer_id, stufe) values (current_setting('kt.weg')::uuid, current_setting('kt.co')::uuid, 'fassung');
set local role authenticated;
do $$
begin
  if not exists (select 1 from public.durchlaeufe where id = current_setting('kt.dl')::uuid) then
    raise exception 'G51: Co sieht den Durchlauf nach erneuter Freigabe nicht';
  end if;
end
$$;
reset role;

-- ===========================================================================
-- J. Fassung geloescht: der Plantag bleibt, zurueck zum Original
-- ===========================================================================
select set_config('request.jwt.claims', json_build_object('sub', current_setting('kt.co'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare fid uuid; n int;
begin
  insert into public.kt_deck_fassungen (kurstag_id, titel) values (current_setting('kt.weg_tag')::uuid, 'Cos zweite Fassung Tag 1')
  returning id into fid;
  update public.kt_durchlauf_tage set fassung_id = fid
  where durchlauf_id = current_setting('kt.dl')::uuid and kurstag_id = current_setting('kt.weg_tag')::uuid;
  delete from public.kt_deck_fassungen where id = fid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'G52: Co kann eine eingeplante eigene Fassung nicht loeschen'; end if;
  select count(*) into n from public.kt_durchlauf_tage
  where durchlauf_id = current_setting('kt.dl')::uuid and kurstag_id = current_setting('kt.weg_tag')::uuid
    and trainer_id = current_setting('kt.co')::uuid and fassung_id is null;
  if n <> 1 then raise exception 'G53: Nach dem Loeschen der Fassung stimmt der Plantag nicht (erwartet: Co, Original)'; end if;
  update public.kt_durchlauf_tage set fassung_id = current_setting('kt.f_co')::uuid
  where durchlauf_id = current_setting('kt.dl')::uuid and kurstag_id = current_setting('kt.weg_tag')::uuid;
end
$$;
reset role;

-- ===========================================================================
-- K. Austragen: Niko traegt Co2 aus (dessen Tag faellt weg); Co kann andere nicht austragen
-- ===========================================================================
select set_config('request.jwt.claims', json_build_object('sub', current_setting('kt.niko'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  insert into public.kt_durchlauf_trainer (durchlauf_id, trainer_id) values (current_setting('kt.dl')::uuid, current_setting('kt.co2')::uuid);
  insert into public.kt_durchlauf_tage (durchlauf_id, kurstag_id, trainer_id)
  values (current_setting('kt.dl')::uuid, current_setting('kt.weg_tag3')::uuid, current_setting('kt.co2')::uuid);
end
$$;
reset role;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('kt.co'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  delete from public.kt_durchlauf_trainer
  where durchlauf_id = current_setting('kt.dl')::uuid and trainer_id = current_setting('kt.co2')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'G54: Co konnte einen anderen Mitwirkenden austragen'; end if;
end
$$;
reset role;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('kt.niko'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  delete from public.kt_durchlauf_trainer
  where durchlauf_id = current_setting('kt.dl')::uuid and trainer_id = current_setting('kt.co2')::uuid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'G55: Niko kann einen Mitwirkenden nicht austragen'; end if;
  select count(*) into n from public.kt_durchlauf_tage
  where durchlauf_id = current_setting('kt.dl')::uuid and kurstag_id = current_setting('kt.weg_tag3')::uuid;
  if n <> 0 then raise exception 'G56: Der Tag des Ausgetragenen steht noch im Plan'; end if;
end
$$;
reset role;

-- ===========================================================================
-- L. Co tritt selbst aus: sein Tag faellt weg, seine Fassung ist fuer Niko nicht mehr sichtbar
-- ===========================================================================
select set_config('request.jwt.claims', json_build_object('sub', current_setting('kt.co'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  delete from public.kt_durchlauf_trainer where durchlauf_id = current_setting('kt.dl')::uuid and trainer_id = current_setting('kt.co')::uuid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'G57: Co kann sich nicht selbst austragen'; end if;
  if exists (select 1 from public.durchlaeufe where id = current_setting('kt.dl')::uuid) then
    raise exception 'G58: Co sieht den Durchlauf nach dem Austragen';
  end if;
end
$$;
reset role;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('kt.niko'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.kt_durchlauf_tage
  where durchlauf_id = current_setting('kt.dl')::uuid and kurstag_id = current_setting('kt.weg_tag')::uuid;
  if n <> 0 then raise exception 'G59: Cos Tag steht nach seinem Austritt noch im Plan'; end if;
  if exists (select 1 from public.kt_deck_fassungen where id = current_setting('kt.f_co')::uuid)
     or exists (select 1 from storage.objects where bucket_id = 'fassungen' and name like current_setting('kt.co') || '/%') then
    raise exception 'G60: Cos Fassung ist nach seinem Austritt noch sichtbar';
  end if;
  -- Haken loeschen darf der Besitzer
  delete from public.fortschritt where durchlauf_id = current_setting('kt.dl')::uuid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'G61: Niko kann den Haken in seinem Durchlauf nicht loeschen'; end if;
end
$$;
reset role;

rollback;
