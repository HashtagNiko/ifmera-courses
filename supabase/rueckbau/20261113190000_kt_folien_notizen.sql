-- Rueckbau zu supabase/migrations/20261113190000_kt_folien_notizen.sql
--
-- ACHTUNG, loescht Daten: alle eigenen Notizen aller Trainer. Vorher sichern (supabase/sicherung.sql).
-- Zuerst den App-Code zuruecknehmen.

begin;

set local lock_timeout = '3s';

drop table if exists public.kt_folien_notizen;
drop function if exists public.kt_notiz_geaendert();
delete from public.kt_migrationen where version = '20261113190000';

do $$
begin
  if to_regclass('public.kt_folien_notizen') is not null then raise exception 'KT-RN01: Tabelle noch da'; end if;
end
$$;

commit;
