-- Rueckbau zu supabase/migrations/20261115120000_kt_profil.sql
-- Entfernt die Funktion; bereits geaenderte Namen bleiben, wie sie sind. Zuerst den App-Code zuruecknehmen.

begin;

set local lock_timeout = '3s';

drop function if exists public.kt_anzeigename_setzen(text);
delete from public.kt_migrationen where version = '20261115120000';

do $$
begin
  if exists (select 1 from pg_proc where proname = 'kt_anzeigename_setzen') then
    raise exception 'KT-RP01: Funktion noch da';
  end if;
end
$$;

commit;
