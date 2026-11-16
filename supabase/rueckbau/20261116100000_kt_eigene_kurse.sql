-- Rueckbau zu supabase/migrations/20261116100000_kt_eigene_kurse.sql
-- Entfernt Startpaket-Bucket, die vier Pruef-Trigger, das Kuerzelformat und das Kennzeichen "im Tool
-- angelegt".
--
-- ZUERST den App-Code zuruecknehmen (Baustein 10): Die App fragt kurse.angelegt_im_tool ab und laedt ohne
-- die Spalte keine Kurse mehr.
--
-- Verweigert, solange es Kurse gibt, die im Tool angelegt sind oder nicht dem Admin gehoeren: Ohne die
-- Trigger koennte ein neuer Kurs wieder die Dateien eines geloeschten uebernehmen, und Kurse anderer
-- Trainer liessen sich mit Dateien loeschen (die dann verwaist der Admin laese). Ebenso, solange im Bucket
-- "kt-vorlagen" Dateien liegen (die lassen sich nur ueber die Storage-API loeschen).

begin;

set local lock_timeout = '3s';
-- Supabase sperrt DELETE auf Storage-Tabellen per Trigger; fuer das Entfernen des leeren Buckets aufheben
set local storage.allow_delete_query = 'true';

do $$
begin
  if exists (select 1 from public.kurse k
             where k.angelegt_im_tool
                or k.besitzer_id not in (select t.id from public.kt_trainer t where t.rolle = 'admin')) then
    raise exception 'Rueckbau verweigert: Es gibt im Tool angelegte Kurse oder Kurse anderer Trainer.';
  end if;
  if exists (select 1 from storage.objects where bucket_id = 'kt-vorlagen') then
    raise exception 'Rueckbau verweigert: Im Bucket kt-vorlagen liegen noch Dateien (erst ueber die Storage-API loeschen).';
  end if;
end
$$;

drop policy "kt vorlagen lesen" on storage.objects;
drop policy "kt vorlagen hochladen" on storage.objects;
drop policy "kt vorlagen ersetzen" on storage.objects;
drop policy "kt vorlagen loeschen" on storage.objects;
delete from storage.buckets where id = 'kt-vorlagen';

drop trigger kt_kurstage_pfade_pruefen on public.kurstage;
drop function public.kt_kurstage_pfade_pruefen();
drop trigger kt_kurse_loeschen_pruefen on public.kurse;
drop function public.kt_kurse_loeschen_pruefen();
drop trigger kt_kurse_kuerzel_frei on public.kurse;
drop function public.kt_kurse_kuerzel_frei();
drop trigger kt_kurse_pruefen on public.kurse;
drop function public.kt_kurse_pruefen();

alter table public.kurse drop constraint kurse_kuerzel_format;
alter table public.kurse drop column angelegt_im_tool;

delete from public.kt_migrationen where version = '20261116100000';

do $$
begin
  if exists (select 1 from storage.buckets where id = 'kt-vorlagen')
     or exists (select 1 from pg_policies where schemaname = 'storage' and policyname like 'kt vorlagen %')
     or exists (select 1 from pg_trigger where tgname in ('kt_kurse_pruefen', 'kt_kurse_kuerzel_frei', 'kt_kurse_loeschen_pruefen', 'kt_kurstage_pfade_pruefen'))
     or exists (select 1 from pg_constraint where conname = 'kurse_kuerzel_format')
     or exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'kurse' and column_name = 'angelegt_im_tool') then
    raise exception 'Rueckbau unvollstaendig';
  end if;
end
$$;

commit;
