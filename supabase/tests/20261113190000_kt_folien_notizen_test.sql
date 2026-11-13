-- Rechte-Test zu Baustein 3, eigene Notizen (CLAUDE.md §4 Nr. 5).
--
--   node scripts/sql.mjs supabase/tests/20261113190000_kt_folien_notizen_test.sql
--
-- Endet mit ROLLBACK. Erfolg = keine Ausgabe, kein Fehler. Jeder Fehler nennt seine Nummer (N..).
-- Personen: Niko (Besitzer), Co (Freigabe "nutzen" auf weg, spaeter "notizen"), Fremd, anon.

begin;

insert into public.eingeladene_trainer (email) values
  ('kt-test-co@example.invalid'), ('kt-test-fremd@example.invalid');
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000000c1', 'kt-test-co@example.invalid',    'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000f1', 'kt-test-fremd@example.invalid', 'authenticated', 'authenticated');
insert into public.kt_trainer (id, anzeigename) values ('00000000-0000-4000-8000-0000000000c1', 'Test Co');
insert into public.kt_kurs_freigaben (kurs_id, trainer_id, stufe)
values ((select id from public.kurse where slug = 'weg'), '00000000-0000-4000-8000-0000000000c1', 'nutzen');

select set_config('kt.niko', (select t.id::text from public.kt_trainer t where t.rolle = 'admin'), true);
select set_config('kt.co', '00000000-0000-4000-8000-0000000000c1', true);
select set_config('kt.weg_tag', (select t.id::text from public.kurstage t
  where t.kurs_id = (select id from public.kurse where slug = 'weg') and t.art = 'kurstag' order by t.nummer limit 1), true);
select set_config('kt.hg_tag', (select t.id::text from public.kurstage t
  where t.kurs_id = (select id from public.kurse where slug = 'hg') and t.art = 'kurstag' order by t.nummer limit 1), true);

do $$
begin
  if nullif(current_setting('kt.niko', true), '') is null or nullif(current_setting('kt.weg_tag', true), '') is null
     or nullif(current_setting('kt.hg_tag', true), '') is null then
    raise exception 'N00: Testgrundlage fehlt';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Niko: eigene Notizen anlegen, aendern, lesen
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', current_setting('kt.niko'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare n int; vorher timestamptz; nachher timestamptz;
begin
  insert into public.kt_folien_notizen (kurstag_id, folie_schluessel, folie_titel, notiz)
  values (current_setting('kt.weg_tag')::uuid, 't:kt-test#1', 'Test', 'Nikos Notiz');
  select count(*) into n from public.kt_folien_notizen where notiz = 'Nikos Notiz' and trainer_id = current_setting('kt.niko')::uuid;
  if n <> 1 then raise exception 'N01: Niko kann keine eigene Notiz anlegen'; end if;

  select geaendert_am into vorher from public.kt_folien_notizen where notiz = 'Nikos Notiz';
  perform pg_sleep(0.01);
  update public.kt_folien_notizen set notiz = 'Nikos Notiz 2' where notiz = 'Nikos Notiz';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'N02: Niko kann seine Notiz nicht aendern'; end if;
  -- now() ist in einer Transaktion fest; der Trigger muss trotzdem laufen und den Wert setzen
  select geaendert_am into nachher from public.kt_folien_notizen where notiz = 'Nikos Notiz 2';
  if nachher is null then raise exception 'N03: geaendert_am nicht gesetzt'; end if;

  -- Notiz unter fremdem Namen: verboten
  begin
    insert into public.kt_folien_notizen (trainer_id, kurstag_id, folie_schluessel, notiz)
    values (current_setting('kt.co')::uuid, current_setting('kt.weg_tag')::uuid, 't:kt-test#2', 'gefaelscht');
    raise exception 'N04: Niko konnte eine Notiz auf den Namen von Co anlegen';
  exception when insufficient_privilege then null;
  end;
end
$$;

reset role;

-- ---------------------------------------------------------------------------
-- Co mit Stufe "nutzen": sieht nichts Fremdes, darf nichts schreiben
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('sub', current_setting('kt.co'), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare n int;
begin
  select count(*) into n from public.kt_folien_notizen;
  if n <> 0 then raise exception 'N10: Co sieht % fremde Notizen', n; end if;
  begin
    insert into public.kt_folien_notizen (kurstag_id, folie_schluessel, notiz)
    values (current_setting('kt.weg_tag')::uuid, 't:kt-test#1', 'Co nutzen');
    raise exception 'N11: Co konnte mit Stufe nutzen eine Notiz anlegen';
  exception when insufficient_privilege then null;
  end;
  update public.kt_folien_notizen set notiz = 'X';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'N12: Co konnte Nikos Notiz aendern'; end if;
  delete from public.kt_folien_notizen;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'N13: Co konnte Nikos Notiz loeschen'; end if;
end
$$;

reset role;

-- Stufe hochsetzen
update public.kt_folien_notizen set notiz = notiz where false;
update public.kt_kurs_freigaben set stufe = 'notizen' where trainer_id = current_setting('kt.co')::uuid;

set local role authenticated;

do $$
declare n int;
begin
  insert into public.kt_folien_notizen (kurstag_id, folie_schluessel, notiz)
  values (current_setting('kt.weg_tag')::uuid, 't:kt-test#1', 'Cos Notiz');
  select count(*) into n from public.kt_folien_notizen;
  if n <> 1 then raise exception 'N20: Co sieht % Notizen statt nur seine eine', n; end if;
  if (select notiz from public.kt_folien_notizen) <> 'Cos Notiz' then raise exception 'N21: Co sieht die falsche Notiz'; end if;

  -- zu einem Kurs ohne Freigabe: verboten
  begin
    insert into public.kt_folien_notizen (kurstag_id, folie_schluessel, notiz)
    values (current_setting('kt.hg_tag')::uuid, 't:kt-test#1', 'Co hg');
    raise exception 'N22: Co konnte eine Notiz zu einem nicht freigegebenen Kurs anlegen';
  exception when insufficient_privilege then null;
  end;

  -- die eigene Notiz in einen nicht freigegebenen Kurs verschieben: verboten
  begin
    update public.kt_folien_notizen set kurstag_id = current_setting('kt.hg_tag')::uuid where notiz = 'Cos Notiz';
    raise exception 'N23: Co konnte seine Notiz in einen fremden Kurs verschieben';
  exception when insufficient_privilege then null;
  end;
end
$$;

reset role;

-- Gegenkontrolle als postgres: Nikos Notiz unveraendert, beide Notizen getrennt
do $$
begin
  if (select count(*) from public.kt_folien_notizen where notiz = 'Nikos Notiz 2' and trainer_id = current_setting('kt.niko')::uuid) <> 1 then
    raise exception 'N24: Nikos Notiz wurde veraendert';
  end if;
  if (select count(*) from public.kt_folien_notizen where folie_schluessel = 't:kt-test#1') <> 2 then
    raise exception 'N25: erwartet je eine Notiz von Niko und Co zur selben Folie';
  end if;
end
$$;

-- Niko sieht Cos Notiz nicht
select set_config('request.jwt.claims', json_build_object('sub', current_setting('kt.niko'), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  if exists (select 1 from public.kt_folien_notizen where notiz = 'Cos Notiz') then
    raise exception 'N26: Niko sieht die Notiz von Co';
  end if;
end
$$;
reset role;

-- Fremdes Konto und anon
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000000f1', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  if exists (select 1 from public.kt_folien_notizen) then raise exception 'N30: fremdes Konto sieht Notizen'; end if;
  begin
    insert into public.kt_folien_notizen (kurstag_id, folie_schluessel, notiz)
    values (current_setting('kt.weg_tag')::uuid, 't:kt-test#9', 'fremd');
    raise exception 'N31: fremdes Konto konnte eine Notiz anlegen';
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
    perform 1 from public.kt_folien_notizen;
    raise exception 'N40: anon kann Notizen lesen';
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;

rollback;
