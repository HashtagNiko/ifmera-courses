-- Baustein 8 (HINZUFUEGEND): Profil – eigenen Anzeigenamen aendern.
--
-- kt_trainer bleibt fuer Trainer nur lesbar (keine Aenderungsrechte, keine neue Regel). Neu ist allein die
-- Funktion kt_anzeigename_setzen(name): Sie aendert ausschliesslich den Anzeigenamen des Angemeldeten,
-- nur fuer aktive Trainer des Kurs-Tools, mit Pruefung (2–60 Zeichen, mindestens ein Buchstabe, keine
-- Steuerzeichen, keine unsichtbaren oder die Schreibrichtung drehenden Zeichen, keine spitzen Klammern,
-- kein Name, den schon ein anderer Trainer traegt). Rolle, aktiv und fremde Zeilen bleiben unerreichbar.
-- Nach dem zweiten Blick (15.11.2026): unsichtbare Zeichen, doppelte Namen, [[:space:]], "not found".
-- Das Passwort aendert die App ueber die Anmeldung (Supabase Auth), nicht ueber diese Datenbank.
--
-- Rueckbau: supabase/rueckbau/20261115120000_kt_profil.sql

begin;

set local lock_timeout = '3s';

create function public.kt_anzeigename_setzen(p_name text)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  neu text := btrim(regexp_replace(coalesce(p_name, ''), '[[:space:]]+', ' ', 'g'));
begin
  if not public.kt_ist_trainer() then
    raise exception 'Nur fuer aktive Trainer des Kurs-Tools.' using errcode = 'insufficient_privilege';
  end if;
  if char_length(neu) < 2 or char_length(neu) > 60 then
    raise exception 'Der Name muss 2 bis 60 Zeichen lang sein.' using errcode = 'check_violation';
  end if;
  if neu ~ '[[:cntrl:]<>]' or neu ~ '[\u0080-\u009F\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]' then
    raise exception 'Der Name darf keine Steuerzeichen, unsichtbaren Zeichen oder spitzen Klammern enthalten.' using errcode = 'check_violation';
  end if;
  if neu !~ '[[:alpha:]]' then
    raise exception 'Der Name braucht mindestens einen Buchstaben.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.kt_trainer t where lower(t.anzeigename) = lower(neu) and t.id <> auth.uid()) then
    raise exception 'Diesen Namen traegt schon ein anderer Trainer.' using errcode = 'unique_violation';
  end if;
  update public.kt_trainer set anzeigename = neu where id = auth.uid() and aktiv;
  if not found then
    raise exception 'Der Name wurde nicht gespeichert.' using errcode = 'insufficient_privilege';
  end if;
  return neu;
end;
$$;
revoke execute on function public.kt_anzeigename_setzen(text) from public, anon;
grant execute on function public.kt_anzeigename_setzen(text) to authenticated;

insert into public.kt_migrationen (version, name) values ('20261115120000', 'kt_profil');

do $$
begin
  if not coalesce((select p.prosecdef and p.proconfig @> array['search_path=""'] from pg_proc p
                   where p.oid = 'public.kt_anzeigename_setzen(text)'::regprocedure), false) then
    raise exception 'KT-P01: Funktion nicht security definer mit leerem search_path';
  end if;
  if has_function_privilege('anon', 'public.kt_anzeigename_setzen(text)', 'execute')
     or not has_function_privilege('authenticated', 'public.kt_anzeigename_setzen(text)', 'execute') then
    raise exception 'KT-P02: Ausfuehrungsrechte falsch';
  end if;
  if has_table_privilege('authenticated', 'public.kt_trainer', 'INSERT,UPDATE,DELETE')
     or has_any_column_privilege('authenticated', 'public.kt_trainer', 'INSERT,UPDATE')
     or has_table_privilege('anon', 'public.kt_trainer', 'SELECT,INSERT,UPDATE,DELETE')
     or (select count(*) from pg_policies where tablename = 'kt_trainer') <> 1 then
    raise exception 'KT-P03: kt_trainer ist nicht mehr nur lesbar';
  end if;
end
$$;

commit;
