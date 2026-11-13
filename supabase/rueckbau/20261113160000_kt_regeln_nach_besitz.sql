-- Rueckbau zu supabase/migrations/20261113160000_kt_regeln_nach_besitz.sql
--
-- Stellt die alten Regeln wieder her ("wer in kurs_zugriff steht, darf alles", Stand vor dem
-- 13.11.2026, ohne die nie eingespielten Loeschrechte vom 12.09.2026). kurs_zugriff wird aus dem
-- Admin in kt_trainer neu befuellt. Die Rechte fuer anon werden bewusst NICHT zurueckgegeben; die
-- alten Regeln liessen anon ohnehin nichts lesen oder schreiben.
--
-- Die App (ab Baustein 1, Schritt B) fragt kt_trainer und funktioniert mit beiden Regelstaenden.
-- Vorher sichern (supabase/sicherung.sql), siehe CLAUDE.md §4 Nr. 4.

begin;

set local lock_timeout = '3s';

-- neue Regeln entfernen
drop policy if exists "kt kurse lesen"              on public.kurse;
drop policy if exists "kt kurse anlegen"            on public.kurse;
drop policy if exists "kt kurse aendern"            on public.kurse;
drop policy if exists "kt kurse loeschen"           on public.kurse;
drop policy if exists "kt kurstage lesen"           on public.kurstage;
drop policy if exists "kt kurstage anlegen"         on public.kurstage;
drop policy if exists "kt kurstage aendern"         on public.kurstage;
drop policy if exists "kt kurstage loeschen"        on public.kurstage;
drop policy if exists "kt durchlaeufe lesen"        on public.durchlaeufe;
drop policy if exists "kt durchlaeufe anlegen"      on public.durchlaeufe;
drop policy if exists "kt durchlaeufe aendern"      on public.durchlaeufe;
drop policy if exists "kt durchlaeufe loeschen"     on public.durchlaeufe;
drop policy if exists "kt fortschritt lesen"        on public.fortschritt;
drop policy if exists "kt fortschritt anlegen"      on public.fortschritt;
drop policy if exists "kt fortschritt aendern"      on public.fortschritt;
drop policy if exists "kt fortschritt loeschen"     on public.fortschritt;
drop policy if exists "kt decks lesen"              on storage.objects;
drop policy if exists "kt decks hochladen"          on storage.objects;
drop policy if exists "kt decks ersetzen"           on storage.objects;
drop policy if exists "kt decks loeschen"           on storage.objects;
drop policy if exists "kt decks verwaiste lesen"    on storage.objects;
drop policy if exists "kt decks verwaiste loeschen" on storage.objects;

drop function if exists public.kt_ist_durchlaufbesitzer(uuid);

-- kurs_zugriff und hat_kurszugriff wie in 20260818120000_kurs_tool_init.sql
create table public.kurs_zugriff (
  trainer_id  uuid primary key references auth.users(id) on delete cascade,
  angelegt_am timestamptz not null default now()
);
alter table public.kurs_zugriff enable row level security;
comment on table public.kurs_zugriff is
  'Wer hier steht, darf die Trainer-Oberflaeche des Kurs-Tools nutzen. Pflege ueber das Dashboard.';
insert into public.kurs_zugriff (trainer_id)
select t.id from public.kt_trainer t where t.rolle = 'admin';

create policy "eigenen zugriff lesen" on public.kurs_zugriff
  for select to authenticated
  using (trainer_id = auth.uid());

create or replace function public.hat_kurszugriff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.kurs_zugriff z where z.trainer_id = auth.uid()
  );
$$;

-- alte Regeln wie vor dem 13.11.2026
create policy "kurse lesen" on public.kurse
  for select to authenticated using (public.hat_kurszugriff());
create policy "kurse anlegen" on public.kurse
  for insert to authenticated with check (public.hat_kurszugriff());
create policy "kurse aendern" on public.kurse
  for update to authenticated
  using (public.hat_kurszugriff()) with check (public.hat_kurszugriff());

create policy "kurstage lesen" on public.kurstage
  for select to authenticated using (public.hat_kurszugriff());
create policy "kurstage anlegen" on public.kurstage
  for insert to authenticated with check (public.hat_kurszugriff());
create policy "kurstage aendern" on public.kurstage
  for update to authenticated
  using (public.hat_kurszugriff()) with check (public.hat_kurszugriff());

create policy "durchlaeufe lesen" on public.durchlaeufe
  for select to authenticated using (public.hat_kurszugriff());
create policy "durchlaeufe anlegen" on public.durchlaeufe
  for insert to authenticated with check (public.hat_kurszugriff());
create policy "durchlaeufe aendern" on public.durchlaeufe
  for update to authenticated
  using (public.hat_kurszugriff()) with check (public.hat_kurszugriff());
create policy "durchlaeufe loeschen" on public.durchlaeufe
  for delete to authenticated using (public.hat_kurszugriff());

create policy "fortschritt lesen" on public.fortschritt
  for select to authenticated using (public.hat_kurszugriff());
create policy "fortschritt anlegen" on public.fortschritt
  for insert to authenticated with check (public.hat_kurszugriff());
create policy "fortschritt aendern" on public.fortschritt
  for update to authenticated
  using (public.hat_kurszugriff()) with check (public.hat_kurszugriff());

create policy "decks lesen" on storage.objects
  for select to authenticated
  using (bucket_id = 'decks' and public.hat_kurszugriff());
create policy "decks hochladen" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'decks' and public.hat_kurszugriff());
create policy "decks ersetzen" on storage.objects
  for update to authenticated
  using (bucket_id = 'decks' and public.hat_kurszugriff())
  with check (bucket_id = 'decks' and public.hat_kurszugriff());

delete from public.kt_migrationen where version = '20261113160000';

do $$
declare n int;
begin
  select count(*) into n from pg_policies
  where schemaname = 'public' and tablename in ('kurse', 'kurstage', 'durchlaeufe', 'fortschritt', 'kurs_zugriff');
  if n <> 14 then raise exception 'KT-RC01: erwartet 14 alte Regeln, gefunden %', n; end if;
  select count(*) into n from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'decks %';
  if n <> 3 then raise exception 'KT-RC02: erwartet 3 alte Bucket-Regeln, gefunden %', n; end if;
  select count(*) into n from public.kurs_zugriff;
  if n <> 1 then raise exception 'KT-RC03: kurs_zugriff hat % Zeilen statt 1', n; end if;
end
$$;

commit;
