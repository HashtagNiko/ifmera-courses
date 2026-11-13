-- Baustein 1, Schritt C (ersetzend, GELB: nur nach Nikos "ja"): Regeln nach Besitz und Freigabe.
--
-- Voraussetzung: Schritt A (20261113150000) ist eingespielt, und die App fragt kt_trainer statt
-- kurs_zugriff (live seit Baustein 1, Schritt B). Sonst zeigt die App nach dieser Datei "Kein Zugriff".
--
-- Was sich aendert:
--   * Die alten Regeln ("wer in kurs_zugriff steht, darf alles") werden durch Regeln nach Besitz und
--     Freigabe ersetzt:
--       kurse, kurstage      lesen: Besitzer und Freigabe ab "nutzen"; schreiben/loeschen: Besitzer
--       durchlaeufe          alles: Besitzer (gemeinsame Durchlaeufe kommen in Baustein 5)
--       fortschritt          alles: Besitzer des Durchlaufs
--       Bucket decks         lesen: Besitzer und Freigabe ab "nutzen", Unterordner quellen/ ab
--                            "fassung"; schreiben/loeschen: Besitzer. Dateien ohne Kurs (z. B. nach
--                            dem Loeschen eines Kurses) darf der Admin loeschen.
--   * Loeschen ist damit fuer Besitzer erlaubt. Die Datei 20260912100000_loeschrechte.sql wurde nie
--     eingespielt und geht hierin auf.
--   * kurs_zugriff und hat_kurszugriff() entfallen (Inhalt steht in kt_trainer).
--   * anon verliert alle Rechte auf die Tabellen; authenticated behaelt nur lesen/anlegen/aendern/loeschen.
--
-- Fuer Niko aendert sich nichts: Er besitzt alle Kurse und Durchlaeufe. Der Deck-Sync und der
-- Tagebuch-Import laufen unter seinem Login und schreiben nur in seine Kurse.
--
-- Rueckbau: supabase/rueckbau/20261113160000_kt_regeln_nach_besitz.sql

begin;

-- Regeln auf storage.objects zu ersetzen sperrt die Tabelle kurz. Muss die Datei warten, bricht sie
-- nach 3 Sekunden ab (und aendert nichts), statt andere aufzuhalten.
set local lock_timeout = '3s';

-- ---------------------------------------------------------------------------
-- Neue Hilfsfunktion: Durchlauf des Angemeldeten?
-- ---------------------------------------------------------------------------
create function public.kt_ist_durchlaufbesitzer(p_durchlauf_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.kt_ist_trainer() and exists (
    select 1 from public.durchlaeufe d where d.id = p_durchlauf_id and d.besitzer_id = auth.uid()
  );
$$;
revoke execute on function public.kt_ist_durchlaufbesitzer(uuid) from public, anon;
grant  execute on function public.kt_ist_durchlaufbesitzer(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Alte Regeln entfernen
-- ---------------------------------------------------------------------------
drop policy "kurse lesen"          on public.kurse;
drop policy "kurse anlegen"        on public.kurse;
drop policy "kurse aendern"        on public.kurse;
drop policy "kurstage lesen"       on public.kurstage;
drop policy "kurstage anlegen"     on public.kurstage;
drop policy "kurstage aendern"     on public.kurstage;
drop policy "durchlaeufe lesen"    on public.durchlaeufe;
drop policy "durchlaeufe anlegen"  on public.durchlaeufe;
drop policy "durchlaeufe aendern"  on public.durchlaeufe;
drop policy "durchlaeufe loeschen" on public.durchlaeufe;
drop policy "fortschritt lesen"    on public.fortschritt;
drop policy "fortschritt anlegen"  on public.fortschritt;
drop policy "fortschritt aendern"  on public.fortschritt;
drop policy "eigenen zugriff lesen" on public.kurs_zugriff;
drop policy "decks lesen"          on storage.objects;
drop policy "decks hochladen"      on storage.objects;
drop policy "decks ersetzen"       on storage.objects;

drop function public.hat_kurszugriff();
drop table public.kurs_zugriff;

-- ---------------------------------------------------------------------------
-- Kurse
-- ---------------------------------------------------------------------------
create policy "kt kurse lesen" on public.kurse
  for select to authenticated
  using (public.kt_kurs_stufe(id) is not null);

create policy "kt kurse anlegen" on public.kurse
  for insert to authenticated
  with check (public.kt_ist_trainer() and besitzer_id = auth.uid());

-- Der Besitz laesst sich nicht weitergeben: auch nach dem Aendern muss der Kurs dem Aendernden gehoeren.
create policy "kt kurse aendern" on public.kurse
  for update to authenticated
  using (public.kt_ist_kursbesitzer(id))
  with check (public.kt_ist_trainer() and besitzer_id = auth.uid());

create policy "kt kurse loeschen" on public.kurse
  for delete to authenticated
  using (public.kt_ist_kursbesitzer(id));

-- ---------------------------------------------------------------------------
-- Kurstage
-- ---------------------------------------------------------------------------
create policy "kt kurstage lesen" on public.kurstage
  for select to authenticated
  using (public.kt_kurs_stufe(kurs_id) is not null);

create policy "kt kurstage anlegen" on public.kurstage
  for insert to authenticated
  with check (public.kt_ist_kursbesitzer(kurs_id));

create policy "kt kurstage aendern" on public.kurstage
  for update to authenticated
  using (public.kt_ist_kursbesitzer(kurs_id))
  with check (public.kt_ist_kursbesitzer(kurs_id));

create policy "kt kurstage loeschen" on public.kurstage
  for delete to authenticated
  using (public.kt_ist_kursbesitzer(kurs_id));

-- ---------------------------------------------------------------------------
-- Durchlaeufe: gehoeren ihrem Besitzer. Anlegen nur zu Kursen, die man sehen darf.
-- ---------------------------------------------------------------------------
create policy "kt durchlaeufe lesen" on public.durchlaeufe
  for select to authenticated
  using (public.kt_ist_trainer() and besitzer_id = auth.uid());

create policy "kt durchlaeufe anlegen" on public.durchlaeufe
  for insert to authenticated
  with check (public.kt_ist_trainer() and besitzer_id = auth.uid() and public.kt_kurs_stufe(kurs_id) is not null);

create policy "kt durchlaeufe aendern" on public.durchlaeufe
  for update to authenticated
  using (public.kt_ist_trainer() and besitzer_id = auth.uid())
  with check (public.kt_ist_trainer() and besitzer_id = auth.uid() and public.kt_kurs_stufe(kurs_id) is not null);

create policy "kt durchlaeufe loeschen" on public.durchlaeufe
  for delete to authenticated
  using (public.kt_ist_trainer() and besitzer_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Fortschritt (Haken): gehoert zum Durchlauf
-- ---------------------------------------------------------------------------
create policy "kt fortschritt lesen" on public.fortschritt
  for select to authenticated
  using (public.kt_ist_durchlaufbesitzer(durchlauf_id));

create policy "kt fortschritt anlegen" on public.fortschritt
  for insert to authenticated
  with check (public.kt_ist_durchlaufbesitzer(durchlauf_id));

create policy "kt fortschritt aendern" on public.fortschritt
  for update to authenticated
  using (public.kt_ist_durchlaufbesitzer(durchlauf_id))
  with check (public.kt_ist_durchlaufbesitzer(durchlauf_id));

create policy "kt fortschritt loeschen" on public.fortschritt
  for delete to authenticated
  using (public.kt_ist_durchlaufbesitzer(durchlauf_id));

-- ---------------------------------------------------------------------------
-- Bucket decks: erster Ordner = Kurs-Kuerzel
-- ---------------------------------------------------------------------------
create policy "kt decks lesen" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'decks'
    and public.kt_kurs_stufe_mindestens(
      public.kt_kurs_id((storage.foldername(name))[1]),
      case when (storage.foldername(name))[2] = 'quellen' then 'fassung' else 'nutzen' end
    )
  );

create policy "kt decks hochladen" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'decks' and public.kt_ist_kursbesitzer(public.kt_kurs_id((storage.foldername(name))[1])));

create policy "kt decks ersetzen" on storage.objects
  for update to authenticated
  using (bucket_id = 'decks' and public.kt_ist_kursbesitzer(public.kt_kurs_id((storage.foldername(name))[1])))
  with check (bucket_id = 'decks' and public.kt_ist_kursbesitzer(public.kt_kurs_id((storage.foldername(name))[1])));

create policy "kt decks loeschen" on storage.objects
  for delete to authenticated
  using (bucket_id = 'decks' and public.kt_ist_kursbesitzer(public.kt_kurs_id((storage.foldername(name))[1])));

-- Dateien, deren erster Ordner zu keinem Kurs gehoert (alte Testdateien, Reste geloeschter Kurse),
-- kaemen sonst nie wieder weg. Lesen und loeschen darf sie der Admin.
create policy "kt decks verwaiste lesen" on storage.objects
  for select to authenticated
  using (bucket_id = 'decks' and public.kt_ist_admin() and public.kt_kurs_id((storage.foldername(name))[1]) is null);

create policy "kt decks verwaiste loeschen" on storage.objects
  for delete to authenticated
  using (bucket_id = 'decks' and public.kt_ist_admin() and public.kt_kurs_id((storage.foldername(name))[1]) is null);

-- ---------------------------------------------------------------------------
-- Rechte auf Tabellenebene aufraeumen
-- ---------------------------------------------------------------------------
revoke all on public.kurse, public.kurstage, public.durchlaeufe, public.fortschritt from anon;
revoke truncate, references, trigger on public.kurse, public.kurstage, public.durchlaeufe, public.fortschritt
  from authenticated;

-- ---------------------------------------------------------------------------
-- Protokoll-Eintrag und Selbstpruefung
-- ---------------------------------------------------------------------------
insert into public.kt_migrationen (version, name)
values ('20261113160000', 'kt_regeln_nach_besitz');

do $$
declare n int;
begin
  if to_regclass('public.kurs_zugriff') is not null then raise exception 'KT-C01: kurs_zugriff noch da'; end if;
  if to_regprocedure('public.hat_kurszugriff()') is not null then raise exception 'KT-C02: hat_kurszugriff noch da'; end if;

  select count(*) into n from pg_policies
  where (schemaname = 'public' and tablename in ('kurse', 'kurstage', 'durchlaeufe', 'fortschritt'))
     or (schemaname = 'storage' and tablename = 'objects' and policyname like 'decks %');
  if n <> 16 then raise exception 'KT-C03: erwartet 16 Regeln (4 je Tabelle, keine alten im Bucket), gefunden %', n; end if;

  select count(*) into n from pg_policies
  where schemaname = 'public' and tablename in ('kurse', 'kurstage', 'durchlaeufe', 'fortschritt')
    and policyname not like 'kt %';
  if n <> 0 then raise exception 'KT-C04: % alte Regeln auf den Tabellen uebrig', n; end if;

  select count(*) into n from pg_policies
  where schemaname = 'storage' and tablename = 'objects' and policyname like 'kt decks %';
  if n <> 6 then raise exception 'KT-C05: erwartet 6 Bucket-Regeln, gefunden %', n; end if;

  select count(*) into n from pg_policies
  where coalesce(qual, '') || coalesce(with_check, '') like '%hat_kurszugriff%';
  if n <> 0 then raise exception 'KT-C06: % Regeln verweisen noch auf hat_kurszugriff', n; end if;

  select count(*) into n from information_schema.role_table_grants
  where grantee = 'anon' and table_schema = 'public'
    and (table_name in ('kurse', 'kurstage', 'durchlaeufe', 'fortschritt') or table_name like 'kt\_%');
  if n <> 0 then raise exception 'KT-C07: anon hat noch % Rechte', n; end if;

  select count(*) into n from information_schema.role_table_grants
  where grantee = 'authenticated' and table_schema = 'public'
    and table_name in ('kurse', 'kurstage', 'durchlaeufe', 'fortschritt')
    and privilege_type not in ('SELECT', 'INSERT', 'UPDATE', 'DELETE');
  if n <> 0 then raise exception 'KT-C08: authenticated hat noch % unnoetige Rechte', n; end if;

  if has_function_privilege('anon', 'public.kt_ist_durchlaufbesitzer(uuid)', 'execute') then
    raise exception 'KT-C09: anon darf kt_ist_durchlaufbesitzer ausfuehren';
  end if;

  select count(*) into n from public.kt_trainer where rolle = 'admin' and aktiv;
  if n <> 1 then raise exception 'KT-C10: erwartet 1 aktiven Admin, gefunden %', n; end if;
end
$$;

commit;
