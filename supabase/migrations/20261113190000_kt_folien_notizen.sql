-- Baustein 3 (hinzufuegend): eigene Notizen zu jeder Folie.
--
-- kt_folien_notizen: Notiz und Aktion eines Trainers zu einer Folie eines Kurstags. Sie liegen neben dem
-- Deck; das Deck selbst aendert sich nie. Beim Oeffnen setzt die App sie in die Kopie im Browser ein, das
-- Cockpit zeigt sie statt der Original-Notizen.
--
-- Welche Folie gemeint ist, sagt folie_schluessel. Annahme (SPEC.md, Baustein 3): Ohne feste Folien-IDs in
-- den Quellen ist das der Folientitel samt laufender Nummer bei gleichen Titeln ("t:willkommen#1"); hat
-- eine Folie spaeter ein data-id, gilt das ("id:..."). Aendert sich ein Titel, findet die Notiz ihre Folie
-- nicht mehr und erscheint als "ohne Folie"; sie geht nicht verloren.
--
-- Rechte: Jeder sieht und aendert nur seine eigenen Notizen. Anlegen und aendern nur bei Stufe "notizen"
-- oder mehr fuer den Kurs (der Besitzer hat immer genug).
--
-- Rueckbau: supabase/rueckbau/20261113190000_kt_folien_notizen.sql

begin;

set local lock_timeout = '3s';

create table public.kt_folien_notizen (
  id               uuid primary key default gen_random_uuid(),
  trainer_id       uuid not null default auth.uid() references public.kt_trainer (id) on delete cascade,
  kurstag_id       uuid not null references public.kurstage (id) on delete cascade,
  folie_schluessel text not null check (char_length(folie_schluessel) between 1 and 300),
  -- Titel und Nummer zum Zeitpunkt des Speicherns, fuer Notizen, deren Folie es nicht mehr gibt
  folie_titel      text check (char_length(folie_titel) <= 300),
  folie_nr         int,
  notiz            text not null default '' check (char_length(notiz) <= 8000),
  aktion           text not null default '' check (char_length(aktion) <= 4000),
  geaendert_am     timestamptz not null default now(),
  unique (trainer_id, kurstag_id, folie_schluessel)
);
create index kt_folien_notizen_tag_idx on public.kt_folien_notizen (kurstag_id);

alter table public.kt_folien_notizen enable row level security;
revoke all on public.kt_folien_notizen from anon, authenticated;
grant select, insert, update, delete on public.kt_folien_notizen to authenticated;

comment on table public.kt_folien_notizen is
  'Eigene Notizen eines Trainers je Folie. Jeder sieht nur seine eigenen; das Deck bleibt unveraendert.';

create function public.kt_notiz_geaendert()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.geaendert_am := now();
  return new;
end;
$$;
revoke execute on function public.kt_notiz_geaendert() from public, anon, authenticated;

create trigger kt_notiz_geaendert
  before update on public.kt_folien_notizen
  for each row execute function public.kt_notiz_geaendert();

-- Lesen und loeschen: nur die eigenen
create policy "notizen lesen" on public.kt_folien_notizen
  for select to authenticated
  using (trainer_id = auth.uid() and public.kt_ist_trainer());

create policy "notizen loeschen" on public.kt_folien_notizen
  for delete to authenticated
  using (trainer_id = auth.uid() and public.kt_ist_trainer());

-- Anlegen und aendern: die eigenen, und nur mit Stufe "notizen" oder mehr fuer den Kurs des Tages
create policy "notizen anlegen" on public.kt_folien_notizen
  for insert to authenticated
  with check (
    trainer_id = auth.uid() and public.kt_ist_trainer()
    and public.kt_kurs_stufe_mindestens(
      (select t.kurs_id from public.kurstage t where t.id = kurstag_id), 'notizen')
  );

create policy "notizen aendern" on public.kt_folien_notizen
  for update to authenticated
  using (trainer_id = auth.uid() and public.kt_ist_trainer())
  with check (
    trainer_id = auth.uid() and public.kt_ist_trainer()
    and public.kt_kurs_stufe_mindestens(
      (select t.kurs_id from public.kurstage t where t.id = kurstag_id), 'notizen')
  );

insert into public.kt_migrationen (version, name)
values ('20261113190000', 'kt_folien_notizen');

do $$
declare n int;
begin
  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.kt_folien_notizen'::regclass) then
    raise exception 'KT-N01: RLS fehlt';
  end if;
  if has_table_privilege('anon', 'public.kt_folien_notizen', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
    raise exception 'KT-N02: anon hat Rechte';
  end if;
  if has_table_privilege('authenticated', 'public.kt_folien_notizen', 'TRUNCATE,REFERENCES,TRIGGER') then
    raise exception 'KT-N03: authenticated hat unnoetige Rechte';
  end if;
  select count(*) into n from pg_policies where schemaname = 'public' and tablename = 'kt_folien_notizen';
  if n <> 4 then raise exception 'KT-N04: erwartet 4 Regeln, gefunden %', n; end if;
  if has_function_privilege('authenticated', 'public.kt_notiz_geaendert()', 'execute') then
    raise exception 'KT-N05: Triggerfunktion ist aufrufbar';
  end if;
end
$$;

commit;
