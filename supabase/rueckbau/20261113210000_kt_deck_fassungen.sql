-- Rueckbau zu supabase/migrations/20261113210000_kt_deck_fassungen.sql
--
-- ACHTUNG, loescht Daten: alle Fassungen und ihre Freigaben. Vorher sichern (supabase/sicherung.sql).
-- Die Dateien im Bucket "fassungen" muessen vorher entfernt werden, und zwar mit service_role (im
-- Supabase-Dashboard unter Storage): Keine Regel laesst den Admin fremde Fassungen loeschen, und Supabase
-- sperrt das Loeschen per SQL. Liegen noch Dateien darin, scheitert das Entfernen des Buckets und die
-- ganze Datei wird zurueckgenommen.
-- Zuerst den App-Code zuruecknehmen.

begin;

set local lock_timeout = '3s';

drop policy if exists "kt fassungen lesen"     on storage.objects;
drop policy if exists "kt fassungen hochladen" on storage.objects;
drop policy if exists "kt fassungen ersetzen"  on storage.objects;
drop policy if exists "kt fassungen loeschen"  on storage.objects;
-- Supabase sperrt direktes Loeschen in den Storage-Tabellen (storage.protect_delete); fuer den leeren
-- Bucket wird die Sperre nur in dieser Transaktion geoeffnet.
set local storage.allow_delete_query = 'true';
delete from storage.buckets where id = 'fassungen';

-- Die Leseregel der Fassungen verweist auf die Freigaben, die Freigaben auf die Fassungen: erst die Regel
drop policy if exists "fassungen lesen" on public.kt_deck_fassungen;
drop table if exists public.kt_fassung_freigaben;
drop table if exists public.kt_deck_fassungen;

drop function if exists public.kt_fassung_kurs(uuid);
drop function if exists public.kt_kurs_zugang_von(uuid, uuid);
drop function if exists public.kt_fassung_datei_darf(text, text, text);
drop function if exists public.kt_fassung_datei_stufe(text, text);
drop function if exists public.kt_fassung_stufe(uuid);
drop function if exists public.kt_stufe_rang(text);
drop function if exists public.kt_fassung_geaendert();

delete from public.kt_migrationen where version = '20261113210000';

do $$
begin
  if to_regclass('public.kt_deck_fassungen') is not null or to_regclass('public.kt_fassung_freigaben') is not null then
    raise exception 'KT-RF01: Tabellen noch da';
  end if;
  if exists (select 1 from storage.buckets where id = 'fassungen') then raise exception 'KT-RF02: Bucket noch da'; end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and policyname like 'kt fassungen %') then
    raise exception 'KT-RF03: Bucket-Regeln noch da';
  end if;
end
$$;

commit;
