-- Rechte-Test zu Baustein 8: eigenen Anzeigenamen aendern (CLAUDE.md §4 Nr. 5).
--
--   node scripts/sql.mjs supabase/tests/20261115120000_kt_profil_test.sql
--
-- Endet mit ROLLBACK. Erfolg = keine Ausgabe, kein Fehler. Jeder Fehler nennt seine Nummer (P..).
-- Personen: Co (aktiver Trainer), Inaktiv, Fremd (kein kt_trainer), anon; Niko nur als Vergleich.

begin;

set local lock_timeout = '3s';

insert into public.eingeladene_trainer (email) values
  ('kt-test-co@example.invalid'), ('kt-test-inaktiv@example.invalid'), ('kt-test-fremd@example.invalid');
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000000c1', 'kt-test-co@example.invalid',      'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000d1', 'kt-test-inaktiv@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000f1', 'kt-test-fremd@example.invalid',   'authenticated', 'authenticated');
insert into public.kt_trainer (id, anzeigename, rolle, aktiv) values
  ('00000000-0000-4000-8000-0000000000c1', 'Test Co', 'trainer', true),
  ('00000000-0000-4000-8000-0000000000d1', 'Test Inaktiv', 'trainer', false);

select set_config('kt.niko', (select t.id::text from public.kt_trainer t where t.rolle = 'admin'), true);
select set_config('kt.niko_name', (select t.anzeigename from public.kt_trainer t where t.rolle = 'admin'), true);

do $$
begin
  if nullif(current_setting('kt.niko', true), '') is null then raise exception 'P00: Testgrundlage fehlt'; end if;
end
$$;

-- Co: eigener Name ja (gekuerzt und bereinigt), sonst nichts
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000000c1', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
declare n int;
begin
  if public.kt_anzeigename_setzen('  Herr   Test  ') is distinct from 'Herr Test' then
    raise exception 'P01: Name nicht bereinigt zurueckgegeben';
  end if;
  if (select anzeigename from public.kt_trainer where id = '00000000-0000-4000-8000-0000000000c1') is distinct from 'Herr Test' then
    raise exception 'P02: eigener Name nicht gespeichert';
  end if;
  begin
    perform public.kt_anzeigename_setzen('X');
    raise exception 'P03: zu kurzer Name angenommen';
  exception when check_violation then null;
  end;
  begin
    perform public.kt_anzeigename_setzen(repeat('a', 61));
    raise exception 'P04: zu langer Name angenommen';
  exception when check_violation then null;
  end;
  begin
    perform public.kt_anzeigename_setzen('Herr <b>Test</b>');
    raise exception 'P05: spitze Klammern angenommen';
  exception when check_violation then null;
  end;
  begin
    perform public.kt_anzeigename_setzen(null);
    raise exception 'P06: leerer Name angenommen';
  exception when check_violation then null;
  end;
  -- unsichtbare und richtungsdrehende Zeichen, Steuerzeichen, Name ohne Buchstaben
  begin
    perform public.kt_anzeigename_setzen(chr(8203) || chr(8203) || 'ab');
    raise exception 'P06b: unsichtbare Zeichen angenommen';
  exception when check_violation then null;
  end;
  begin
    perform public.kt_anzeigename_setzen('Herr ' || chr(8238) || 'Test');
    raise exception 'P06c: Richtungszeichen angenommen';
  exception when check_violation then null;
  end;
  begin
    perform public.kt_anzeigename_setzen('Herr ' || chr(27) || 'Test');
    raise exception 'P06d: Steuerzeichen angenommen';
  exception when check_violation then null;
  end;
  begin
    perform public.kt_anzeigename_setzen('12 34');
    raise exception 'P06e: Name ohne Buchstaben angenommen';
  exception when check_violation then null;
  end;
  -- den Namen eines anderen Trainers (Niko) uebernehmen: verboten, auch in anderer Schreibung
  begin
    perform public.kt_anzeigename_setzen(upper(current_setting('kt.niko_name')));
    raise exception 'P06f: Co konnte Nikos Namen uebernehmen';
  exception when unique_violation then null;
  end;
  -- Grenzen: 2 und 60 Zeichen gehen
  if public.kt_anzeigename_setzen('Al') <> 'Al' or public.kt_anzeigename_setzen(repeat('b', 60)) <> repeat('b', 60) then
    raise exception 'P06g: Namen an den Grenzen abgelehnt';
  end if;
  perform public.kt_anzeigename_setzen('Herr Test');
  -- direkt aendern bleibt verboten (Rolle, fremde Zeilen, eigener Name ohne Funktion)
  begin
    update public.kt_trainer set rolle = 'admin' where id = '00000000-0000-4000-8000-0000000000c1';
    raise exception 'P07: Co konnte kt_trainer direkt aendern';
  exception when insufficient_privilege then null;
  end;
  if (select rolle from public.kt_trainer where id = '00000000-0000-4000-8000-0000000000c1') <> 'trainer'
     or (select aktiv from public.kt_trainer where id = '00000000-0000-4000-8000-0000000000c1') is not true then
    raise exception 'P08: Rolle oder aktiv veraendert';
  end if;
end
$$;
reset role;

do $$
begin
  if (select anzeigename from public.kt_trainer where id = current_setting('kt.niko')::uuid) is distinct from current_setting('kt.niko_name') then
    raise exception 'P09: Nikos Name wurde mit veraendert';
  end if;
end
$$;

-- Inaktiv, Fremd: duerfen nicht
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000000d1', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  begin
    perform public.kt_anzeigename_setzen('Herr Inaktiv');
    raise exception 'P10: inaktiver Trainer konnte seinen Namen aendern';
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;

select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-0000000000f1', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$
begin
  begin
    perform public.kt_anzeigename_setzen('Herr Fremd');
    raise exception 'P11: fremdes Konto konnte die Funktion nutzen';
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
    perform public.kt_anzeigename_setzen('Herr Anon');
    raise exception 'P12: anon kann die Funktion aufrufen';
  exception when insufficient_privilege then
    -- muss am fehlenden Recht scheitern, nicht erst an der Pruefung in der Funktion
    if sqlerrm not like 'permission denied%' then raise exception 'P12b: anon durfte die Funktion ausfuehren (%)', sqlerrm; end if;
  end;
end
$$;
reset role;

do $$
begin
  if (select anzeigename from public.kt_trainer where id = '00000000-0000-4000-8000-0000000000d1') <> 'Test Inaktiv' then
    raise exception 'P13: Name des Inaktiven veraendert';
  end if;
end
$$;

rollback;
