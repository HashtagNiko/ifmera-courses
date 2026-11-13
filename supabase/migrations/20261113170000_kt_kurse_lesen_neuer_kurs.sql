-- Baustein 1, Korrektur zu Schritt C: Ein neu angelegter Kurs ist fuer seinen Besitzer sofort lesbar.
--
-- Fehler (gefunden 13.11.2026 beim erneuten Lauf des Tests zu Schritt A, T14): Legt Niko einen neuen Kurs
-- an und liest ihn in derselben Anweisung zurueck (so macht es scripts/sync-decks.mjs:
-- upsert(...).select('id')), meldet die Datenbank "new row violates row-level security policy".
-- Grund: Die Leseregel fragt kt_kurs_stufe(id), und diese Funktion sieht die gerade eingefuegte Zeile
-- noch nicht (Momentaufnahme vom Anfang der Anweisung). Bestehende Kurse waren nicht betroffen.
--
-- Korrektur: Der Besitzer wird zusaetzlich direkt an der Zeile erkannt. Inhaltlich gleich wie bisher
-- (wer Besitzer ist, durfte immer lesen); es kommt kein neues Leserecht hinzu.
--
-- Rueckbau: supabase/rueckbau/20261113170000_kt_kurse_lesen_neuer_kurs.sql

begin;

set local lock_timeout = '3s';

drop policy "kt kurse lesen" on public.kurse;

create policy "kt kurse lesen" on public.kurse
  for select to authenticated
  using ((besitzer_id = auth.uid() and public.kt_ist_trainer()) or public.kt_kurs_stufe(id) is not null);

insert into public.kt_migrationen (version, name)
values ('20261113170000', 'kt_kurse_lesen_neuer_kurs');

do $$
declare n int;
begin
  select count(*) into n from pg_policies
  where schemaname = 'public' and tablename = 'kurse' and policyname = 'kt kurse lesen'
    and qual like '%besitzer_id = auth.uid()%' and qual like '%kt_kurs_stufe(id)%';
  if n <> 1 then raise exception 'KT-K01: neue Leseregel fuer kurse nicht wie erwartet'; end if;

  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'kurse';
  if n <> 4 then raise exception 'KT-K02: erwartet 4 Regeln auf kurse, gefunden %', n; end if;
end
$$;

commit;
